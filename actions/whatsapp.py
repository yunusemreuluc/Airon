"""
WhatsApp mesaj gönderme — Windows için WhatsApp Desktop URI scheme veya Web.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
import re
import subprocess
import time
import unicodedata
import urllib.parse
import webbrowser
from pathlib import Path

from memory.memory_manager import load_memory, update_memory
from actions.tool_result import fail, ok
from core.tool_registry import register_tool

try:
    import pyperclip
    HAS_PYPERCLIP = True
except ImportError:
    HAS_PYPERCLIP = False

try:
    import pyautogui
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False

_user32 = ctypes.WinDLL("user32", use_last_error=True)
_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
# HWND'ler pointer-sized olduğundan 64-bit'te varsayılan c_int restype ile kesilebilir —
# argtypes/restype'ı açıkça belirtmek bunu önler.
_user32.GetForegroundWindow.restype = wintypes.HWND
_user32.SetForegroundWindow.argtypes = [wintypes.HWND]
_user32.SetForegroundWindow.restype = wintypes.BOOL
_user32.BringWindowToTop.argtypes = [wintypes.HWND]
_user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
_user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
_user32.GetWindowThreadProcessId.restype = wintypes.DWORD
_user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
_user32.AttachThreadInput.restype = wintypes.BOOL
_kernel32.GetCurrentThreadId.restype = wintypes.DWORD


AUTO_SEND_DELAY_SECONDS = 2.4
# WhatsApp penceresinin açılıp aktif hale gelmesi için azami bekleme süresi.
# Cold start (uygulama kapalıyken ilk açılış) ölçümde ~5sn sürdüğü görüldü,
# bu yüzden sabit sleep yerine _wait_for_whatsapp_window() ile pencere gerçekten
# hazır olana kadar poll edilir; bu süre sadece üst sınırdır.
DESKTOP_LOAD_DELAY = 10.0
WEB_LOAD_DELAY = 6.5
BASE_DIR = Path(__file__).resolve().parent.parent
PHONEBOOK_FILE = BASE_DIR / "memory" / "phone_book.json"
PREFERRED_BROWSERS = ["chrome", "msedge", "firefox"]


def _normalize_phone(phone_number: str) -> str:
    digits = re.sub(r"\D+", "", phone_number or "")
    if len(digits) == 11 and digits.startswith("0"):
        digits = "90" + digits[1:]
    elif len(digits) == 10:
        digits = "90" + digits
    if len(digits) < 8 or len(digits) > 15:
        raise ValueError(
            "Telefon numarası uluslararası formatta olmalı. "
            "Örn: +905551112233"
        )
    return digits


def _normalize_lookup(text: str) -> str:
    text = (text or "").strip().casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ı", "i")
    text = re.sub(r"\s+", " ", text)
    return text


def _contact_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", _normalize_lookup(name)).strip("_") or "contact"


def _load_contacts() -> dict:
    memory = load_memory()
    contacts = memory.get("whatsapp_contacts", {})
    return contacts if isinstance(contacts, dict) else {}


def _load_phone_book() -> dict:
    try:
        if PHONEBOOK_FILE.exists():
            return json.loads(PHONEBOOK_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_phone_book(phone_book: dict):
    PHONEBOOK_FILE.parent.mkdir(parents=True, exist_ok=True)
    PHONEBOOK_FILE.write_text(
        json.dumps(phone_book, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _contact_candidates() -> list[dict]:
    candidates = []
    for source_name, source in (("whatsapp", _load_contacts()), ("phone_book", _load_phone_book())):
        if not isinstance(source, dict):
            continue
        for key, entry in source.items():
            if not isinstance(entry, dict):
                continue
            item = dict(entry)
            item.setdefault("display_name", key)
            item["_source"] = source_name
            item["_key"] = key
            candidates.append(item)
    return candidates


def _match_score(needle: str, candidate: str) -> int:
    candidate_norm = _normalize_lookup(candidate)
    if not candidate_norm:
        return 0
    if candidate_norm == needle:
        return 300
    if candidate_norm.startswith(needle) or needle.startswith(candidate_norm):
        return 220
    if needle in candidate_norm:
        return 160
    needle_parts = needle.split()
    if needle_parts and all(part in candidate_norm for part in needle_parts):
        return 120
    return 0


def _find_contact(recipient_name: str) -> dict | None:
    needle = _normalize_lookup(recipient_name)
    if not needle:
        return None

    best_match = None
    best_score = 0
    for entry in _contact_candidates():
        names = [entry.get("display_name", ""), entry.get("_key", "")]
        aliases = entry.get("aliases", [])
        if isinstance(aliases, list):
            names.extend(str(alias) for alias in aliases)
        elif aliases:
            names.append(str(aliases))

        for name in names:
            score = _match_score(needle, name)
            if score > best_score:
                best_score = score
                best_match = entry

    return best_match


@register_tool("save_whatsapp_contact")
def save_whatsapp_contact(display_name: str, phone_number: str, aliases: str = "") -> dict:
    if not display_name or not display_name.strip():
        return fail("Kişi adı boş olamaz.")

    try:
        normalized_phone = _normalize_phone(phone_number)
    except ValueError as exc:
        return fail(str(exc))

    alias_list = []
    if aliases and aliases.strip():
        alias_list = [part.strip() for part in aliases.split(",") if part.strip()]

    key = _contact_key(display_name)
    update_memory(
        {
            "whatsapp_contacts": {
                key: {
                    "value": f"+{normalized_phone}",
                    "display_name": display_name.strip(),
                    "aliases": alias_list,
                }
            }
        }
    )

    if alias_list:
        return ok(
            f"{display_name.strip()} WhatsApp kişilerine kaydedildi. Takma adlar: {', '.join(alias_list)}",
            display_name=display_name.strip(), phone=normalized_phone,
        )
    return ok(f"{display_name.strip()} WhatsApp kişilerine kaydedildi.", display_name=display_name.strip(), phone=normalized_phone)


def _copy_to_clipboard(text: str) -> None:
    if HAS_PYPERCLIP:
        pyperclip.copy(text)
        return
    # PowerShell fallback
    safe = text.replace("'", "`'")
    subprocess.run(
        ["powershell", "-Command", f"Set-Clipboard -Value '{safe}'"],
        check=True, timeout=5,
    )


def _open_url(url: str) -> None:
    webbrowser.open(url)


def _open_whatsapp_desktop_via_scheme(phone_number: str, message: str, include_text: bool = True) -> tuple[bool, str]:
    if include_text and message.strip():
        url = f"whatsapp://send?phone={phone_number}&text={urllib.parse.quote(message.strip())}"
    else:
        url = f"whatsapp://send?phone={phone_number}"
    try:
        # os.startfile protokol şemasını cmd penceresi açmadan güvenilir başlatır
        os.startfile(url)  # type: ignore[attr-defined]
    except Exception:
        try:
            subprocess.run(["cmd", "/c", "start", "", url], timeout=10)
        except Exception as exc:
            return False, f"WhatsApp Desktop açılamadı: {exc}"
    return True, "WhatsApp Desktop sohbeti açıldı."


def _open_whatsapp_web(phone_number: str, message: str, include_text: bool = True) -> tuple[bool, str]:
    if include_text and message.strip():
        url = f"https://web.whatsapp.com/send?phone={phone_number}&text={urllib.parse.quote(message.strip())}"
    else:
        url = f"https://web.whatsapp.com/send?phone={phone_number}"
    try:
        _open_url(url)
    except Exception as exc:
        return False, f"WhatsApp Web açılamadı: {exc}"
    return True, "web tarayıcı"


def _force_foreground(hwnd: int) -> bool:
    """
    SetForegroundWindow arka plandaki bir Python sürecinden çağrılınca Windows'un
    "foreground kilidi" kısıtlaması yüzünden çoğu zaman sessizce başarısız olur
    (pygetwindow'un .activate() metodu da aynı sorunu yaşar, üstüne bir de Windows'un
    GetLastError()=0 döndürdüğü başarılı durumları bile hatalıymış gibi exception
    fırlatır). Hedef pencerenin ait olduğu thread'e geçici olarak girdi kuyruğuyla
    bağlanmak (AttachThreadInput) bu kısıtlamayı atlatmanın standart yöntemi.
    """
    SW_RESTORE = 9
    try:
        fg_hwnd = _user32.GetForegroundWindow()
        target_thread = _user32.GetWindowThreadProcessId(hwnd, None)
        cur_thread = _kernel32.GetCurrentThreadId()
        fg_thread = _user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0

        if fg_thread and fg_thread != cur_thread:
            _user32.AttachThreadInput(cur_thread, fg_thread, True)
        if target_thread and target_thread != cur_thread:
            _user32.AttachThreadInput(cur_thread, target_thread, True)
        try:
            _user32.ShowWindow(hwnd, SW_RESTORE)
            _user32.BringWindowToTop(hwnd)
            _user32.SetForegroundWindow(hwnd)
        finally:
            if fg_thread and fg_thread != cur_thread:
                _user32.AttachThreadInput(cur_thread, fg_thread, False)
            if target_thread and target_thread != cur_thread:
                _user32.AttachThreadInput(cur_thread, target_thread, False)
        return _user32.GetForegroundWindow() == hwnd
    except Exception:
        return False


def _wait_for_whatsapp_window(timeout: float):
    """
    WhatsApp penceresi belirip aktif hale gelene kadar poll eder (sabit sleep yerine).
    Bulunca pygetwindow'un pencere nesnesini döner, süre dolarsa None.
    """
    try:
        import pygetwindow as gw  # pyautogui ile birlikte gelir
    except Exception:
        return None

    deadline = time.time() + timeout
    candidate = None
    while time.time() < deadline:
        try:
            matches = [
                w for w in gw.getAllWindows()
                if "whatsapp" in (w.title or "").lower() and w.visible
            ]
        except Exception:
            matches = []
        if matches:
            candidate = matches[0]
            active = gw.getActiveWindow()
            if active is not None and "whatsapp" in (active.title or "").lower():
                return candidate  # zaten aktif — beklemeye gerek yok
        time.sleep(0.25)
    return candidate  # bulundu ama hiç aktif olmadıysa yine de deneyelim


def _focus_whatsapp_window(timeout: float) -> bool:
    """WhatsApp penceresini bekler ve foreground'a zorlar. Başarılıysa True döner."""
    win = _wait_for_whatsapp_window(timeout)
    if win is None:
        return False
    try:
        if win.isMinimized:
            win.restore()
    except Exception:
        pass
    return _force_foreground(win._hWnd)


