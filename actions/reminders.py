"""
Hatırlatıcılar — Windows sürümü.

Apple Reminders yalnızca macOS'ta çalışır.
Windows'ta Microsoft To-Do veya Google Tasks açılır.
"""

from __future__ import annotations

import webbrowser

from actions.tool_result import ok
from core.tool_registry import register_tool


@register_tool("get_reminders")
def get_reminders(query: str = "upcoming", limit: int = 8, list_name: str = "") -> dict:
    webbrowser.open("https://to-do.microsoft.com/tasks")
    return ok(
        "Apple Reminders bu platformda desteklenmiyor. "
        "Microsoft To-Do tarayıcıda açıldı."
    )


@register_tool("add_reminder")
def add_reminder(
    title: str,
    due_iso: str = "",
    notes: str = "",
    list_name: str = "",
    priority: str = "",
    all_day: bool = False,
) -> dict:
    webbrowser.open("https://to-do.microsoft.com/tasks")
    return ok(
        f"Apple Reminders bu platformda desteklenmiyor. "
        f"Microsoft To-Do tarayıcıda açıldı — '{title}' hatırlatıcısını oradan ekleyebilirsin.",
        title=title,
    )
