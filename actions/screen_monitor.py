"""
Proaktif ekran izleme (YAPILACAKLAR.md #4) — arka planda periyodik olarak aktif
pencereyi yakalayıp Gemini vision'a "kullanıcının dikkatini gerektiren açık bir
sorun (hata/uyarı penceresi vb.) var mı" diye sorar.

Bu bir "tool" DEĞİL — tool_defs.py'de yok, Gemini tarafından çağrılmaz. main.py'nin
kendi arka plan görevi (AironLive._watch_screen_for_issues) bunu periyodik çağırıp
sonucu proaktif bir konuşma tetikleyicisine çevirir (bkz. main.py).

screen_vision.py/screen_control.py ile aynı desenler (mss capture + Gemini vision +
model fallback) — proje genelinde kabul edilmiş şekilde kasıtlı olarak ortak modüle
çıkarılmadı (bkz. o dosyalardaki aynı not).
"""

from __future__ import annotations

import ctypes
import json
import re
import tempfile
from pathlib import Path

from google import genai
from google.genai import types

try:
    import mss
    HAS_MSS = True
except ImportError:
    HAS_MSS = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# "gemini-2.5-flash" BİLEREK yok — bu hesapta 404 veriyor (bkz. screen_control.py'deki not).
MONITOR_MODELS = (
    "models/gemini-flash-latest",
    "models/gemini-2.5-flash-lite",
)
MONITOR_MAX_DIMENSION = 1200  # sadece "sorun var mı" tespiti — analyze_screen'den küçük


def get_active_window_title() -> str:
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value.strip()
    except Exception:
        return ""


def _capture_active_window() -> Path | None:
    if not HAS_MSS or not HAS_PIL:
        return None
    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            shot = sct.grab(monitor)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        if max(img.size) > MONITOR_MAX_DIMENSION:
            img.thumbnail((MONITOR_MAX_DIMENSION, MONITOR_MAX_DIMENSION), Image.Resampling.LANCZOS)
        handle = tempfile.NamedTemporaryFile(prefix="airon-monitor-", suffix=".png", delete=False)
        tmp_path = Path(handle.name)
        handle.close()
        img.save(str(tmp_path), format="PNG", optimize=True)
        return tmp_path
    except Exception:
        return None


def _extract_json(text: str) -> dict | None:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return None
    return None


def _check_prompt(window_title: str) -> str:
    label = window_title or "aktif pencere"
    return (
        "Sen arka planda SESSİZCE çalışan bir ekran izleyicisin — kullanıcı sana "
        "hiçbir şey sormadı. Aşağıdaki ekran görüntüsü şu pencereye ait: "
        f"'{label}'.\n\n"
        "SADECE kullanıcının GERÇEKTEN fark etmesi gereken açık bir durum varsa "
        "(hata mesajı diyaloğu, çökme/crash ekranı, kritik güvenlik uyarısı, "
        "programın yanıt vermediğini gösteren bir uyarı vb.) issue_found:true yap. "
        "Sıradan/normal her şeyi (yükleniyor ekranı, boş sayfa, sıradan içerik, "
        "küçük bilgi ikonları, normal bildirimler) ASLA sorun olarak işaretleme — "
        "ÇOK TUTUCU ol; sık yanlış alarm kullanıcıyı yorar ve güvenini kırar. "
        "Emin değilsen issue_found:false yap.\n\n"
        "issue_found:true ise, description alanına SADECE kısa bir özet değil, "
        "ekranda görünen TAM hata metnini/kodunu/mesajını (varsa) birebir de ekle — "
        "bu bilgi daha sonra çözüm önermek için kullanılacak.\n\n"
        "SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir metin veya markdown "
        "ekleme:\n"
        '{"issue_found": true veya false, "description": "kısa Türkçe özet + varsa tam hata metni/kodu"}'
    )


def check_for_issue(api_key: str, window_title: str) -> dict:
    """{"issue_found": bool, "description": str} döner. Teknik bir sorun olursa
    (API/anahtar/yakalama hatası) sessizce issue_found=False ile geçer — bu
    fonksiyon kullanıcıyla ASLA doğrudan konuşmaz, main.py'ye sinyal verir."""
    if not api_key:
        return {"issue_found": False, "description": ""}

    image_path = _capture_active_window()
    if image_path is None:
        return {"issue_found": False, "description": ""}

    try:
        image_part = types.Part.from_bytes(data=image_path.read_bytes(), mime_type="image/png")
        client = genai.Client(api_key=api_key)
        prompt = _check_prompt(window_title)
        for model_name in MONITOR_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Part.from_text(text=prompt), image_part],
                    config=types.GenerateContentConfig(temperature=0.1),
                )
                parsed = _extract_json(str(getattr(response, "text", "") or ""))
                if parsed is not None:
                    return {
                        "issue_found": bool(parsed.get("issue_found")),
                        "description": str(parsed.get("description") or "").strip(),
                    }
            except Exception:
                continue
        return {"issue_found": False, "description": ""}
    except Exception:
        return {"issue_found": False, "description": ""}
    finally:
        try:
            image_path.unlink()
        except Exception:
            pass