def _type_and_send(message: str, load_delay: float) -> tuple[bool, str]:
    """
    Sohbet açıldıktan sonra mesajı panodan yapıştırıp gönderir.
    URL ön-doldurmasına güvenmez: pencereyi öne getirir, metni Ctrl+V ile yazar,
    sonra Enter'a basar. Bu yüzden çağırmadan önce sohbet 'text' olmadan açılmalı.
    """
    if not HAS_PYAUTOGUI:
        return False, "pyautogui kurulu değil — otomatik gönderim yapılamadı."
    try:
        focused = _focus_whatsapp_window(load_delay)
        if not focused:
            return False, (
                "WhatsApp penceresi zamanında bulunup öne getirilemedi "
                "(pencere hazır değildi ya da odak zorlanamadı)."
            )
        time.sleep(0.4)                 # pencere öne geldikten sonra sohbetin oturması için kısa pay
        _copy_to_clipboard(message.strip())
        time.sleep(0.3)
        pyautogui.hotkey("ctrl", "v")   # mesajı mesaj kutusuna yapıştır
        time.sleep(0.5)
        pyautogui.press("enter")        # gönder
        return True, "ok"
    except Exception as exc:
        return False, str(exc)


def _open_chat_via_search(recipient_name: str, message: str, send_now: bool) -> tuple[bool, str]:
    """
    Kayıtlı numarası olmayan (whatsapp_contacts/phone_book'ta eşleşmeyen) bir kişi için:
    WhatsApp Desktop'ı hedefsiz açar, uygulamanın kendi sohbet arama kutusunu (Ctrl+F)
    kullanarak isimle sohbeti bulur, açar ve mesajı yazar/gönderir.
    Numaralı deep-link (whatsapp://send?phone=...) kadar güvenilir değildir — WhatsApp'ın
    arama sonuçlarının sırasına bağımlıdır — bu yüzden sadece rehberde eşleşme yokken devreye girer.
    """
    if not HAS_PYAUTOGUI:
        return False, (
            f"'{recipient_name}' için kayıtlı numara yok ve otomatik arama için pyautogui "
            "kurulu değil. WhatsApp'ı açtım; sohbeti elle bulup gönderebilirsin."
        )

    try:
        os.startfile("whatsapp://")
    except Exception as exc:
        return False, f"WhatsApp açılamadı: {exc}"

    if not _focus_whatsapp_window(DESKTOP_LOAD_DELAY):
        return False, (
            f"WhatsApp açıldı ama pencere zamanında öne gelmedi — '{recipient_name}' "
            "sohbetini elle arayıp gönderebilirsin."
        )

    try:
        time.sleep(0.5)
        pyautogui.hotkey("ctrl", "f")    # WhatsApp Desktop sohbet arama kısayolu
        time.sleep(0.5)
        pyautogui.hotkey("ctrl", "a")    # arama kutusunda önceki metni temizle
        _copy_to_clipboard(recipient_name.strip())
        time.sleep(0.2)
        pyautogui.hotkey("ctrl", "v")
        time.sleep(1.2)                 # arama sonuçları listelensin
        pyautogui.press("down")         # ilk sonuca in
        time.sleep(0.3)
        pyautogui.press("enter")        # sohbeti aç
        time.sleep(0.8)                 # sohbet + mesaj kutusu yüklensin
        _copy_to_clipboard(message.strip())
        time.sleep(0.2)
        pyautogui.hotkey("ctrl", "v")
        if send_now:
            time.sleep(0.3)
            pyautogui.press("enter")
            return True, (
                f"WhatsApp'ta '{recipient_name}' sohbetini arayıp buldum ve mesajı gönderdim. "
                "Yanlış kişiye gittiyse WhatsApp'ta kontrol etmeni öneririm."
            )
        return True, (
            f"WhatsApp'ta '{recipient_name}' sohbetini arayıp buldum, mesajı yazdım. "
            "Göndermek için Enter'a basman yeterli."
        )
    except Exception as exc:
        return False, f"'{recipient_name}' sohbeti aranırken hata oldu: {exc}"


