"""
Kalıcı bellek — JSON dosyasına kaydedilir.
Alp Ünlü tarafından yapılmıştır — @alppunlu
"""

import datetime
import json
import re
import unicodedata
from pathlib import Path

from actions.tool_result import fail, ok
from core.tool_registry import register_tool

BASE_DIR    = Path(__file__).resolve().parent.parent
MEMORY_FILE = BASE_DIR / "memory" / "memory.json"

# ── Hafıza üst sınırı ve sıkıştırma (compaction) ────────────────────────────
# Eskiden memory.json sınırsız büyüyordu — her bağlantıda TÜMÜ system prompt'a
# dökülüyor (bkz. main.py._build_config), yani zamanla token/gecikme maliyeti
# sürekli artıyordu. Artık "sıkıştırılabilir" kategorilerdeki (whatsapp_contacts
# ve zaten arşivlenmiş özet HARİÇ) kayıt sayısı MAX_MEMORY_ENTRIES'i aşınca en
# eski kayıtlar (son güncellenme zamanına göre) tek bir özet metne katlanıp
# _archived_summary altında toplanıyor — bilgi tamamen silinmiyor, sadece
# tek satırlık kompakt bir ize indirgeniyor.
MAX_MEMORY_ENTRIES = 150
ARCHIVE_CATEGORY = "_archived_summary"
ARCHIVE_KEY = "eski_kayitlar"
PROTECTED_CATEGORIES = {"whatsapp_contacts", "known_objects", "scheduled_briefing", ARCHIVE_CATEGORY}
ARCHIVE_MAX_CHARS = 4000


def load_memory() -> dict:
    try:
        if MEMORY_FILE.exists():
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def update_memory(data: dict):
    mem = load_memory()
    _deep_merge(mem, data)
    _stamp_updated_entries(mem, data)
    _compact_if_needed(mem)
    _write_memory(mem)


def _now_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


def _stamp_updated_entries(mem: dict, data: dict) -> None:
    """Bu update_memory() çağrısıyla değişen her {kategori: {anahtar: {...}}}
    girdisine, sıkıştırma sıralamasında (en eski önce) kullanılacak bir
    _updated_at zaman damgası ekler."""
    now = _now_iso()
    for category, items in data.items():
        if not isinstance(items, dict):
            continue
        bucket = mem.get(category)
        if not isinstance(bucket, dict):
            continue
        for key in items:
            entry = bucket.get(key)
            if isinstance(entry, dict):
                entry["_updated_at"] = now


def _count_compactable_entries(mem: dict) -> int:
    total = 0
    for category, bucket in mem.items():
        if category in PROTECTED_CATEGORIES or not isinstance(bucket, dict):
            continue
        total += len(bucket)
    return total


def _compact_if_needed(mem: dict) -> None:
    total = _count_compactable_entries(mem)
    if total <= MAX_MEMORY_ENTRIES:
        return

    entries = []
    for category, bucket in mem.items():
        if category in PROTECTED_CATEGORIES or not isinstance(bucket, dict):
            continue
        for key, entry in bucket.items():
            updated_at = entry.get("_updated_at", "") if isinstance(entry, dict) else ""
            entries.append((updated_at, category, key, entry))

    # Zaman damgası olmayanlar (boş string) en eski sayılır — sıralamada en başa düşer.
    entries.sort(key=lambda item: item[0])

    overflow = total - MAX_MEMORY_ENTRIES
    to_archive = entries[:overflow]
    if not to_archive:
        return

    archived_lines = []
    for _updated_at, category, key, entry in to_archive:
        archived_lines.append(f"{category}/{key}: {_entry_value_text(entry)}")
        del mem[category][key]
        if not mem[category]:
            mem.pop(category, None)

    archive_bucket = mem.setdefault(ARCHIVE_CATEGORY, {})
    previous = archive_bucket.get(ARCHIVE_KEY, {})
    existing_text = previous.get("value", "") if isinstance(previous, dict) else ""
    combined = (existing_text + " | " if existing_text else "") + " | ".join(archived_lines)
    if len(combined) > ARCHIVE_MAX_CHARS:
        combined = combined[-ARCHIVE_MAX_CHARS:]
    archive_bucket[ARCHIVE_KEY] = {
        "value": combined,
        "_updated_at": _now_iso(),
        "_archived_count": (previous.get("_archived_count", 0) if isinstance(previous, dict) else 0) + len(archived_lines),
    }


def _write_memory(mem: dict):
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(mem, f, indent=2, ensure_ascii=False)


def _deep_merge(base: dict, update: dict):
    for k, v in update.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


