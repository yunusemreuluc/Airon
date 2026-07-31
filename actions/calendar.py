"""
Takvim — Windows sürümü.

Apple Calendar ve EventKit yalnızca macOS'ta çalışır.
Windows'ta Google Calendar, Outlook veya Windows Calendar açılır.
"""

from __future__ import annotations

import webbrowser

from actions.tool_result import ok
from core.tool_registry import register_tool


def _open_google_calendar():
    webbrowser.open("https://calendar.google.com")


@register_tool("get_calendar_events")
def get_calendar_events(query: str = "today", limit: int = 6) -> dict:
    _open_google_calendar()
    return ok(
        "Apple Calendar bu platformda desteklenmiyor. "
        "Google Calendar tarayıcıda açıldı. "
        "Outlook kullanıyorsan 'outlookcal:' adresini açmamı isteyebilirsin."
    )


@register_tool("add_calendar_event")
def add_calendar_event(
    title: str,
    start_iso: str,
    end_iso: str = "",
    notes: str = "",
    location: str = "",
    calendar_name: str = "",
    all_day: bool = False,
) -> dict:
    # Google Calendar quick add URL
    import urllib.parse
    params = {"text": title}
    if start_iso:
        date_part = start_iso.replace(":", "").replace("-", "").split("T")[0]
        time_part = start_iso.split("T")[1].replace(":", "")[:4] if "T" in start_iso else ""
        if time_part:
            params["dates"] = f"{date_part}T{time_part}00/{date_part}T{time_part}00"
        else:
            params["dates"] = f"{date_part}/{date_part}"
    if location:
        params["location"] = location
    if notes:
        params["details"] = notes
    url = "https://calendar.google.com/calendar/render?action=TEMPLATE&" + urllib.parse.urlencode(params)
    webbrowser.open(url)
    return ok(
        f"Apple Calendar bu platformda desteklenmiyor. "
        f"Google Calendar'da '{title}' etkinliği oluşturmak için tarayıcı açıldı.",
        title=title,
    )


@register_tool("delete_calendar_event")
def delete_calendar_event(
    title: str,
    start_iso: str = "",
    calendar_name: str = "",
    delete_all_matches: bool = False,
    confirm: bool = False,
) -> dict:
    if not confirm:
        when = f" ({start_iso})" if start_iso else ""
        return ok(
            f"'{title}'{when} etkinliğini silmek için Google Calendar'ı açacağım — "
            "gerçek silme işlemini orada sen yapacaksın. Devam edeyim mi?",
            needs_confirmation=True, title=title,
        )
    _open_google_calendar()
    return ok(
        "Apple Calendar bu platformda desteklenmiyor. "
        "Google Calendar tarayıcıda açıldı — etkinliği oradan silebilirsin.",
        title=title,
    )
