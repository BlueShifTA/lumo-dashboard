"""WebSocket telemetry endpoint — 10Hz system + arm + camera stats."""

import asyncio
import json
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing_extensions import TypedDict

from lumo_dashboard.drivers.arm_driver import SingleArmStatus, get_arm
from lumo_dashboard.drivers.camera_driver import get_camera

router = APIRouter(tags=["telemetry"])


class SystemTelemetry(TypedDict):
    cpu_pct: float
    mem_pct: float
    cpu_temp: float
    gpu_temp: float


class CameraTelemetry(TypedDict):
    connected: bool
    fps: int
    width: int
    height: int


class TelemetryPayload(TypedDict):
    ts: str
    arm: dict[str, object]
    leader: SingleArmStatus
    follower: SingleArmStatus
    camera: CameraTelemetry
    system: SystemTelemetry


def _read_temp(zone: int = 0) -> float:
    try:
        with open(f"/sys/class/thermal/thermal_zone{zone}/temp") as f:
            return round(int(f.read().strip()) / 1000, 1)
    except Exception:
        return 0.0


def _build_telemetry() -> TelemetryPayload:
    dual = get_arm().get_dual_status()
    cam = get_camera().status()
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "arm": {
            # legacy single-arm field (follower) for backwards compat
            "connected": dual["follower"]["connected"],
            "joints": dual["follower"]["joints"],
        },
        "leader": dual["leader"],
        "follower": dual["follower"],
        "camera": {
            "connected": cam["connected"],
            "fps": cam["fps"],
            "width": cam["width"],
            "height": cam["height"],
        },
        "system": {
            "cpu_pct": psutil.cpu_percent(interval=None),
            "mem_pct": psutil.virtual_memory().percent,
            "cpu_temp": _read_temp(0),
            "gpu_temp": _read_temp(1),
        },
    }


@router.websocket("/ws/telemetry")
async def telemetry_ws(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            data = _build_telemetry()
            await ws.send_text(json.dumps(data))
            await asyncio.sleep(0.1)  # 10 Hz
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
