"""AIRON — web backend (FastAPI).

main.py (kök dizindeki Tkinter/Gemini Live masaüstü uygulaması) ile TAMAMEN
BAĞIMSIZ, ayrı bir süreç olarak çalışır — ona hiç dokunmaz, hiçbir modülünü
değiştirmez. Sadece frontend/ için REST + WebSocket yüzeyi sağlar.

Çalıştırma: venv aktifken, proje kökünden
    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import automation, memory, settings, system, vision, voice
from backend.core.config import CORS_ORIGINS
from backend.websocket.manager import manager
from backend.websocket.router import router as websocket_router

logger = logging.getLogger("airon.backend")

# Masaüstü sürümünde (bkz. kökteki desktop.py) arayüz de buradan sunuluyor:
# `npm run build` çıktısı frontend/out/ altındaki statik dosyalar. Böylece
# uygulama çalışırken ayrıca bir Node sunucusu gerekmiyor — tek port, tek süreç.
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_EXPORT_DIR = BASE_DIR / "frontend" / "out"
# Ses efektleri (Start/Done/Error/Think.mp3) — Tkinter sürümünde Python çalıyordu,
# 3D arayüzde tarayıcı çalıyor. Dosyalar projede zaten var, kopyalamak yerine
# doğrudan buradan sunuluyor.
SFX_DIR = BASE_DIR / "SFX"

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Ses döngüsü ayrı bir thread'de çalışıyor (bkz. desktop.py) ve olayları
    # oradan yayınlıyor. `run_coroutine_threadsafe` için backend'in çalışan
    # döngüsüne ihtiyaç var — burada, gerçekten ayağa kalktığı anda bağlanıyor.
    manager.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="AIRON Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router_module in (voice, system, settings, vision, memory, automation):
    app.include_router(router_module.router)

app.include_router(websocket_router)


@app.get("/api/health")
async def health() -> dict:
    return {"success": True, "message": "AIRON backend çalışıyor", "data": {}}


if SFX_DIR.is_dir():
    app.mount("/sfx", StaticFiles(directory=SFX_DIR), name="sfx")

# DİKKAT: Bu mount EN SONDA olmalı — "/" altındaki her yolu yakalar. Yukarıdaki
# API ve WebSocket rotaları önce kaydedildiği için onlar gölgede kalmaz (Starlette
# rotaları kayıt sırasına göre eşleştirir).
#
# Export yoksa (ör. `npm run build` hiç çalıştırılmadıysa) mount edilmez: backend
# yine de API/WebSocket sunmaya devam eder ve `npm run dev` ile geliştirme akışı
# bozulmaz — geliştirmede arayüz 3000 portundan gelir, burası sadece veri sağlar.
if FRONTEND_EXPORT_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_EXPORT_DIR, html=True), name="ui")
else:
    logger.info(
        "Arayüz export'u bulunamadı (%s) — yalnızca API/WebSocket sunuluyor. "
        "Masaüstü penceresi için önce: cd frontend && npm run build",
        FRONTEND_EXPORT_DIR,
    )