@register_tool("send_whatsapp_message")
def send_whatsapp_message(
    message: str,
    phone_number: str = "",
    recipient_name: str = "",
    send_now: bool = False,
    app_target: str = "auto",
) -> dict:
    if not message or not message.strip():
        return fail("Mesaj boş olamaz.")

    app_target = (app_target or "auto").strip().lower()
    if app_target not in {"auto", "desktop", "web"}:
        app_target = "auto"

    normalized_phone = ""
    if phone_number and phone_number.strip():
        try:
            normalized_phone = _normalize_phone(phone_number)
        except ValueError as exc:
            return fail(str(exc))

    resolved_name = recipient_name.strip() if recipient_name else ""
    contact = _find_contact(resolved_name) if resolved_name else None

    if contact and not normalized_phone:
        stored_phone = str(contact.get("value", "")).strip()
        try:
            normalized_phone = _normalize_phone(stored_phone)
        except ValueError:
            normalized_phone = ""
        resolved_name = str(contact.get("display_name", resolved_name)).strip() or resolved_name
        contact_source = contact.get("_source", "")
    else:
        contact_source = ""

    if app_target in {"auto", "desktop"}:
        if normalized_phone:
            source_note = " (rehberden bulundu)" if contact_source == "phone_book" else ""
            label = resolved_name or f"+{normalized_phone}"
            # send_now + pyautogui varsa: metni biz panodan yazıp göndereceğiz,
            # bu yüzden URL'ye 'text' koyma (çift metin olmasın). Aksi halde URL ile ön-doldur.
            include_text = not (send_now and HAS_PYAUTOGUI)
            opened_ok, detail = _open_whatsapp_desktop_via_scheme(
                normalized_phone, message, include_text=include_text
            )
            if opened_ok:
                if not send_now:
                    return ok(f"WhatsApp Desktop içinde {label}{source_note} için taslak mesaj açıldı.", recipient=label)
                sent_ok, send_detail = _type_and_send(message, DESKTOP_LOAD_DELAY)
                if sent_ok:
                    return ok(f"WhatsApp Desktop üzerinden {label}{source_note} kişisine mesaj gönderildi.", recipient=label)
                return fail(
                    f"WhatsApp Desktop sohbeti açıldı ama otomatik gönderim yapılamadı: {send_detail}. "
                    "Mesaj kutusuna gelip Enter'a basman yeterli.",
                    recipient=label,
                )
            if app_target == "desktop":
                return fail(f"WhatsApp Desktop açılırken hata oldu: {detail}")

    if not normalized_phone:
        if resolved_name and app_target in {"auto", "desktop"}:
            search_ok, detail = _open_chat_via_search(resolved_name, message, send_now)
            return ok(detail, recipient=resolved_name) if search_ok else fail(detail, recipient=resolved_name)
        if resolved_name:
            return fail(
                f"'{resolved_name}' için kayıtlı bir telefon numarası bulamadım. "
                "İstersen önce kişiyi numarasıyla kaydet."
            )
        return fail("WhatsApp mesajı için kişi adı veya telefon numarası gerekli.")

    source_note = " (rehberden bulundu)" if contact_source == "phone_book" else ""
    label = resolved_name or f"+{normalized_phone}"

    # Web'de metni URL ön-doldurması güvenilir taşır; gönderim için sadece Enter gerekir.
    opened_ok, detail = _open_whatsapp_web(normalized_phone, message, include_text=True)
    if not opened_ok:
        return fail(detail, recipient=label)

    if not send_now:
        return ok(
            f"WhatsApp Web {label}{source_note} için tarayıcıda açıldı. "
            "Göndermek için Enter'a bas.",
            recipient=label,
        )

    if not HAS_PYAUTOGUI:
        return ok(
            f"WhatsApp Web {label}{source_note} için açıldı ve mesaj hazır. "
            "Otomatik gönderim için pyautogui gerekli; Enter'a basarak gönderebilirsin.",
            recipient=label,
        )

    try:
        time.sleep(WEB_LOAD_DELAY)   # sayfa + sohbet yüklensin (giriş yapılmış olmalı)
        pyautogui.press("enter")
        return ok(f"WhatsApp Web üzerinden {label}{source_note} kişisine mesaj gönderildi.", recipient=label)
    except Exception as exc:
        return fail(
            f"WhatsApp Web açıldı ama otomatik gönderim yapılamadı: {exc}. "
            "Enter'a basarak gönderebilirsin.",
            recipient=label,
        )


