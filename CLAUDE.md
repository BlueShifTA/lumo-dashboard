# Lumo Dashboard

Primary project guide for operators and developers working in this repository.

## What This Repo Is

Lumo Dashboard is a FastAPI + Next.js system for monitoring and controlling Beluga's robot arm and camera stack on a Jetson Orin device.

Current repo state:
- Backend app package: `backend/lumo_dashboard`
- Frontend app: `frontend/app` (Next.js App Router)
- Legacy scaffold package (`backend/app_template`) is deprecated and should not be used

## Primary References

- `TASK.md`: current implementation brief / delivery checklist
- `SPEC.md`: system specification, architecture, hardware details, and phase plan
- `AGENTS.md`: repository workflow conventions for coding agents
- `ProjectMap.md`: quick file index and grep shortcuts for fast navigation/search

Use this file first, then open `TASK.md` or `SPEC.md` as needed.

## Runtime Layout

- FastAPI backend serves APIs and (when built) the static frontend export
- WebSocket telemetry endpoint: `WS /ws/telemetry`
- REST APIs are mounted under `/api` (arm, camera, config, processes)
- Health endpoint: `GET /health`
- Frontend static build is served at `/` when `frontend/out` exists

## Ports and Start Commands

Common local/dev command paths:
- `just run-backend` -> runs `lumo_dashboard.main:app` on port `8002`
- `just run-frontend` -> Next.js dev server on port `3000`
- `./start.sh` -> device-oriented backend launcher on port `8002` (serves built frontend static files)

Recommended local workflow:
1. `just install`
2. `just run-backend`
3. `just run-frontend` (if working on frontend dev mode)

## Validation Commands

- `just test`
- `just test-cov 80`
- `just typecheck`
- `just lint`
- `just run-ci`

## Safety and Hardware Notes

- The arm may be disconnected; UI/API should degrade gracefully.
- Emergency stop behavior must remain easy to trigger and safe to call.
- Camera capture uses the Jetson/NVIDIA path (GStreamer), not generic OpenCV V4L2 for Bayer frames.
- Do not assume hardware is attached when writing tests; backend tests should remain mock-safe.

## Credential Handling

- Keep secrets in local `.env` (not committed).
- `.env.example` is placeholders/documentation only.
- Do not commit tokens, private keys, calibration secrets, or device credentials.

### Repo Secret Scan (Completed)

Scan date: February 22, 2026

Findings from a regex-based scan of the current working tree:
- No obvious hardcoded private keys or API tokens detected
- `.env.example` exists and contains placeholders/comments only

Limitations:
- This was a working-tree scan only (not a git history scan)
- It does not replace external secret scanners in CI

## Project Conventions (Short Version)

- Put hardware integration logic in `backend/lumo_dashboard/drivers/`
- Keep API handlers in `backend/lumo_dashboard/api/` thin and explicit
- Prefer tests in `backend/tests/` with mocks over hardware-dependent checks
- Keep docs practical and specific to the Jetson + Beluga environment
