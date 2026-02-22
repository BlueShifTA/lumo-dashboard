# Project Map (Fast Search)

Quick index for navigating the Lumo Dashboard repo without loading large docs.

## Start Here

- `CLAUDE.md` -> primary project guide (runtime model, commands, safety, links)
- `TASK.md` -> implementation brief / acceptance checklist
- `SPEC.md` -> architecture and hardware spec
- `AGENTS.md` -> repo workflow conventions

## Backend (FastAPI)

- `backend/lumo_dashboard/main.py` -> app entrypoint, router registration, frontend static serving
- `backend/lumo_dashboard/api/arm.py` -> arm status/control/calibration endpoints
- `backend/lumo_dashboard/api/camera.py` -> camera snapshot/stream/mode/start/stop
- `backend/lumo_dashboard/api/ws.py` -> telemetry websocket (`/ws/telemetry`)
- `backend/lumo_dashboard/api/config.py` -> runtime port config endpoints
- `backend/lumo_dashboard/api/processes.py` -> teleop/record process controls
- `backend/lumo_dashboard/drivers/arm_driver.py` -> arm integration / safety behavior
- `backend/lumo_dashboard/drivers/camera_driver.py` -> camera capture + JPEG/MJPEG support
- `backend/lumo_dashboard/core/config.py` -> in-memory runtime config (ports)

## Frontend (Next.js App Router)

- `frontend/app/page.js` -> main dashboard UI
- `frontend/app/layout.js` -> metadata/title and root layout
- `frontend/app/globals.css` -> global styling

## Tests

- `backend/tests/test_arm_safety.py` -> arm safety invariants (mock-based)
- `backend/tests/test_joint_range_limits.py` -> calibration/clamp and joint limit coverage

## Dev / Build / CI

- `justfile` -> primary local commands (`install`, `run-backend`, `run-frontend`, `test`, `run-ci`)
- `pyproject.toml` -> Python deps, mypy/ruff/coverage config
- `devops/backend.dockerfile` -> backend image
- `devops/frontend.dockerfile` -> frontend image
- `devops/backend.test.dockerfile` -> backend test image
- `.github/workflows/ci.yml` -> CI checks and image build smoke
- `.github/workflows/cd.yml` -> GHCR image publish workflow
- `docker-compose.yml` -> local compose stack
- `docker-compose.prod.yml` -> production overrides

## Runtime Ports (Current Defaults)

- Backend API / static frontend: `8002`
- Frontend dev server: `3000`

## Fast Grep Patterns

- Template leftovers:
  - `rg -n "app_template|App Template|api\\.example\\.com" .`
- API routes:
  - `rg -n "@router\\.(get|post|websocket)\\(" backend/lumo_dashboard/api`
- Frontend API usage:
  - `rg -n "/api/|/ws/" frontend/app`
- Safety-related code/tests:
  - `rg -n "stop|clamp|limit|torque|offline" backend/lumo_dashboard backend/tests`
