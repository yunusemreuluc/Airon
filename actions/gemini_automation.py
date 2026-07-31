"""
Gemini masaüstü görev zinciri (kullanıcı isteği, 2026-07-27) — Chrome'u belirli
bir profille açıp Google Gemini web arayüzünde bir prompt gönderen, istenirse
"next" yazıp oluşan görseli indirmeyi N kez tekrarlayan uçtan uca bir otomasyon.

MİMARİ KARAR: Önce Playwright/CDP (gerçek Chrome'a otomasyon protokolüyle
bağlanma) denendi ama iki ayrı Google güvenlik önlemine takıldı: (1) çerezler
artık tarayıcı örneğine bağlı olduğu için bir profili kopyalamak oturumu
taşımıyor, (2) Chrome varsayılan profil yolunda --remote-debugging-port'u
kasıtlı olarak reddediyor (--user-data-dir'i açıkça aynı yola versek bile).
Bu yüzden actions/screen_control.py'nin kullandığı YÖNTEME dönüldü: gerçek,
zaten oturum açık masaüstü Chrome'unu ekran görüntüsü + Gemini vision ile
bulup pyautogui'yle tıklayıp yazmak — CDP/profil sorunlarının hiçbirine
takılmıyor çünkü otomasyon protokolü hiç kullanılmıyor, sadece insan gibi
fare/klavye girdisi simüle ediliyor.

screen_control.py'nin _capture_desktop/_locate_element/_verify_action
fonksiyonları BİLEREK buraya kopyalanmadı (screen_vision.py ile aynı ad altında
yaşanan kasıtlı tekrarın aksine) — burası doğrudan intervene_screen'in AYNI
adım-mantığını art arda zincirlediği için içe aktarmak daha doğru; kopyalamak
üçüncü bir yerde aynı ~300 satırı bakımsız bırakırdı.
"""

from __future__ import annotations

import time
from pathlib import Path

from google import genai

from app_config import get_app_config_value
from actions.tool_result import fail, ok
from actions.screen_control import (
    HAS_PYAUTOGUI,
    _capture_desktop,
    _locate_element,
    _verify_action,
)
from core.tool_registry import register_tool

try:
    import pyautogui
except ImportError:
    pyautogui = None

MODE_LABELS = {"chat": "normal sohbet", "image": "görüntü oluştur", "video": "video oluştur"}
IMAGE_GENERATION_WAIT_SECONDS = 18
MAX_REPEAT_COUNT = 50


def _run_vision_step(client: genai.Client, instruction: str, kind: str, text: str = "", retries: int = 2) -> dict:
    """intervene_screen'in confirm=true dalıyla AYNI mantık (bul->uygula->doğrula,
    başarısızsa fresh capture ile 1 kez daha dene) — ama tek bir adım için, dış
    dünyaya kendi confirm akışını sunmadan (bu zincirin tamamı ZATEN tek bir
    kullanıcı onayının arkasında çalışıyor, bkz. gemini_desktop_task).
    kind: 'click' | 'doubleclick' | 'rightclick' | 'type' | 'type_enter'."""
    last_reason = ""
    last_desc = instruction
    for attempt in range(1, retries + 1):
        cap_ok, result, cap_w, cap_h, off_x, off_y = _capture_desktop()
        if not cap_ok:
            last_reason = result
            continue
        before_path = Path(result)
        after_path: Path | None = None
        try:
            try:
                located = _locate_element(client, instruction, before_path)
            except Exception as exc:
                last_reason = f"hedef bulunamadı: {exc}"
                continue
            if not located.get("found"):
                last_reason = str(located.get("description") or "hedef bulunamadı")
                continue

            try:
                norm_x = max(0, min(1000, int(float(located.get("x") or 0))))
                norm_y = max(0, min(1000, int(float(located.get("y") or 0))))
            except (TypeError, ValueError):
                last_reason = "geçersiz konum"
                continue

            real_x = off_x + round(norm_x / 1000 * cap_w)
            real_y = off_y + round(norm_y / 1000 * cap_h)
            desc = str(located.get("description") or instruction).strip()
            last_desc = desc

            try:
                if kind == "doubleclick":
                    pyautogui.click(real_x, real_y, clicks=2, interval=0.15)
                elif kind == "rightclick":
                    pyautogui.rightClick(real_x, real_y)
                else:
                    pyautogui.click(real_x, real_y)

                if kind in ("type", "type_enter"):
                    time.sleep(0.2)
                    pyautogui.write(text, interval=0.02)
                    if kind == "type_enter":
                        time.sleep(0.15)
                        pyautogui.press("enter")
            except Exception as exc:
                last_reason = f"eylem uygulanamadı: {exc}"
                continue

            time.sleep(0.8)
            cap_ok2, result2, *_rest = _capture_desktop()
            verify = {"verified": True}
            if cap_ok2:
                after_path = Path(result2)
                verify_kind = kind if kind in ("type", "type_enter") else "click"
                try:
                    verify = _verify_action(client, instruction, verify_kind, text, before_path, after_path)
                except Exception:
                    verify = {"verified": True}

            if verify.get("verified"):
                return {"success": True, "desc": desc, "reason": "", "x": real_x, "y": real_y}
            last_reason = str(verify.get("reason") or "")
        finally:
            for p in (before_path, after_path):
                if p is not None:
                    try:
                        if p.exists():
                            p.unlink()
                    except Exception:
                        pass
    return {"success": False, "desc": last_desc, "reason": last_reason}


