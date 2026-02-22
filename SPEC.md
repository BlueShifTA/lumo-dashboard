# Lumo Dashboard — Specification
**Version:** 0.1  
**Date:** 2026-02-20  
**Status:** Draft — Ready for Implementation  
**Repo:** BlueShifTA/lumo-dashboard

See `CLAUDE.md` for the primary project guide and current repo/runtime conventions.

---

## 1. Overview

A real-time web dashboard for monitoring and controlling Beluga's physical body:
- SO-ARM101 6-DOF robot arm
- IMX219 stereo camera
- Live joint telemetry + task execution UI

**Access:** `http://orin-home.beluga-buri.ts.net:8002` (Tailscale, port 8002)

---

## 2. Hardware Reference

### Robot Arm: SO-ARM101
- **Port (follower):** `/dev/ttyACM1`
- **Port (leader/teleoperation):** `/dev/ttyACM0`
- **Calibration:** `~/.cache/huggingface/lerobot/calibration/robots/so_follower/beluga_follower_arm.json`
- **Library:** `lerobot` → `SOFollower` / `SOFollowerRobotConfig`
- **Control env:** `worklerobot` alias (activates LeRobot virtualenv)

#### Joint Map (6-DOF)
| Joint | Name | Range |
|-------|------|-------|
| J1 | shoulder_pan | ±180° |
| J2 | shoulder_lift | ±90° |
| J3 | elbow_flex | ±135° |
| J4 | wrist_flex | ±90° |
| J5 | wrist_roll | ±180° |
| J6 | gripper | 0–100% |

### Camera: IMX219 Stereo
- **Device:** `/dev/video0` (NVIDIA ISP5)
- **Pipeline:** `nvarguscamerasrc → GStreamer → nvvidconv → RGB`
- **Driver:** NVIDIA tegra-camera (NOT V4L2 — returns broken Bayer data)
- **Resolution:** 1920×1080 @ 30 FPS
- **Service:** `BelugaCamera` class (thread-safe, production script at `/home/nvidia/scripts/production/camera_service.py`)

### Compute
- **Platform:** Jetson Orin Nano 8GB (arm64)
- **Remote:** `orin-home.beluga-buri.ts.net` via Tailscale

---

## 3. Architecture

```
Browser (Remote via Tailscale)
         │
         ▼
FastAPI Backend (:8002)
├── /arm/*      → SOFollower control (lerobot subprocess)
├── /camera/*   → BelugaCamera (GStreamer)
├── /ws/telemetry → WebSocket: 10Hz joint + system data
└── /tasks/*    → Task queue + execution
         │
         ├── arm_driver.py  (wraps lerobot SOFollower)
         └── camera_service.py (existing production script)
```

---

## 4. API Endpoints

### Arm Control
```
GET  /arm/status        → {joints: {name: angle}, connected: bool, temp: float}
POST /arm/move          → {joints: {name: float}, speed: 0-100} → {ok, eta_ms}
POST /arm/home          → Move all joints to home position (0°)
POST /arm/stop          → Emergency stop (hold current position)
GET  /arm/calibration   → Return calibration data
```

### Camera
```
GET  /camera/frame      → Latest RGB frame (JPEG)
GET  /camera/stream     → MJPEG stream
GET  /camera/status     → {connected, fps, resolution}
```

### WebSocket
```
WS /ws/telemetry        → Push every 100ms:
{
  "ts": "ISO8601",
  "joints": {
    "shoulder_pan": {"pos": 45.2, "target": 45.0, "load": 0.12},
    "shoulder_lift": {...},
    ...
  },
  "gripper": {"pos": 50.0, "load": 0.08},
  "system": {"cpu": 23.4, "gpu": 41.2, "temp_cpu": 48.1, "temp_gpu": 52.3}
}
```

### Tasks
```
GET  /tasks             → List defined tasks
POST /tasks/{name}/run  → Execute named task
GET  /tasks/{name}/status → {running, progress, log}
POST /tasks/custom      → {script: "python3 ...", args: [...]}
```

---

## 5. Frontend Panels

### Panel 1: Connection Status Bar (top)
- Arm: 🟢 Connected / 🔴 Disconnected
- Camera: 🟢 Streaming / 🔴 Offline
- Port indicators: `/dev/ttyACM1`, `/dev/video0`
- Jetson temp: CPU/GPU °C

