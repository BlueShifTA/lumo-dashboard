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
  app/                     Next.js App Router UI
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
- Python 3.13+
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

Device-style backend launcher (serves built frontend via FastAPI, port `8002`):

```bash
./start.sh
```

## API Surface (Current)

- `GET /health`
- `WS /ws/telemetry`
- `/api/arm/*`
- `/api/camera/*`
- `/api/config/*`
- `/api/processes/*`

OpenAPI docs:
- `/docs`
- `/redoc`

## Testing and Checks

```bash
just test
just test-cov 80
just typecheck
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