def _download_latest_image(client: genai.Client) -> dict:
    """Önce Gemini'nin görsel üzerindeki kendi indirme ikonunu dener; bulamazsa
    sağ tık -> 'Resmi kaydet' bağlam menüsüne düşer, Enter ile Chrome'un
    varsayılan konumuna (İndirilenler) kaydeder."""
    step = _run_vision_step(
        client, "sohbette en son oluşturulan görselin üzerindeki indirme (download) ikonu",
        "click", retries=1,
    )
    if step["success"]:
        time.sleep(1.5)
        return {"success": True}

    step2 = _run_vision_step(client, "sohbette en son oluşturulan görsel", "rightclick", retries=1)
    if not step2["success"]:
        return {"success": False, "reason": step2["reason"]}

    time.sleep(0.6)
    step3 = _run_vision_step(
        client, "'Resmi kaydet' veya 'Görüntüyü farklı kaydet' bağlam menüsü seçeneği",
        "click", retries=1,
    )
    if not step3["success"]:
        pyautogui.press("esc")
        return {"success": False, "reason": step3["reason"]}

    time.sleep(1.2)
    pyautogui.press("enter")  # Farklı Kaydet diyaloğu -> varsayılan İndirilenler/isim
    time.sleep(1.0)
    return {"success": True}


