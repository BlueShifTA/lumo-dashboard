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
  PYTHONPATH=backend uv run uvicorn lumo_dashboard.main:app --reload --port 8002

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
    --cov=backend/lumo_dashboard \
    --cov-report term-missing \
    --cov-report xml:coverage.xml \
    --cov-fail-under={{threshold}}

[group('test')]
[doc("Run the same checks as CI locally")]
run-ci:
  uv sync --frozen
  PYTHONPATH=backend uv run pytest backend/tests \
    --cov=backend/lumo_dashboard \
    --cov-report=xml:coverage.xml \
    --cov-report=term-missing \
    --cov-fail-under=80
  uv run ruff format --check backend
  uv run ruff check backend
  uv run python scripts/check_no_sys_path_mutation.py
  PYTHONPATH=backend uv run mypy backend/lumo_dashboard
  PYTHONPATH=backend uv run pyright backend/lumo_dashboard
  cd frontend && npm ci
  cd frontend && npm run lint
  cd frontend && NEXT_PUBLIC_API_BASE_URL=http://localhost:8002 npm run build

[group('test')]
[doc("Alias for run-ci")]
ci-local: run-ci

[group('test')]
[doc("Import backend app module to catch Python/runtime compatibility regressions")]
backend-import-smoke:
  PYTHONPATH=backend uv run python -c "import lumo_dashboard.main"

# ─────────────────────────────────────────────────────────────
# Linting & Formatting
# ─────────────────────────────────────────────────────────────

[group('lint')]
lint:
  uv run pre-commit run --config devops/.pre-commit-config.yaml --all-files

[group('lint')]
[doc("Run Ruff lint checks on backend code")]
ruff-lint:
  uv run ruff check backend

[group('lint')]
[doc("Reject sys.path.insert/append/extend path hacks in Python source")]
check-no-sys-path:
  uv run python scripts/check_no_sys_path_mutation.py

[group('lint')]
[doc("Check backend formatting with Ruff")]
ruff-format-check:
  uv run ruff format --check backend

[group('lint')]
[doc("Format backend code with Ruff")]
ruff-format-fix:
  uv run ruff format backend

[group('lint')]
format:
  uv run ruff format backend
  cd frontend && npm run lint -- --fix || true

[group('lint')]
typecheck:
  PYTHONPATH=backend uv run mypy backend/lumo_dashboard

[group('lint')]
[doc("Run Pyright type checking on backend code")]
pyright:
  PYTHONPATH=backend uv run pyright backend/lumo_dashboard

[group('lint')]
[doc("Run frontend ESLint")]
frontend-lint:
  cd frontend && npm run lint

[group('lint')]
[doc("Run frontend TypeScript type checking")]
frontend-typecheck:
  cd frontend && npm run typecheck

[group('lint')]
[doc("Run frontend ESLint with fixes")]
frontend-lint-fix:
  cd frontend && npm run lint -- --fix

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
  curl -s http://127.0.0.1:8002/openapi.json | python -m json.tool > openapi.json

[group('util')]
[doc("Generate frontend API client/types from FastAPI OpenAPI schema")]
generate-frontend-types:
  cd frontend && npm run api

[group('util')]
[doc("Create and push git tag: `just tag 0.0.1` or auto-increment with `just tag`")]
tag version="":
  @set -eu; \
  git fetch --tags --quiet; \
  input="{{version}}"; \
  if [ -n "$$input" ]; then \
    case "$$input" in \
      v*) tag="$$input" ;; \
      *) tag="v$$input" ;; \
    esac; \
  else \
    latest_tag="$$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | tail -n 1)"; \
    if [ -z "$$latest_tag" ]; then \
      tag="v0.0.1"; \
    else \
      next_patch="$$(echo "$${latest_tag#v}" | awk -F. '{print $$1 "." $$2 "." $$3+1}')"; \
      tag="v$$next_patch"; \
    fi; \
    printf "Create and push tag %s? [y/N] " "$$tag"; \
    read -r answer; \
    case "$$answer" in \
      y|Y|yes|YES) ;; \
      *) echo "Aborted."; exit 0 ;; \
    esac; \
  fi; \
  if git show-ref --tags --verify --quiet "refs/tags/$$tag"; then \
    echo "Tag $$tag already exists locally."; \
    exit 1; \
  fi; \
  git tag "$$tag"; \
  git push origin "$$tag"; \
  echo "Pushed $$tag"

[group('util')]
clean:
  rm -rf .venv .mypy_cache .ruff_cache .pytest_cache __pycache__ .coverage coverage.xml
  rm -rf frontend/.next frontend/node_modules
  find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

[group('run')]
[doc("Build Next.js static export for FastAPI to serve")]
build-frontend:
  cd frontend && NEXT_PUBLIC_API_BASE_URL= npm run build

[group('run')]
[doc("Run production-style backend on port 8002 (serves frontend/out if built)")]
run-prod:
  PYTHONPATH=backend uv run uvicorn lumo_dashboard.main:app --host 0.0.0.0 --port 8002

[group('util')]
[doc("Show production service status")]
service-status:
  systemctl status --no-pager lumo-dashboard.service || true
