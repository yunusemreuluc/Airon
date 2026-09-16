"""
PC güç kontrolü (kapat/yeniden başlat/uyku/hazırda beklet) — kullanıcı isteği
(2026-07-27), YAPILACAKLAR.md'nin dışında ek bir özellik.

Çok yıkıcı bir eylem kategorisi (kaydedilmemiş iş kaybı riski) olduğu için TÜM
onay/gecikme/iptal mantığı main.py'de (`_tool_control_power` + iki adımlı
confirm=false/true akışı, `actions/shell.py`'deki HARD_BLOCKED "shutdown"
engeliyle aynı ruhta ama amaca özel) — bu modül sadece HAZIR ONAYLANMIŞ bir
eylemi çalıştıran ince bir katman, kendi başına hiçbir onay/güvenlik kararı
vermez.
"""

from __future__ import annotations

import subprocess


def execute_power_action(action: str) -> None:
    """Eylemi HEMEN çalıştırır. Başarısız olursa exception fırlatır — çağıran
    taraf (main.py) yakalayıp kullanıcıya haber verir."""
    if action == "shutdown":
        subprocess.run(["shutdown", "/s", "/t", "0"], check=True)
    elif action == "restart":
        subprocess.run(["shutdown", "/r", "/t", "0"], check=True)
    elif action == "sleep":
        subprocess.run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"], check=True)
    elif action == "hibernate":
        subprocess.run(["shutdown", "/h"], check=True)
    else:
        raise ValueError(f"Bilinmeyen güç eylemi: {action}")
