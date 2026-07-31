from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.websocket.manager import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            # ileride istemciden gelen mesajlar henüz işlenmiyor — bağlantı
            # canlı tutuluyor. Gerçek olay akışı ileride main.py'ye bağlanacak.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
