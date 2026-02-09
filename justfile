set dotenv-load

_default:
  @just --list

# ─────────────────────────────────────────────────────────────
# Installation
# ─────────────────────────────────────────────────────────────

[group('install')]
install:
  uv sync --all-packages
  uv run pre-commit install --config devops/.pre-commit-config.yaml
  cd frontend && npm install

[group('install')]
install-backend:
  uv sync --all-packages
  uv run pre-commit install --config devops/.pre-commit-config.yaml

[group('install')]
install-frontend:
  cd frontend && npm install

# ─────────────────────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────────────────────

[group('run')]
run-backend:
  PYTHONPATH=backend uv run uvicorn app_template.main:app --reload --port 8000

[group('run')]
run-frontend:
  cd frontend && npm run dev

[group('run')]
[doc("Run both backend and frontend (requires terminal multiplexer)")]
run-all:
  @echo "Run 'just run-backend' and 'just run-frontend' in separate terminals"

# ─────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────

[group('test')]
test:
  PYTHONPATH=backend uv run pytest

[group('test')]
[doc("Run backend tests with coverage and fail if below threshold")]
test-cov threshold="80":
  PYTHONPATH=backend uv run pytest backend/tests \
    --cov=backend/app_template \
    --cov-report term-missing \
    --cov-report xml:coverage.xml \
    --cov-fail-under={{threshold}}

# ─────────────────────────────────────────────────────────────
# Linting & Formatting
# ─────────────────────────────────────────────────────────────

[group('lint')]
lint:
  uv run pre-commit run --config devops/.pre-commit-config.yaml --all-files

[group('lint')]
format:
  uv run ruff format backend
  cd frontend && npm run lint -- --fix || true

[group('lint')]
typecheck:
  PYTHONPATH=backend uv run mypy backend/app_template

# ─────────────────────────────────────────────────────────────
# Docker
# ─────────────────────────────────────────────────────────────

[group('docker')]
docker-build:
  docker compose build

[group('docker')]
docker-up:
  docker compose up -d

[group('docker')]
docker-down:
  docker compose down

[group('docker')]
docker-logs:
  docker compose logs -f

[group('docker')]
[doc("Build and run in production mode")]
docker-prod:
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

[group('util')]
[doc("Export OpenAPI schema from running backend")]
export-openapi:
  curl -s http://127.0.0.1:8000/openapi.json | python -m json.tool > openapi.json

[group('util')]
clean:
  rm -rf .venv .mypy_cache .ruff_cache .pytest_cache __pycache__ .coverage coverage.xml
  rm -rf frontend/.next frontend/node_modules
  find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
