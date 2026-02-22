# ─────────────────────────────────────────────────────────────
# Backend Dockerfile (Multi-stage build)
# ─────────────────────────────────────────────────────────────
FROM python:3.13-slim AS backend-base

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install runtime dependencies only
RUN uv sync --frozen --no-group dev --no-group test --no-install-project

# ─────────────────────────────────────────────────────────────
# Backend production image
# ─────────────────────────────────────────────────────────────
FROM backend-base AS backend

COPY backend/ ./backend/

# Project install is not required; app is imported via PYTHONPATH

ENV PYTHONPATH=/app/backend
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8002

CMD ["uvicorn", "lumo_dashboard.main:app", "--host", "0.0.0.0", "--port", "8002"]
