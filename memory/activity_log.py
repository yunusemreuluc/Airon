"""
Günlük aktivite hafızası (YAPILACAKLAR.md #12) — memory.json'daki KALICI
gerçeklerden (isim, tercihler vb.) farklı olarak, kronolojik bir OLAY AKIŞI
tutar: o gün konuşulanlar + çalıştırılan araçlar. "Bugün ne yaptık/konuştuk"
gibi sorulara cevap verebilmek için ayrı bir dosyada (activity_log.json)
tutuluyor — memory.json'un kategori/anahtar şekli kronolojik olaylara uymuyor.
Sınırsız büyümesin diye sadece son ACTIVITY_LOG_MAX_DAYS gün saklanıyor.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

from actions.tool_result import ok
from core.tool_registry import register_tool

BASE_DIR = Path(__file__).resolve().parent.parent
ACTIVITY_LOG_FILE = BASE_DIR / "memory" / "activity_log.json"

ACTIVITY_LOG_MAX_DAYS = 30
MAX_EVENTS_PER_DAY = 200
MAX_EVENT_TEXT_CHARS = 300

# get_daily_activity'nin kendisi log'a yazılmaz — "bugün ne yaptık" sorusunun
# cevabı log'un bir parçası olursa okuma her seferinde kendi kendini kirletir.
_EXCLUDED_TOOLS = {"get_daily_activity"}


def _load() -> dict:
    try:
        if ACTIVITY_LOG_FILE.exists():
            with open(ACTIVITY_LOG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _write(data: dict) -> None:
    ACTIVITY_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ACTIVITY_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _prune(data: dict) -> None:
    if len(data) <= ACTIVITY_LOG_MAX_DAYS:
        return
    for old_day in sorted(data.keys())[: len(data) - ACTIVITY_LOG_MAX_DAYS]:
        del data[old_day]


def log_event(kind: str, text: str, tool_name: str = "") -> None:
    """kind: 'conversation' | 'tool'. Hata sessizce yutulur — aktivite kaydı
    ana konuşma/araç akışını asla kesmemeli, sadece iz bırakır."""
    if tool_name in _EXCLUDED_TOOLS:
        return
    text = (text or "").strip()
    if not text:
        return
    if len(text) > MAX_EVENT_TEXT_CHARS:
        text = text[:MAX_EVENT_TEXT_CHARS] + "…"
    try:
        now = datetime.datetime.now()
        day = now.strftime("%Y-%m-%d")
        data = _load()
        day_events = data.setdefault(day, [])
        if len(day_events) < MAX_EVENTS_PER_DAY:
            day_events.append({"time": now.strftime("%H:%M"), "kind": kind, "text": text})
        _prune(data)
        _write(data)
    except Exception:
        pass


def _resolve_date(date: str) -> tuple[str, str]:
    """Doğal dil tarih ifadesini gerçek bir gün anahtarına çevirir.
    Döner: (gun_anahtari 'YYYY-MM-DD', kullaniciya-gosterilecek etiket)."""
    date = (date or "").strip().lower()
    today = datetime.date.today()
    if not date or date in {"bugün", "bugun", "today"}:
        return today.isoformat(), "bugün"
    if date in {"dün", "dun", "yesterday"}:
        d = today - datetime.timedelta(days=1)
        return d.isoformat(), "dün"
    try:
        d = datetime.date.fromisoformat(date)
        return d.isoformat(), d.strftime("%d %B %Y")
    except ValueError:
        return today.isoformat(), "bugün"


@register_tool("get_daily_activity")
def get_daily_activity(date: str = "") -> dict:
    """Belirtilen günde (varsayılan bugün; 'dün' veya 'YYYY-MM-DD' de olur) neler
    konuşulduğunu ve hangi araçların çalıştırıldığını kronolojik metin olarak
    döner. Kullanıcı 'bugün ne yaptık/konuştuk', 'dün ne olmuştu' gibi bir şey
    sorduğunda kullan — dönen ham listeyi olduğu gibi okuma, özetleyip doğal
    dille anlat."""
    day_key, label = _resolve_date(date)
    data = _load()
    events = data.get(day_key, [])
    if not events:
        return ok(f"{label.capitalize()} için kayıtlı bir aktivite bulamadım.", date=day_key, count=0)

    lines = [f"[{e['time']}] {e['text']}" for e in events]
    return ok(
        f"{label.capitalize()} için {len(events)} kayıt buldum.",
        date=day_key, count=len(events), events="\n".join(lines),
    )
