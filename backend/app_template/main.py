from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app_template.api.health import router as health_router
from app_template.api.items import router as items_router
from app_template.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(items_router, prefix="/api")
