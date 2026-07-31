from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.models.events import WSEvent
from backend.websocket.manager import manager

try:
    import psutil

    HAS_PSUTIL = True
except ImportError:  # pragma: no cover — psutil requirements.txt'te var
    HAS_PSUTIL = False

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
async def system_status() -> dict:
    return {"success": True, "message": "system endpoint iskeleti hazır", "data": {}}


@router.get("/telemetry")
async def telemetry() -> dict:
    """Üst telemetri kartının verisi (2026-07-30).

    YALNIZCA GERÇEKTEN ÖLÇEBİLDİKLERİMİZ dönüyor. CLAUDE.md § TOP BAR ayrıca
    GPU ve sıcaklık istiyor ama Windows'ta psutil ikisini de güvenilir şekilde
    veremiyor (`sensors_temperatures` çoğu masaüstünde boş döner, GPU için ayrı
    bir satıcı kütüphanesi gerekir). Uydurulmuş ya da "N/A" dolu bir kart,
    olmayan bir yeteneği varmış gibi gösterirdi — o alanlar hiç yok.

    `cpu_percent(interval=None)` bloklamıyor: son çağrıdan bu yana geçen süreyi
    baz alıyor. İlk çağrı 0.0 döner, sonrakiler anlamlıdır — kart periyodik
    sorguladığı için bu doğru davranış (interval=0.5 verseydik her istek yarım
    saniye backend'i bloklardı).
    """
    if not HAS_PSUTIL:
        return {"success": False, "message": "psutil yok", "data": {}}

    data: dict[str, object] = {}
    try:
        data["cpu"] = round(psutil.cpu_percent(interval=None), 1)
        data["ram"] = round(psutil.virtual_memory().percent, 1)
        data["disk"] = round(psutil.disk_usage("C:\\").percent, 1)
    except Exception:
        return {"success": False, "message": "sistem bilgisi okunamadı", "data": {}}

    # Pil yalnızca dizüstünde var; masaüstünde alan hiç gönderilmiyor (null
    # göndermek arayüzde "pil %—" gibi anlamsız bir satır üretirdi).
    try:
        battery = psutil.sensors_battery()
        if battery is not None:
            data["battery"] = round(battery.percent, 1)
            data["charging"] = bool(battery.power_plugged)
    except Exception:
        pass

    return {"success": True, "message": "telemetri", "data": data}


class StateUpdate(BaseModel):
    state: str


# Durumu dışarıdan enjekte etmek için. Ses döngüsü bunu KULLANMAZ — o, aynı
# süreçte çalıştığı için olayı doğrudan yayınlıyor (bkz. core/web_ui.py set_state).
# Burası arayüzü elle test etmek ve ileride harici bir entegrasyonun durum
# göndermesi için duruyor.
@router.post("/state")
async def system_state(update: StateUpdate) -> dict:
    await manager.broadcast(WSEvent(event="energy_state", data={"state": update.state}))
    return {"success": True, "message": "yayınlandı", "data": {}}
