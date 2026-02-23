# Lumo Dashboard

Lumo Dashboard is a FastAPI + Next.js application for monitoring and controlling Beluga's robot arm and camera system on a Jetson Orin device.

This repo is no longer a generic scaffold. The active backend package is `backend/lumo_dashboard`, and the frontend is tailored to the arm/camera dashboard workflow.

## Start Here

- `CLAUDE.md`: primary operator/developer guide (current runtime model, commands, safety notes)
- `TASK.md`: implementation brief and acceptance checklist
- `SPEC.md`: architecture, hardware reference, and phased plan

## Project Structure

```text
backend/
  lumo_dashboard/          FastAPI app (APIs, drivers, runtime config)
  camera_service_reference.py
  tests/                   Mock-safe backend tests (arm safety, joint limits)
frontend/
  app/                     Next.js App Router entrypoints
  src/                     Dashboard UI (MUI), API client, hooks, theme
devops/
  backend.dockerfile
  backend.test.dockerfile
  frontend.dockerfile
  .pre-commit-config.yaml
.github/workflows/         CI/CD pipelines
justfile                   Dev/test/lint helpers
```

## Local Development

Prerequisites:
- Python 3.10.x (required by `pyproject.toml`)
- Node.js 22+
- `uv`
- `just`

Install dependencies:

```bash
just install
```

Run backend (FastAPI, port `8002`):

```bash
just run-backend
```

Run frontend dev server (port `3000`):

```bash
just run-frontend
```

Build static frontend export for FastAPI (`frontend/out`):

```bash
just build-frontend
```

Device-style backend launcher (serves built frontend via FastAPI, port `8002`):

```bash
./start.sh
```

Production-style backend only (serves `frontend/out` if built):

```bash
just run-prod
```

## Frontend Stack (Current)

- Next.js 15 + React 19
- Material UI (`@mui/material`) + Emotion
- TanStack Query (`@tanstack/react-query`) for API state
- Generated API client/types via Orval (`just generate-frontend-types`)

## API Surface (Current)

- `GET /health`
- `WS /ws/telemetry`
- `/api/arm/*` (`status`, `dual`, `move`, `home`, `stop`, `calibration`, `follower/move`)
- `/api/camera/*` (`status`, `snapshot`, `stream`, `mode`, `start`, `stop`)
- `/api/config` and `POST /api/config/ports`
- `/api/processes/*` (`status`, `teleop/*`, `record/*`)

WebSocket telemetry currently includes legacy `arm` plus `leader` / `follower` arm payloads, camera status, and system stats.

OpenAPI docs:
- `/docs`
- `/redoc`

## Testing and Checks

```bash
just test
just test-cov 80
just typecheck
just pyright
just frontend-typecheck
just frontend-lint
just lint
just run-ci
```

## Configuration

Copy the example env file and adjust for your environment:

```bash
cp .env.example .env
```

Common settings:
- `API_HOST`, `API_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `DEBUG`

For production-style same-origin serving through FastAPI, `just build-frontend` uses an empty `NEXT_PUBLIC_API_BASE_URL`.
Arm serial ports are currently adjusted at runtime via `GET /api/config` and `POST /api/config/ports`.

Auth is optional in this repo. If you add auth, generate a real secret and keep it out of git.

## Docker

Development-style compose:

```bash
just docker-up
just docker-logs
just docker-down
```

Production override:

```bash
just docker-prod
```

## Notes

- Hardware may be partially connected during development (camera on, arm off). The UI and APIs should degrade gracefully.
- Backend tests are written to avoid requiring live hardware.
- `frontend/out` is generated build output and is not tracked in git.