### Panel 2: Joint Telemetry (center-left)
- 6 joint dials — live angle, color-coded by load
- Numeric readout: angle in degrees + load %
- Update rate: 10 Hz via WebSocket
- History chart: last 30s per joint (sparkline)

### Panel 3: Camera Feed (center-right)
- MJPEG stream from `/camera/stream`
- Toggle: RGB / (future: IR thermal)
- FPS overlay

### Panel 4: 3D Arm Visualization (optional, phase 2)
- Three.js or simple SVG 2D side-view
- Animate joints from WebSocket data

### Panel 5: Task Execution (bottom)
- Predefined tasks (buttons):
  - 🏠 Home — all joints to 0°
  - 🛑 Emergency Stop
  - 📐 Wave (demo sequence)
  - 🤏 Gripper Open/Close
  - 🎯 Move to Pose (custom joint input)
- Custom script input (advanced)
- Task log: last 10 executions

---

## 6. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | FastAPI + Python | Same as LumoRobotic, matches your stack |
| WebSocket | FastAPI native | Built-in, no extra deps |
| Frontend | Next.js 15 + React 18 | Template base |
| Styling | Tailwind CSS | Template base |
| Charts | Recharts | Lightweight, already in pravafin |
| MJPEG | Direct GET stream | Simplest for camera feed |
| Scaffold origin | BlueShifTA/fastapi-nextjs-template | Historical source of the initial repo layout |

---

## 7. File Structure

```
lumo-dashboard/
├── .github/workflows/ci.yml
├── devops/
├── docs/
├── projects/
│   ├── backend/
│   │   ├── api/
│   │   │   ├── arm.py          ← arm endpoints + WebSocket
│   │   │   ├── camera.py       ← camera endpoints
│   │   │   └── tasks.py        ← task queue
│   │   ├── package/
│   │   │   ├── arm_driver.py   ← SOFollower wrapper
│   │   │   ├── camera_driver.py← BelugaCamera wrapper
│   │   │   └── task_runner.py  ← subprocess task execution
│   │   └── tests/
│   └── frontend/
│       └── src/
│           ├── app/
│           │   └── page.tsx    ← Dashboard layout
│           └── components/
│               ├── JointPanel.tsx
│               ├── CameraFeed.tsx
│               ├── TaskPanel.tsx
│               └── StatusBar.tsx
├── pyproject.toml
├── justfile                    ← dev commands
└── README.md
```

---

## 8. Safety Rules (Non-Negotiable)

- **Emergency stop** always visible — single click, no confirmation
- **Joint limits enforced in software** — backend rejects out-of-range moves
- **Connection watchdog** — if WS drops for >2s, arm holds position (no drift)
- **No auto-reconnect loop** — arm stays put until human confirms reconnect
- **Gripper never auto-closes** — only explicit commands

---

## 9. Implementation Phases

### Phase 1 — MVP (3-4 days)
- [x] Initialize repo from FastAPI/Next.js scaffold (completed)
- [ ] Backend: arm status + basic move + emergency stop
- [ ] Backend: camera frame endpoint
- [ ] Frontend: Status bar + joint readout (polling, not WS yet)
- [ ] Frontend: Camera feed panel
- [ ] Frontend: Home + E-stop buttons
- **Success:** Can read joints, see camera, send home command

### Phase 2 — Real-time (2-3 days)
- [ ] WebSocket telemetry (10 Hz)
- [ ] Joint sparkline charts
- [ ] Task queue + predefined tasks
- [ ] Custom joint pose input
- **Success:** Live updates without page refresh

### Phase 3 — Polish (2 days)
- [ ] 3D/2D arm visualization
- [ ] Task logging + history
- [ ] Mobile-responsive layout
- [ ] Dark mode

---

## 10. RAG & Token Budget Note

When working on this project:
- Workspace context for this project should be in `/home/nvidia/.openclaw/workspace/lumo-dashboard/`
- RAG will auto-index it — relevant hardware specs will be retrieved without full-context loading
- Keep implementation files lean; heavy docs go in `docs/` (excluded from RAG context injection)

---

## 11. Open Questions

- [ ] Should tasks run as subprocesses or in-process threads?
- [ ] Do we want LeRobot teleoperation mode in the dashboard (record episodes)?
- [ ] IR thermal camera — include in Phase 1 or later?
- [ ] Auth? (Tailscale-only access, so probably no auth needed)
