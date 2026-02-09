# ─────────────────────────────────────────────────────────────
# Backend Dockerfile (Multi-stage build)
# ─────────────────────────────────────────────────────────────
FROM python:3.13-slim AS backend-base

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies (no dev deps in production)
RUN uv sync --frozen --no-dev --no-install-project

# ─────────────────────────────────────────────────────────────
# Backend production image
# ─────────────────────────────────────────────────────────────
FROM backend-base AS backend

COPY backend/ ./backend/

# Install the project itself
RUN uv sync --frozen --no-dev

ENV PYTHONPATH=/app/backend
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app_template.main:app", "--host", "0.0.0.0", "--port", "8000"]
