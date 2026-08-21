"""Makro — şablon eşleştirmeli otomatik tıklama uçları.

Vision uçlarının aksine (bkz. backend/api/vision.py) burada komut kanalı YOK:
makro motoru ekranı ve fareyi kullanıyor, ikisi de ses döngüsünün elinde
değil. Motor backend sürecinde kendi thread'inde yaşıyor, o yüzden bu uçlar
gerçek sonuç döndürebiliyor.

Görsel yükleme JSON gövdesinde base64 olarak alınıyor — projenin her yerinde
kullanılan {success, message, data} zarfını bozmamak için (multipart ayrı bir
hata biçimi getirirdi).
"""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.macro_engine import ACTIONS, IMAGE_DIR, engine

router = APIRouter(prefix="/api/macro", tags=["macro"])

MAX_IMAGE_BYTES = 4 * 1024 * 1024


def _envelope(success: bool, message: str, data: dict | None = None) -> dict:
    return {"success": success, "message": message, "data": data or {}}


@router.get("/status")
async def macro_status() -> dict:
    """Motorun tam durumu: çalışıyor mu, hedefler, ayarlar, son eylemler."""
    status = engine.status()
    if not status["available"]:
        return _envelope(False, status["unavailableReason"], status)
    return _envelope(True, "çalışıyor" if status["running"] else "hazır", status)


class TargetCreate(BaseModel):
    name: str = ""
    image: str = ""            # data URL ya da düz base64
    threshold: float = 0.80
    action: str = "sol"
    key: str = ""
    offsetX: int = 0
    offsetY: int = 0
    cooldownMs: int = 800
    priority: int = 0


def _decode_image(payload: str) -> tuple[bytes | None, str]:
    if not payload:
        return None, "Görsel boş."
    if payload.startswith("data:"):
        _, _, payload = payload.partition(",")
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return None, "Görsel çözülemedi (geçersiz base64)."
    if not raw:
        return None, "Görsel boş."
    if len(raw) > MAX_IMAGE_BYTES:
        return None, "Görsel 4 MB'tan büyük."
    return raw, ""


@router.post("/targets")
async def add_target(payload: TargetCreate) -> dict:
    if payload.action not in ACTIONS:
        return _envelope(False, f"Geçersiz eylem: {payload.action}")

    raw, error = _decode_image(payload.image)
    if raw is None:
        return _envelope(False, error)

    target, error = engine.add_target(
        payload.name,
        raw,
        threshold=payload.threshold,
        action=payload.action,
        key=payload.key,
        offset_x=payload.offsetX,
        offset_y=payload.offsetY,
        cooldown_ms=payload.cooldownMs,
        priority=payload.priority,
    )
    if target is None:
        return _envelope(False, error)

    # Ayırt edicilik uyarısı burada veriliyor, tıklamadan ÖNCE: düz bir şablon
    # ekranda binlerce yere uyar ve yanlış yere tıklar (ölçüm: tekdüze gri
    # şablon 1.7 milyon noktada 0.80 üstü skor verdi).
    from core.macro_engine import DISTINCTIVENESS_MIN

    if target.distinctiveness < DISTINCTIVENESS_MIN:
        return _envelope(
            True,
            f"Eklendi ama görsel fazla düz (ayırt edicilik {target.distinctiveness}). "
            "Daha detaylı, kenarları belirgin bir bölge kırp — yoksa yanlış yere tıklar.",
            {"target": target.__dict__, "warning": True},
        )
    return _envelope(True, f"'{target.name}' eklendi", {"target": target.__dict__})


class TargetUpdate(BaseModel):
    name: str | None = None
    threshold: float | None = None
    action: str | None = None
    key: str | None = None
    offset_x: int | None = None
    offset_y: int | None = None
    cooldown_ms: int | None = None
    priority: int | None = None
    enabled: bool | None = None


