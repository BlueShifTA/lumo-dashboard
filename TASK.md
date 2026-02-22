# Lumo Dashboard — Implementation Brief

Use `CLAUDE.md` as the primary project guide. This file captures the concrete delivery target for the dashboard build and verification.

## Objective

Deliver a working real-time robot arm + camera dashboard web app, run it locally on the target device, and capture proof that the camera/dashboard endpoints are serving correctly.

## Current Hardware Reality
- **Camera:** ✅ IMX219 CSI stereo camera, CONNECTED, working
  - GStreamer pipeline (NOT OpenCV V4L2 — that returns broken Bayer frames)
  - Pipeline: `nvarguscamerasrc → nvvidconv → BGR → appsink`
  - Reference: `backend/camera_service_reference.py` (production-ready, copy and use it)
- **Arm:** ❌ NOT connected — handle gracefully (show "Arm Offline" in UI, all arm endpoints return `{"connected": false}`)

## Full Specification

See `SPEC.md` for architecture and phase details. The requirements below are the implementation baseline for this task.

## Required Implementation

### Backend (FastAPI, port 8002)

Use the existing `lumo_dashboard` package. The backend should expose:

**`backend/lumo_dashboard/drivers/camera_driver.py`**
- Copy `camera_service_reference.py` as base
- Add MJPEG streaming: encode frames to JPEG via `cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])`
- Expose: `get_frame()` → numpy BGR array, `get_jpeg()` → bytes

**`backend/lumo_dashboard/api/camera.py`**
```python
GET /camera/snapshot  → JPEG image (single frame)
GET /camera/stream    → multipart/x-mixed-replace MJPEG stream
GET /camera/status    → {connected, fps, width, height}
```

**`backend/lumo_dashboard/api/arm.py`**
```python
GET /arm/status   → {connected: false, joints: {}, message: "Arm not connected"}
POST /arm/move    → {ok: false, error: "Arm not connected"}
POST /arm/home    → {ok: false, error: "Arm not connected"}
POST /arm/stop    → {ok: true}  # Always safe to acknowledge stop
```

**`backend/lumo_dashboard/api/ws.py`**
```python
WS /ws/telemetry  → 10Hz JSON:
{
  "ts": "ISO8601",
  "arm": {"connected": false, "joints": {}},
  "camera": {"connected": true, "fps": 30},
  "system": {"cpu_pct": X, "gpu_pct": X, "cpu_temp": X, "gpu_temp": X, "mem_pct": X}
}
```
Use `psutil` for system stats. GPU temp from `/sys/devices/virtual/thermal/thermal_zone*/temp` — zone 0 is CPU, try zones until you find GPU (usually thermal_zone1 or thermal_zone2 on Jetson).

**`backend/lumo_dashboard/main.py`**
- Mount all routers
- Mount frontend static build at root
- CORS: allow all origins (Tailscale access)
- Start camera service on startup

### Frontend (Next.js, served from FastAPI)

Build a static export (or other static output compatible with the current FastAPI file serving setup). FastAPI serves the frontend build from `frontend/out` at `/`.

**Layout — single page dashboard:**
```
┌────────────────────────────────────────────┐
│ 🦾 Lumo Dashboard  [ARM: Offline] [CAM: ●] │
│ CPU: XX% XX°C  GPU: XX% XX°C  MEM: XX%     │
├─────────────────────┬──────────────────────┤
│                     │                      │
│  JOINT PANEL        │  CAMERA FEED         │
│  (6 joints,         │  (MJPEG stream from  │
│   each shows name   │   /camera/stream)    │
│   + angle + status) │                      │
│                     │                      │
│  When arm offline:  │  Shows live camera   │
│  shows "--°" grayed │  or "No signal" if   │
│                     │  camera fails        │
├─────────────────────┴──────────────────────┤
│ TASK PANEL: [🏠 Home] [🛑 E-Stop] [status] │
│ E-Stop is always RED and prominent          │
└────────────────────────────────────────────┘
```

**Tech: Next.js static export + Tailwind CSS**
- Use `<img src="/camera/stream">` for MJPEG — browser handles it natively
- Use native WebSocket for telemetry (`ws://` or `wss://`)
- Recharts for system sparklines if needed
- Update status bar from WS telemetry at 10Hz

### Joint Panel — Arm Offline State
When arm is not connected, show:
```
shoulder_pan   --°  [OFFLINE]
shoulder_lift  --°  [OFFLINE]
elbow_flex     --°  [OFFLINE]
wrist_flex     --°  [OFFLINE]
wrist_roll     --°  [OFFLINE]
gripper        --°  [OFFLINE]
```
Gray/muted styling. Not an error — just "not connected yet."

## Local Run / Verification

**Backend:**
```bash
cd /home/nvidia/lumo-dashboard
pip install fastapi uvicorn psutil python-multipart opencv-python 2>/dev/null || true
cd backend && uvicorn lumo_dashboard.main:app --port 8002 --host 0.0.0.0
```

**Frontend build:**
```bash
cd /home/nvidia/lumo-dashboard/frontend
npm install
npm run build
# Copy output to where FastAPI serves static files
```

**Note on GStreamer + Python**
The camera service uses PyGObject (gi). Make sure to run in an environment where it's available:
```python
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
```
GStreamer IS installed on this Jetson. If import fails, try: `export GST_PLUGIN_PATH=/usr/lib/aarch64-linux-gnu/gstreamer-1.0`

**GStreamer Pipeline (exact, verified working):**
```python
pipeline_str = (
    'nvarguscamerasrc sensor-id=0 ! '
    'video/x-raw(memory:NVMM), width=1920, height=1080, format=NV12, framerate=30/1 ! '
    'nvvidconv ! '
    'video/x-raw, format=BGRx ! '
    'videoconvert ! '
    'video/x-raw, format=BGR ! '
    'appsink name=sink drop=true max-buffers=1'
)
```

## Acceptance Evidence

Collect proof that the system is serving:
1. Start the server
2. Capture an image from the running dashboard/camera path: `gnome-screenshot` or use Python:
```python
import subprocess
subprocess.run(['python3', '-c', '''
import urllib.request, time
# Capture one frame from MJPEG stream
req = urllib.request.urlopen("http://localhost:8002/camera/snapshot", timeout=5)
with open("/tmp/dashboard_proof.jpg", "wb") as f:
    f.write(req.read())
print("Frame saved to /tmp/dashboard_proof.jpg")
'''])
```
Also capture the full webpage (or equivalent HTML fetch evidence) via:
```bash
chromium-browser --headless --screenshot=/tmp/dashboard_screenshot.png --window-size=1280,800 http://localhost:8002 2>/dev/null || \
python3 -c "
import urllib.request
html = urllib.request.urlopen('http://localhost:8002').read()
print('Dashboard HTML length:', len(html), 'bytes')
print('First 200 chars:', html[:200])
"
```

## Completion Notification (Optional / Environment-Specific)

If you are working in the Beluga OpenClaw environment, send a completion event:

```bash
openclaw system event --text "lumo-dashboard DONE: dashboard running at http://localhost:8002. Camera streaming live. Screenshot at /tmp/dashboard_screenshot.png" --mode now
```

## Important Notes
- Port 8002 (NOT 8000 — that's the main OpenClaw gateway, don't touch it)
- Arm offline is expected — just handle it gracefully, not as an error
- Camera is live — the MJPEG stream should show actual video
- Keep backend and frontend in separate processes during dev, then serve frontend static from FastAPI
