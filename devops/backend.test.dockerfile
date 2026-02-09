# ─────────────────────────────────────────────────────────────
# Backend Test Dockerfile
# ─────────────────────────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install all dependencies including test
RUN uv sync --frozen

# Copy source code
COPY backend/ ./backend/

ENV PYTHONPATH=/app/backend
ENV PATH="/app/.venv/bin:$PATH"

CMD ["pytest", "backend/tests", "-v", "--cov=backend/app_template", "--cov-report=xml:coverage.xml"]
