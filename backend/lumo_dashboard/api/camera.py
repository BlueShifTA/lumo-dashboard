"""Camera API endpoints."""

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from lumo_dashboard.drivers.camera_driver import CameraStatus, get_camera

router = APIRouter(prefix="/camera", tags=["camera"])


class ModeRequest(BaseModel):
    mode: str


@router.get("/status")
def camera_status() -> CameraStatus:
    return get_camera().status()


@router.get("/snapshot")
def camera_snapshot() -> StreamingResponse:
    data = get_camera().get_jpeg(quality=85)
    if data is None:
        raise HTTPException(status_code=503, detail="Camera not ready")
    return StreamingResponse(iter([data]), media_type="image/jpeg")


async def _mjpeg_generator() -> AsyncIterator[bytes]:
    """Async MJPEG frame generator."""
    cam = get_camera()
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
    while True:
        data = cam.get_jpeg(quality=75)
        if data:
            yield boundary + data + b"\r\n"
        await asyncio.sleep(1 / 15)  # 15 fps


@router.get("/stream")
def camera_stream() -> StreamingResponse:
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",  # disable nginx buffering if proxied
        },
    )


@router.get("/mode")
def get_mode() -> dict[str, str]:
    return {"mode": get_camera().get_mode()}


@router.post("/mode")
def set_mode(req: ModeRequest) -> dict[str, str]:
    if req.mode not in ("rgb", "ir"):
        raise HTTPException(status_code=400, detail="mode must be 'rgb' or 'ir'")
    get_camera().set_mode(req.mode)
    return {"mode": req.mode}


@router.post("/start")
def camera_start() -> dict[str, bool]:
    get_camera().start()
    return {"running": True}


@router.post("/stop")
def camera_stop() -> dict[str, bool]:
    get_camera().stop()
    return {"running": False}