def _normalize_text(text: str) -> str:
    text = (text or "").strip().casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ı", "i")
    return " ".join(text.split())


def _entry_value_text(value) -> str:
    if isinstance(value, dict):
        base = value.get("value")
        if base is not None:
            return str(base)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _tokenize_text(text: str) -> list[str]:
    normalized = _normalize_text(text)
    return [token for token in re.split(r"[^a-z0-9]+", normalized) if token]


def _entry_matches(needle: str, category: str, item_key: str, item_value) -> bool:
    haystacks = [
        _normalize_text(category),
        _normalize_text(item_key),
        _normalize_text(_entry_value_text(item_value)),
    ]
    if any(needle in hay for hay in haystacks):
        return True

    tokens = [tok for tok in _tokenize_text(needle) if len(tok) >= 3]
    if not tokens:
        return False

    entry_tokens: list[str] = []
    for hay in haystacks:
        entry_tokens.extend(_tokenize_text(hay))

    matched = 0
    for token in tokens:
        if any(token in entry_token or entry_token in token for entry_token in entry_tokens):
            matched += 1

    if len(tokens) == 1:
        return matched == 1
    return matched >= min(2, len(tokens))


@register_tool("delete_memory")
def delete_memory(category: str = "", key: str = "", match_text: str = "", confirm: bool = False) -> dict:
    """confirm=False: eslesen kaydi bulur, SILMEZ — onay icin kaydin degerini
    aciklayan bir mesaj doner (data.needs_confirmation=True). confirm=True: ayni
    parametrelerle tekrar cagrilinca kaydi gercekten siler (bkz. core/prompt.txt'teki
    intervene_screen ile ayni iki adimli onay oruntusu)."""
    mem = load_memory()
    if not mem:
        return fail("Hafizada silinecek bir kayit yok.")

    category = (category or "").strip()
    key = (key or "").strip()
    match_text = (match_text or "").strip()

    if category and key:
        bucket = mem.get(category)
        if isinstance(bucket, dict) and key in bucket:
            if not confirm:
                return ok(
                    f"'{category}/{key}' kaydini silmek istiyorum: {_entry_value_text(bucket[key])}. Onayliyor musun?",
                    needs_confirmation=True, category=category, key=key,
                )
            del bucket[key]
            if not bucket:
                mem.pop(category, None)
            _write_memory(mem)
            return ok(f"{category}/{key} hafizadan kaldirildi.", category=category, key=key)
        return fail("Bu hafiza kaydini bulamadim.")

    needle = _normalize_text(match_text or key)
    if not needle:
        return fail("Silmek icin category/key veya match_text gerekli.")

    for cat, bucket in list(mem.items()):
        if not isinstance(bucket, dict):
            if _entry_matches(needle, cat, cat, bucket):
                if not confirm:
                    return ok(
                        f"'{cat}' kaydini silmek istiyorum: {_entry_value_text(bucket)}. Onayliyor musun?",
                        needs_confirmation=True, category=cat,
                    )
                del mem[cat]
                _write_memory(mem)
                return ok(f"{cat} hafizadan kaldirildi.", category=cat)
            continue

        for item_key, item_value in list(bucket.items()):
            if _entry_matches(needle, cat, item_key, item_value):
                if not confirm:
                    return ok(
                        f"'{cat}/{item_key}' kaydini silmek istiyorum: {_entry_value_text(item_value)}. Onayliyor musun?",
                        needs_confirmation=True, category=cat, key=item_key,
                    )
                del bucket[item_key]
                if not bucket:
                    mem.pop(cat, None)
                _write_memory(mem)
                return ok(f"{cat}/{item_key} hafizadan kaldirildi.", category=cat, key=item_key)

    return fail("Eslestigim bir hafiza kaydi bulamadim.")


def format_memory_for_prompt(memory: dict) -> str:
    if not memory:
        return ""
    lines = ["[KULLANICI HAKKINDA BİLGİLER]"]
    for category, items in memory.items():
        if isinstance(items, dict):
            for key, val in items.items():
                if category == "whatsapp_contacts" and isinstance(val, dict):
                    display_name = val.get("display_name", key)
                    value = val.get("value", "")
                    aliases = val.get("aliases", [])
                    alias_str = ""
                    if isinstance(aliases, list) and aliases:
                        alias_str = f" aliases={', '.join(str(a) for a in aliases)}"
                    lines.append(f"  {category}/{display_name}: {value}{alias_str}")
                else:
                    value = val.get("value", val) if isinstance(val, dict) else val
                    lines.append(f"  {category}/{key}: {value}")
        else:
            lines.append(f"  {category}: {items}")
    return "\n".join(lines)
