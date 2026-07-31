"""
Masaüstü/dosya semantik arama ve özetleme (YAPILACAKLAR.md #10).

Gerçek bir embedding/vektör indeksi kurmak yerine (bu kapsam için gereksiz ağır) —
dosya adı/yol listesi Gemini'ye verilip doğal dildeki isteği hangi dosya(lar)ın en
iyi karşıladığı SEÇTİRİLİYOR. Bu, projede zaten `screen_control.py`/`screen_watch.py`
gibi yerlerde kullanılan "yapılandırılmış veriyi Gemini'ye akıl yürüttürüp JSON
aldırma" deseninin dosya sistemine uygulanmış hali — tam bir semantik/vektör arama
değil ama dosya adından anlam çıkarabildiği için literal substring aramadan çok
daha esnek.

search_files: doğal dil sorgusuyla dosya bulur.
summarize_file: bulunan (veya doğrudan verilen) bir dosyanın içeriğini okuyup özetler
(txt/md/py/json/csv/html/log gibi düz metin formatları + PDF + Word/.docx).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from google import genai
from google.genai import errors, types

from app_config import get_app_config_value
from actions.tool_result import fail, ok
from core.tool_registry import register_tool

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    import docx
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False


# "gemini-2.5-flash" BİLEREK yok — bu hesapta 404 veriyor (bkz. video_analysis.py'deki aynı not).
TEXT_MODELS = (
    "models/gemini-flash-latest",
    "models/gemini-2.5-flash-lite",
)

DEFAULT_SEARCH_FOLDERS = [
    Path.home() / "Desktop",
    Path.home() / "OneDrive" / "Desktop",
    Path.home() / "Documents",
    Path.home() / "Downloads",
]
MAX_FILES_LISTED = 300
MAX_SCAN_DEPTH = 2

PLAIN_TEXT_EXTENSIONS = {
    ".txt", ".md", ".py", ".js", ".ts", ".json", ".csv", ".html", ".htm",
    ".xml", ".log", ".ini", ".yaml", ".yml", ".bat", ".ps1", ".css", ".ipynb",
}
MAX_CONTENT_CHARS = 20_000


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


def _is_transient_error(exc: Exception) -> bool:
    if isinstance(exc, (errors.ServerError, TimeoutError)):
        return True
    message = str(exc or "").lower()
    markers = (
        "503", "429", "deadline", "timed out", "timeout", "unavailable",
        "service unavailable", "internal error", "busy", "overloaded",
        "resource exhausted", "try again later", "backend error", "connection reset",
    )
    return any(marker in message for marker in markers)


def _generate_text(api_key: str, prompt: str) -> str:
    client = genai.Client(api_key=api_key)
    retry_delays = (0.9, 1.8)
    last_error: Exception | None = None
    for model_name in TEXT_MODELS:
        for attempt, delay in enumerate(retry_delays, start=1):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Part.from_text(text=prompt)],
                    config=types.GenerateContentConfig(temperature=0.2),
                )
                text = str(getattr(response, "text", "") or "").strip()
                if text:
                    return text
                raise RuntimeError("Gemini boş yanıt döndürdü.")
            except Exception as exc:
                last_error = exc
                if attempt < len(retry_delays) and _is_transient_error(exc):
                    import time
                    time.sleep(delay)
                    continue
                if _is_transient_error(exc):
                    break
                raise
    raise RuntimeError(f"Metin üretimi başarısız: {last_error}")


def _enumerate_files(folder: Path, max_depth: int = MAX_SCAN_DEPTH, limit: int = MAX_FILES_LISTED) -> list[Path]:
    results: list[Path] = []
    try:
        base_depth = len(folder.parts)
        for root, dirs, files in os.walk(folder):
            depth = len(Path(root).parts) - base_depth
            if depth >= max_depth:
                dirs[:] = []
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in files:
                if fname.startswith("."):
                    continue
                results.append(Path(root) / fname)
                if len(results) >= limit:
                    return results
    except Exception:
        pass
    return results


@register_tool("search_files")
def search_files(query: str, folder: str = "") -> dict:
    """Varsayılan olarak Masaüstü/Belgeler/İndirilenler'de arar (veya verilen bir
    klasörde), doğal dil sorgusuna Gemini ile en iyi uyan dosyaları seçer."""
    if not query.strip():
        return fail("Ne aradığını söylemen lazım.")

    if folder.strip():
        target = Path(folder.strip()).expanduser()
        if not target.exists() or not target.is_dir():
            return fail(f"'{folder}' bulunamadı veya bir klasör değil.")
        folders = [target]
    else:
        seen: set[Path] = set()
        folders = []
        for f in DEFAULT_SEARCH_FOLDERS:
            if f.exists() and f.resolve() not in seen:
                seen.add(f.resolve())
                folders.append(f)

    all_files: list[Path] = []
    for f in folders:
        all_files.extend(_enumerate_files(f))
        if len(all_files) >= MAX_FILES_LISTED:
            break
    all_files = all_files[:MAX_FILES_LISTED]

    if not all_files:
        return ok("Aranacak klasörlerde hiç dosya bulamadım.", matches=[])

    api_key = str(get_app_config_value("gemini_api_key", "") or "").strip()
    if not api_key:
        return fail("Gemini API anahtarı eksik olduğu için akıllı dosya arama yapılamadı.")

    listing = "\n".join(f"{i}: {p}" for i, p in enumerate(all_files))
    prompt = (
        "Aşağıda bir kullanıcının bilgisayarındaki dosyaların listesi var (numara: tam yol). "
        f"Kullanıcının doğal dildeki isteği: \"{query}\"\n\n"
        "Bu isteğe EN İYİ uyan dosyaları seç — dosya adından/yolundan/uzantısından anlam "
        "çıkararak (tam eşleşme şart değil; örn. 'geçen ay yazdığım rapor' isteğinde "
        "adında 'rapor' geçen ya da rapor gibi görünen belgeleri düşün). En fazla 5 dosya "
        "seç, en iyi eşleşen önce gelsin. Hiçbiri uymuyorsa boş liste döndür.\n\n"
        "SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir metin veya markdown "
        "ekleme:\n"
        '{"matches": [numara, numara, ...]}\n\n'
        f"Dosya listesi:\n{listing}"
    )

    try:
        raw = _generate_text(api_key, prompt)
        parsed = _extract_json(raw) or {}
        indices = parsed.get("matches") or []
        matches = []
        for i in indices:
            try:
                idx = int(i)
            except (TypeError, ValueError):
                continue
            if 0 <= idx < len(all_files):
                matches.append(str(all_files[idx]))
    except Exception as exc:
        return fail(f"Dosya araması başarısız: {exc}")

    if not matches:
        return ok(f"'{query}' ile eşleşen bir dosya bulamadım.", matches=[])

    lines = "\n".join(f"- {m}" for m in matches)
    return ok(f"'{query}' için {len(matches)} dosya buldum:\n{lines}", matches=matches)


def _read_pdf_text(path: Path) -> str:
    if not HAS_PYPDF:
        raise RuntimeError("PDF okumak için 'pypdf' kurulu değil.")
    reader = PdfReader(str(path))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts)


def _read_docx_text(path: Path) -> str:
    if not HAS_DOCX:
        raise RuntimeError("Word dosyası okumak için 'python-docx' kurulu değil.")
    document = docx.Document(str(path))
    return "\n".join(p.text for p in document.paragraphs)


def _read_file_content(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _read_pdf_text(path)
    if suffix == ".docx":
        return _read_docx_text(path)
    if suffix in PLAIN_TEXT_EXTENSIONS or not suffix:
        return path.read_text(encoding="utf-8", errors="replace")
    raise RuntimeError(f"Desteklenmeyen dosya türü: {suffix or '(uzantısız)'}")


@register_tool("summarize_file")
def summarize_file(path: str, question: str = "") -> dict:
    """Bir dosyanın içeriğini okuyup Türkçe özetler (veya `question` verilmişse
    o soruyu içerik üzerinden cevaplar). Desteklenen türler: düz metin/kod
    (.txt/.md/.py/.json/.csv/.html/.log vb.), .pdf, .docx."""
    if not path.strip():
        return fail("Hangi dosyayı okuyacağımı bilmem lazım.")

    file_path = Path(path.strip().strip('"')).expanduser()
    if not file_path.exists():
        return fail(f"Dosya bulunamadı: {file_path}")
    if not file_path.is_file():
        return fail(f"Bu bir dosya değil: {file_path}")

    try:
        content = _read_file_content(file_path)
    except Exception as exc:
        return fail(f"'{file_path.name}' okunamadı: {exc}")

    content = content.strip()
    if not content:
        return ok(f"'{file_path.name}' içeriği boş görünüyor, özetleyecek bir şey yok.")

    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS] + "\n... (içerik uzun olduğu için kısaltıldı)"

    api_key = str(get_app_config_value("gemini_api_key", "") or "").strip()
    if not api_key:
        return fail("Gemini API anahtarı eksik olduğu için dosya özetlenemedi.")

    user_question = question.strip()
    if user_question:
        prompt = (
            f"Aşağıda '{file_path.name}' dosyasının içeriği var. Kullanıcının sorusu: "
            f"\"{user_question}\"\n\nBu soruyu SADECE bu içeriğe dayanarak Türkçe cevapla. "
            f"İçerikte cevap yoksa bunu açıkça söyle.\n\n--- İÇERİK ---\n{content}"
        )
    else:
        prompt = (
            f"Aşağıda '{file_path.name}' dosyasının içeriği var. Bunu 3-5 cümlede Türkçe "
            f"özetle — ana konuyu ve varsa önemli noktaları/sonuçları belirt.\n\n"
            f"--- İÇERİK ---\n{content}"
        )

    try:
        summary = _generate_text(api_key, prompt)
    except Exception as exc:
        return fail(f"'{file_path.name}' özetlenemedi: {exc}")

    return ok(summary, file=str(file_path))
