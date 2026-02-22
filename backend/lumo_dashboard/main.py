"""Lumo Dashboard — FastAPI app."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from lumo_dashboard.api.arm import router as arm_router
from lumo_dashboard.api.camera import router as camera_router
from lumo_dashboard.api.config import router as config_router
from lumo_dashboard.api.processes import router as processes_router
from lumo_dashboard.api.ws import router as ws_router
from lumo_dashboard.drivers.camera_driver import get_camera

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend" / "out"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    del app
    log.info("Starting camera...")
    get_camera().start()
    log.info("Camera started")
    yield
    log.info("Stopping camera...")
    get_camera().stop()


app = FastAPI(title="Lumo Dashboard", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(camera_router, prefix="/api")
app.include_router(arm_router, prefix="/api")
app.include_router(ws_router)
app.include_router(processes_router, prefix="/api")
app.include_router(config_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "lumo-dashboard"}


# Serve frontend static files if built
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    log.info(f"Serving frontend from {FRONTEND_DIR}")
else:
    log.warning(f"Frontend not built yet — {FRONTEND_DIR} missing")

    @app.get("/")
    def root() -> dict[str, str]:
        return {
            "message": "Lumo Dashboard API running. Frontend not built yet.",
            "docs": "/docs",
        }