@register_tool("gemini_desktop_task")
def gemini_desktop_task(
    prompt: str = "",
    mode: str = "chat",
    profile_name: str = "Yunus Uluç",
    repeat_count: int = 0,
    repeat_text: str = "next",
    confirm: bool = False,
) -> dict:
    """Masaüstündeki Chrome simgesinden başlayıp (belirtilen profille), yeni
    sekmede Gemini'ye gidip bir prompt gönderen uçtan uca ekran otomasyonu.

    mode='chat': prompt'u doğrudan sohbet kutusuna yazar.
    mode='image'/'video': önce '+' menüsünden 'Görüntü oluştur'/'Video oluştur'
    seçeneğine tıklar, sonra prompt'u yazar.
    repeat_count>0: her turdan sonra oluşan görseli indirip `repeat_text`'i
    (varsayılan 'next') tekrar gönderir — YAPILACAKLAR dışı, kullanıcının
    özel isteği olan "next yaz, görseli indir, tekrarla" akışı.

    ÇOK ADIMLI ve YAVAŞ bir işlemdir (her adım bir ekran görüntüsü + Gemini
    vision çağrısı gerektirir) — bu yüzden HER ZAMAN önce confirm=false ile
    çağrılıp onay istenmeli (control_power/intervene_screen ile aynı desen).
    """
    prompt = (prompt or "").strip()
    mode = (mode or "chat").strip().lower()
    repeat_text = (repeat_text or "next").strip() or "next"

    if not prompt:
        return fail("Gemini'ye ne yazacağımı belirtmedim, bir prompt/komut ver.")
    if mode not in MODE_LABELS:
        return fail(f"Bilinmeyen mod: '{mode}'. chat/image/video kullan.")

    repeat_count = max(0, min(MAX_REPEAT_COUNT, int(repeat_count or 0)))

    if not confirm:
        mode_label = MODE_LABELS[mode]
        extra = (
            f" Sonra oluşan görseli indirip '{repeat_text}' yazmayı toplam {repeat_count} "
            "kez tekrarlayacağım."
        ) if repeat_count else ""
        return ok(
            f"Chrome'u '{profile_name}' profiliyle açıp Gemini'de {mode_label} modunda "
            f"'{prompt}' yazacağım.{extra} Bu birkaç dakika sürebilir ve her adımda ekranı "
            "kontrol edeceğim. Onaylıyor musun?",
            needs_confirmation=True, mode=mode, prompt=prompt,
            repeat_count=repeat_count, profile_name=profile_name,
        )

    if not HAS_PYAUTOGUI or pyautogui is None:
        return fail("Ekran otomasyonu için 'pyautogui' kurulu değil.")
    api_key = str(get_app_config_value("gemini_api_key", "") or "").strip()
    if not api_key:
        return fail("Gemini API anahtarı eksik olduğu için bu görevi çalıştıramadım.")
    client = genai.Client(api_key=api_key)

    # 1) Masaüstünü göster (Win+M — Win+D'nin aksine TEK YÖNLÜ, toggle riski yok)
    #    ve Chrome simgesine çift tıkla.
    try:
        pyautogui.hotkey("win", "m")
    except Exception as exc:
        return fail(f"Masaüstü gösterilemedi: {exc}")
    time.sleep(0.6)

    step = _run_vision_step(client, "masaüstündeki Google Chrome kısayol simgesi", "doubleclick")
    if not step["success"]:
        return fail(f"Chrome simgesine tıklanamadı: {step['reason']}")
    time.sleep(1.8)

    # 2) Profil seçim ekranı çıkarsa doğru profile tıkla.
    step = _run_vision_step(client, f"'{profile_name}' isimli Chrome kullanıcı profili kartı", "click")
    if not step["success"]:
        return fail(f"'{profile_name}' profili bulunamadı/tıklanamadı: {step['reason']}")
    time.sleep(1.5)

    # 3) Temiz bir sekmede çalışmak için yeni sekme aç — klavye kısayolu,
    #    vision gerekmez (mevcut sekmede ne olduğunu kontrol etmekten daha
    #    güvenilir: fazladan boş bir sekme açmanın hiçbir zararı yok).
    try:
        pyautogui.hotkey("ctrl", "t")
    except Exception as exc:
        return fail(f"Yeni sekme açılamadı: {exc}")
    time.sleep(0.6)

    # 4) Gemini yer imine/kısayoluna tıkla.
    step = _run_vision_step(client, "Gemini logosu ve yazısı (yer imi veya kısayol)", "click")
    if not step["success"]:
        return fail(f"Gemini kısayoluna tıklanamadı: {step['reason']}")
    time.sleep(2.5)

    # 5) Görüntü/video modu isteniyorsa önce '+' menüsünden ilgili aracı seç.
    if mode in ("image", "video"):
        step = _run_vision_step(client, "sohbet giriş kutusunun solundaki '+' (ekle) butonu", "click")
        if not step["success"]:
            return fail(f"'+' butonu bulunamadı: {step['reason']}")
        time.sleep(0.8)

        tool_label = "Görüntü oluştur" if mode == "image" else "Video oluştur"
        step = _run_vision_step(client, f"açılan menüdeki '{tool_label}' seçeneği", "click")
        if not step["success"]:
            return fail(f"'{tool_label}' seçeneği bulunamadı: {step['reason']}")
        time.sleep(0.8)

    # 6) Prompt'u yaz ve gönder.
    step = _run_vision_step(client, "Gemini sohbet giriş kutusu ('Gemini'a sorun')", "type_enter", text=prompt)
    if not step["success"]:
        return fail(f"Prompt yazılamadı/gönderilemedi: {step['reason']}")

    if repeat_count <= 0:
        return ok(f"Tamam, Gemini'ye '{prompt}' gönderdim.", mode=mode)

    # 7) İstenirse: oluşan görseli indir, 'next' (veya verilen metni) yaz,
    #    tekrarla. Görsel oluşturma süresi belirsiz olduğu için sabit bir
    #    bekleme kullanıyoruz (canlı testte ayarlanması gerekebilir).
    downloaded = 0
    for i in range(repeat_count):
        time.sleep(IMAGE_GENERATION_WAIT_SECONDS)
        dl = _download_latest_image(client)
        if dl["success"]:
            downloaded += 1

        if i < repeat_count - 1:
            step = _run_vision_step(client, "Gemini sohbet giriş kutusu ('Gemini'a sorun')", "type_enter", text=repeat_text)
            if not step["success"]:
                return fail(
                    f"{i + 1}. tekrarda '{repeat_text}' yazılamadı: {step['reason']} "
                    f"(o ana kadar {downloaded} görsel indirildi).",
                    downloaded=downloaded,
                )

    return ok(f"Tamam, işlemi tamamladım — {downloaded}/{repeat_count} görsel indirildi.", downloaded=downloaded)
