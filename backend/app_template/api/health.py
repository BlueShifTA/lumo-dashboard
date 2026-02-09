from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@router.get("/ready")
def readiness_check() -> dict[str, str]:
    """Readiness check for container orchestration."""
    # Add database/dependency checks here
    return {"status": "ready"}