# ── vCard (.vcf) rehber içe aktarma ──────────────────────────────────────────
# macOS sürümüyle aynı: telefon rehberini (.vcf) toplu olarak kalıcı belleğe alır.

def _unfold_vcf_lines(text: str) -> list[str]:
    unfolded = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip("\r\n")
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def import_phone_book_from_vcf(vcf_path: str) -> str:
    source = Path(vcf_path).expanduser()
    if not source.exists():
        return f"Rehber dosyası bulunamadı: {source}"

    try:
        text = source.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        return f"Rehber dosyası okunamadı: {exc}"

    entries = {}
    current_lines = []
    imported = 0
    skipped = 0

    def _flush_card(lines: list[str]):
        nonlocal imported, skipped
        if not lines:
            return
        display_name = ""
        aliases = []
        numbers = []
        for line in lines:
            upper = line.upper()
            if upper.startswith("FN:"):
                display_name = line.split(":", 1)[1].strip()
            elif upper.startswith("N:") and not display_name:
                parts = [part.strip() for part in line.split(":", 1)[1].split(";") if part.strip()]
                if parts:
                    display_name = " ".join(reversed(parts[:2])).strip()
            elif "TEL" in upper and ":" in line:
                number = line.split(":", 1)[1].strip()
                if number:
                    numbers.append(number)

        if not display_name or not numbers:
            skipped += 1
            return

        normalized_numbers = []
        for raw_number in numbers:
            try:
                normalized_numbers.append("+" + _normalize_phone(raw_number))
            except ValueError:
                continue
        if not normalized_numbers:
            skipped += 1
            return

        if " " in display_name:
            aliases.extend(part for part in display_name.split() if len(part) > 1)
        key = _contact_key(display_name)
        entries[key] = {
            "display_name": display_name,
            "value": normalized_numbers[0],
            "numbers": normalized_numbers,
            "aliases": sorted({alias for alias in aliases if _normalize_lookup(alias) != _normalize_lookup(display_name)}),
            "source": "vcf_import",
        }
        imported += 1

    for line in _unfold_vcf_lines(text):
        if line.upper() == "BEGIN:VCARD":
            current_lines = []
        elif line.upper() == "END:VCARD":
            _flush_card(current_lines)
            current_lines = []
        else:
            current_lines.append(line)

    phone_book = _load_phone_book()
    phone_book.update(entries)
    _save_phone_book(phone_book)
    return f"{imported} rehber kişisi içe aktarıldı, {skipped} kayıt atlandı."
