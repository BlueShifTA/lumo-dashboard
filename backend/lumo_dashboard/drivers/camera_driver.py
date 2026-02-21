"""Camera driver for IMX219 CSI camera via GStreamer on Jetson Orin."""

import threading
import time
import logging

import cv2
import numpy as np

log = logging.getLogger(__name__)

try:
    import gi
    gi.require_version("Gst", "1.0")
    from gi.repository import Gst
    Gst.init(None)
    GST_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    # gi not in this Python env — try system dist-packages (Jetson)
    # Insert temporarily, then remove to avoid contaminating numpy ABI
    import sys
    _gi_path = "/usr/lib/python3/dist-packages"
    sys.path.insert(0, _gi_path)
    try:
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gst
        Gst.init(None)
        GST_AVAILABLE = True
        log.info("GStreamer loaded from system dist-packages")
    except Exception as e2:
        log.warning(f"GStreamer not available: {e2}")
        GST_AVAILABLE = False
    finally:
        # Remove immediately — don't let system packages bleed into lerobot imports
        try:
            sys.path.remove(_gi_path)
        except ValueError:
            pass
except Exception as e:
    log.warning(f"GStreamer not available: {e}")
    GST_AVAILABLE = False


class CameraDriver:
    """Thread-safe IMX219 camera via nvarguscamerasrc."""

    PIPELINE = (
        "nvarguscamerasrc sensor-id=0 ! "
        "video/x-raw(memory:NVMM), width=1920, height=1080, format=NV12, framerate=30/1 ! "
        "nvvidconv ! "
        "video/x-raw, format=BGRx ! "
        "videoconvert ! "
        "video/x-raw, format=BGR ! "
        "appsink name=sink drop=true max-buffers=1"
    )

    def __init__(self):
        self._lock = threading.Lock()
        self._latest: np.ndarray | None = None
        self._running = False
        self._connected = False
        self._pipeline = None
        self._sink = None
        self._thread: threading.Thread | None = None
        self.width = 1920
        self.height = 1080
        self.fps = 30
        self._mode = "rgb"  # "rgb" or "ir"

    def set_mode(self, mode: str):
        """Switch between rgb and ir mode."""
        if mode not in ("rgb", "ir"):
            raise ValueError(f"Invalid mode: {mode}. Must be 'rgb' or 'ir'")
        self._mode = mode
        log.info(f"Camera mode set to: {mode}")

    def get_mode(self) -> str:
        return self._mode

    def start(self):
        if self._running:
            return
        if not GST_AVAILABLE:
            log.warning("GStreamer unavailable — using test frame")
            self._running = True
            self._thread = threading.Thread(target=self._test_loop, daemon=True)
            self._thread.start()
            return
        try:
            self._pipeline = Gst.parse_launch(self.PIPELINE)
            self._sink = self._pipeline.get_by_name("sink")
            bus = self._pipeline.get_bus()
            bus.add_signal_watch()
            bus.connect("message", self._on_bus_message)
            self._pipeline.set_state(Gst.State.PLAYING)
            self._pipeline.get_state(5 * Gst.SECOND)
            self._running = True
            self._connected = True
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()
            log.info("Camera started via GStreamer")
        except Exception as e:
            log.error(f"Camera GStreamer init failed: {e} — falling back to test frame")
            self._running = True
            self._thread = threading.Thread(target=self._test_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._running = False
        if self._pipeline:
            self._pipeline.set_state(Gst.State.NULL)

    def _on_bus_message(self, bus, message):
        if message.type == Gst.MessageType.ERROR:
            err, _ = message.parse_error()
            log.error(f"GStreamer error: {err}")
            self._connected = False

    def _capture_loop(self):
        while self._running:
            try:
                sample = self._sink.emit("pull-sample")
                if sample:
                    buf = sample.get_buffer()
                    caps = sample.get_caps()
                    w = caps.get_structure(0).get_value("width")
                    h = caps.get_structure(0).get_value("height")
                    ok, data = buf.map(Gst.MapFlags.READ)
                    if ok:
                        frame = np.frombuffer(data.data, dtype=np.uint8).reshape(h, w, 3)
                        with self._lock:
                            self._latest = frame.copy()
                        buf.unmap(data)
            except Exception as e:
                log.warning(f"Capture error: {e}")
                time.sleep(0.1)

    def _test_loop(self):
        """Generate test frame when camera unavailable."""
        t = 0
        while self._running:
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            frame[:] = (30, 30, 30)
            cv2.putText(frame, "CAMERA TEST FRAME", (380, 340), cv2.FONT_HERSHEY_SIMPLEX,
                        1.5, (0, 200, 100), 3)
            cv2.putText(frame, f"Lumo Dashboard  t={t}", (460, 400),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (150, 150, 150), 2)
            cv2.circle(frame, (640, 360), 80 + int(30 * np.sin(t * 0.3)), (0, 100, 200), 4)
            with self._lock:
                self._latest = frame
            t += 1
            time.sleep(1 / 10)  # 10 fps test frame

    def get_frame(self) -> np.ndarray | None:
        with self._lock:
            return self._latest.copy() if self._latest is not None else None

    def get_jpeg(self, quality: int = 80) -> bytes | None:
        frame = self.get_frame()
        if frame is None:
            return None
        if self._mode == "ir":
            # Grayscale + CLAHE contrast enhancement — simulates IR-sensitive output
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            frame = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return buf.tobytes() if ok else None

    def is_connected(self) -> bool:
        return self._connected or self._running  # test mode counts as "available"

    def status(self) -> dict:
        return {
            "connected": self._running,
            "gstreamer": self._connected,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "mode": self._mode,
        }


_camera = CameraDriver()


def get_camera() -> CameraDriver:
    return _camera
