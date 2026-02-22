"""Health data API endpoints."""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lumo_dashboard.core.health_db import get_metrics, save_daily_metrics
from lumo_dashboard.core.health_garmin import garmin_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])

_last_sync: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str
    session_id: str


@router.get("/status")
def health_status() -> dict:
    try:
        connected = garmin_client.is_connected()
        today_str = date.today().isoformat()
        rows = get_metrics(today_str, today_str)
        today = rows[0] if rows else None
        return {
            "connected": connected,
            "last_sync": _last_sync,
            "today": today,
        }
    except Exception as exc:
        log.error("health status error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/login")
def health_login(req: LoginRequest) -> dict:
    try:
        success = garmin_client.login(req.email, req.password)
        if success:
            return {"success": True, "message": "Connected to Garmin"}
        return {"success": False, "message": "Login failed — check credentials"}
    except Exception as exc:
        log.error("health login error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/sync")
def health_sync() -> dict:
    global _last_sync
    try:
        if not garmin_client.is_connected():
            raise HTTPException(status_code=401, detail="Not connected to Garmin")
        metrics = garmin_client.sync_today()
        if "error" in metrics:
            raise HTTPException(status_code=502, detail=metrics["error"])
        today_str = metrics.get("date", date.today().isoformat())
        save_daily_metrics(today_str, metrics)
        _last_sync = today_str
        return {"synced": True, "date": today_str, "metrics": metrics}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("health sync error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/history")
def health_history(days: int = 7) -> list:
    try:
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=days)).isoformat()
        return get_metrics(start, end)
    except Exception as exc:
        log.error("health history error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/chat")
async def health_chat(req: ChatRequest) -> dict:
    try:
        from lumo_dashboard.core.health_chat import chat
        return await chat(req.message, req.session_id)
    except Exception as exc:
        log.error("health chat error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