@router.patch("/targets/{target_id}")
async def update_target(target_id: str, payload: TargetUpdate) -> dict:
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "action" in changes and changes["action"] not in ACTIONS:
        return _envelope(False, f"Geçersiz eylem: {changes['action']}")
    if not engine.update_target(target_id, changes):
        return _envelope(False, "Hedef bulunamadı.")
    return _envelope(True, "Güncellendi")


@router.delete("/targets/{target_id}")
async def delete_target(target_id: str) -> dict:
    if not engine.delete_target(target_id):
        return _envelope(False, "Hedef bulunamadı.")
    return _envelope(True, "Silindi")


@router.get("/targets/{target_id}/image")
async def target_image(target_id: str):
    """Panelde önizleme için. Dosya adı motorun ürettiği id — kullanıcı girdisi
    yola karışmıyor, bu yüzden dizin dışına çıkma riski yok."""
    path = IMAGE_DIR / f"{target_id}.png"
    if not path.exists():
        return _envelope(False, "Görsel bulunamadı.")
    return FileResponse(path, media_type="image/png")


class SettingsUpdate(BaseModel):
    scan_interval_ms: int | None = None
    max_runtime_s: int | None = None
    max_actions: int | None = None
    region: list[int] | None = None


@router.patch("/settings")
async def update_settings(payload: SettingsUpdate) -> dict:
    changes = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "region" in changes and changes["region"] and len(changes["region"]) != 4:
        return _envelope(False, "Bölge [x, y, genişlik, yükseklik] olmalı.")
    engine.update_settings(changes)
    return _envelope(True, "Ayarlar kaydedildi", engine.status()["settings"])


@router.post("/start")
async def start_macro() -> dict:
    started, message = engine.start()
    return _envelope(started, message, engine.status())


@router.post("/stop")
async def stop_macro() -> dict:
    if not engine.stop():
        return _envelope(False, "Makro zaten durmuş.")
    return _envelope(True, "Durduruluyor")


@router.post("/probe")
async def probe() -> dict:
    """Tek tarama, TIKLAMADAN. Panelde eşik ayarlamak için: her hedefin şu anki
    skoru ve ekranda kaç yere uyduğu. Eşiği kör ayarlamak yerine ölçerek
    ayarlamayı sağlıyor."""
    missing = engine.missing_dependency()
    if missing:
        return _envelope(False, missing)
    if engine.status()["running"]:
        return _envelope(False, "Makro çalışırken deneme yapılamaz.")

    import cv2
    import mss
    import numpy as np

    from core.macro_engine import AMBIGUITY_WARN, load_template

    results = []
    with mss.MSS() as sct:
        settings = engine.settings
        if len(settings.region) == 4:
            x, y, w, h = settings.region
            region = {"left": x, "top": y, "width": w, "height": h}
        else:
            region = sct.monitors[1]
        frame = cv2.cvtColor(np.array(sct.grab(region)), cv2.COLOR_BGRA2BGR)

        for target in engine.targets:
            template, error = load_template(IMAGE_DIR / target.image)
            if template is None:
                results.append({"targetId": target.id, "name": target.name, "error": error})
                continue
            th, tw = template.shape[:2]
            if th > frame.shape[0] or tw > frame.shape[1]:
                results.append({
                    "targetId": target.id, "name": target.name,
                    "error": "Görsel arama bölgesinden büyük.",
                })
                continue

            matched = cv2.matchTemplate(frame, template, cv2.TM_CCOEFF_NORMED)
            _, score, _, loc = cv2.minMaxLoc(matched)
            candidates = int(np.sum(matched >= target.threshold))
            results.append({
                "targetId": target.id,
                "name": target.name,
                "score": round(float(score), 3),
                "threshold": target.threshold,
                "found": bool(score >= target.threshold),
                "candidates": candidates,
                "ambiguous": candidates > AMBIGUITY_WARN,
                "x": region["left"] + loc[0] + tw // 2,
                "y": region["top"] + loc[1] + th // 2,
            })

    return _envelope(True, "Deneme tamamlandı", {"results": results})
