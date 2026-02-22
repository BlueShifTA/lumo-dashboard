"""Camera driver for IMX219 CSI camera via GStreamer on Jetson Orin."""

from __future__ import annotations

import logging
import threading
import time
from importlib.machinery import PathFinder
from importlib.util import module_from_spec
from types import ModuleType
from typing import Protocol, cast

import cv2
import numpy as np
import numpy.typing as npt
from typing_extensions import TypedDict

log = logging.getLogger(__name__)
Gst: object | None = None


class _GstMapInfoProtocol(Protocol):
    data: bytes | bytearray | memoryview


class _GstCapsStructProtocol(Protocol):
    def get_value(self, key: str) -> int: ...


class _GstCapsProtocol(Protocol):
    def get_structure(self, index: int) -> _GstCapsStructProtocol: ...


class _GstBufferProtocol(Protocol):
    def map(self, flags: object) -> tuple[bool, _GstMapInfoProtocol]: ...
    def unmap(self, mapinfo: _GstMapInfoProtocol) -> None: ...


class _GstSampleProtocol(Protocol):
    def get_buffer(self) -> _GstBufferProtocol: ...
    def get_caps(self) -> _GstCapsProtocol: ...


class _GstSinkProtocol(Protocol):
    def emit(self, signal: str) -> _GstSampleProtocol | None: ...


class _GstBusProtocol(Protocol):
    def add_signal_watch(self) -> None: ...
    def connect(self, signal: str, callback: object) -> None: ...


class _GstErrorMessageProtocol(Protocol):
    type: object

    def parse_error(self) -> tuple[Exception, object]: ...


class _GstPipelineProtocol(Protocol):
    def get_by_name(self, name: str) -> _GstSinkProtocol | None: ...
    def get_bus(self) -> _GstBusProtocol: ...
    def set_state(self, state: object) -> object: ...
    def get_state(self, timeout: int) -> tuple[object, object, object]: ...


class _GstStateProtocol(Protocol):
    PLAYING: object
    NULL: object


class _GstStateChangeReturnProtocol(Protocol):
    ASYNC: object


class _GstMapFlagsProtocol(Protocol):
    READ: object


class _GstMessageTypeProtocol(Protocol):
    ERROR: object


class _GstModuleProtocol(Protocol):
    SECOND: int
    CLOCK_TIME_NONE: int
    State: _GstStateProtocol
    StateChangeReturn: _GstStateChangeReturnProtocol
    MapFlags: _GstMapFlagsProtocol
    MessageType: _GstMessageTypeProtocol

    def init(self, argv: object | None) -> None: ...
    def parse_launch(self, pipeline: str) -> _GstPipelineProtocol: ...


class _GiModuleProtocol(Protocol):
    def require_version(self, namespace: str, version: str) -> None: ...


class CameraStatus(TypedDict):
    connected: bool
    gstreamer: bool
    width: int
    height: int
    fps: int
    mode: str


def _import_gi_from_system_dist_packages() -> _GiModuleProtocol:
    """Load gi from Jetson system dist-packages without mutating sys.path."""
    import sys

    search_path = "/usr/lib/python3/dist-packages"
    spec = PathFinder.find_spec("gi", [search_path])
    if spec is None or spec.loader is None:
        raise ModuleNotFoundError("gi not found in system dist-packages")

    module = module_from_spec(spec)
    if not isinstance(module, ModuleType):
        raise ModuleNotFoundError("gi module spec did not produce a module")
    sys.modules.setdefault("gi", module)
    spec.loader.exec_module(module)
    return cast(_GiModuleProtocol, module)


try:
    import gi

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst as _GstImported

    gst_imported = cast(_GstModuleProtocol, _GstImported)
    Gst = gst_imported
    gst_imported.init(None)
    GST_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    # gi not in this Python env — try system dist-packages (Jetson) without
    # mutating sys.path.
    try:
        gi_mod = _import_gi_from_system_dist_packages()

        gi_mod.require_version("Gst", "1.0")
        from gi.repository import Gst as _GstImported

        gst_imported = cast(_GstModuleProtocol, _GstImported)
        Gst = gst_imported
        gst_imported.init(None)
        GST_AVAILABLE = True
        log.info("GStreamer loaded from system dist-packages")
    except Exception as e2:
        log.warning(f"GStreamer not available: {e2}")
        GST_AVAILABLE = False
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

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._latest: npt.NDArray[np.uint8] | None = None
        self._running = False
        self._connected = False
        self._pipeline: _GstPipelineProtocol | None = None
        self._sink: _GstSinkProtocol | None = None
        self._thread: threading.Thread | None = None
        self.width = 1920
        self.height = 1080
        self.fps = 30
        self._mode = "rgb"  # "rgb" or "ir"

    def set_mode(self, mode: str) -> None:
        """Switch between rgb and ir mode."""
        if mode not in ("rgb", "ir"):
            raise ValueError(f"Invalid mode: {mode}. Must be 'rgb' or 'ir'")
        self._mode = mode
        log.info(f"Camera mode set to: {mode}")

    def get_mode(self) -> str:
        return self._mode

    def start(self) -> None:
        if self._running:
            return
        gst = cast(_GstModuleProtocol | None, Gst)
        if not GST_AVAILABLE or gst is None:
            log.warning("GStreamer unavailable — using test frame")
            self._running = True
            self._thread = threading.Thread(target=self._test_loop, daemon=True)
            self._thread.start()
            return
        try:
            self._pipeline = gst.parse_launch(self.PIPELINE)
            self._sink = self._pipeline.get_by_name("sink")
            if self._sink is None:
                raise RuntimeError("GStreamer appsink not found")
            bus = self._pipeline.get_bus()
            bus.add_signal_watch()
            bus.connect("message", self._on_bus_message)
            self._pipeline.set_state(gst.State.PLAYING)
            self._pipeline.get_state(5 * gst.SECOND)
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

    def stop(self) -> None:
        self._running = False
        gst = cast(_GstModuleProtocol | None, Gst)
        if self._pipeline and gst is not None:
            self._pipeline.set_state(gst.State.NULL)

    def _on_bus_message(self, bus: object, message: _GstErrorMessageProtocol) -> None:
        del bus
        gst = cast(_GstModuleProtocol | None, Gst)
        if gst is None:
            return
        if message.type == gst.MessageType.ERROR:
            err, _ = message.parse_error()
            log.error(f"GStreamer error: {err}")
            self._connected = False

    def _capture_loop(self) -> None:
        gst = cast(_GstModuleProtocol | None, Gst)
        if gst is None:
            return
        while self._running:
            try:
                sink = self._sink
                if sink is None:
                    time.sleep(0.1)
                    continue
                sample = sink.emit("pull-sample")
                if sample:
                    buf = sample.get_buffer()
                    caps = sample.get_caps()
                    w = caps.get_structure(0).get_value("width")
                    h = caps.get_structure(0).get_value("height")
                    ok, data = buf.map(gst.MapFlags.READ)
                    if ok:
                        frame = np.frombuffer(data.data, dtype=np.uint8).reshape(
                            h, w, 3
                        )
                        with self._lock:
                            self._latest = frame.copy()
                        buf.unmap(data)
            except Exception as e:
                log.warning(f"Capture error: {e}")
                time.sleep(0.1)

    def _test_loop(self) -> None:
        """Generate test frame when camera unavailable."""
        t = 0
        while self._running:
            frame = cast(
                npt.NDArray[np.uint8], np.zeros((720, 1280, 3), dtype=np.uint8)
            )
            frame[:] = (30, 30, 30)
            cv2.putText(
                frame,
                "CAMERA TEST FRAME",
                (380, 340),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.5,
                (0, 200, 100),
                3,
            )
            cv2.putText(
                frame,
                f"Lumo Dashboard  t={t}",
                (460, 400),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (150, 150, 150),
                2,
            )
            cv2.circle(
                frame, (640, 360), 80 + int(30 * np.sin(t * 0.3)), (0, 100, 200), 4
            )
            with self._lock:
                self._latest = frame
            t += 1
            time.sleep(1 / 10)  # 10 fps test frame

    def get_frame(self) -> npt.NDArray[np.uint8] | None:
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
            frame = cast(
                npt.NDArray[np.uint8], cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
            )
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return buf.tobytes() if ok else None

    def is_connected(self) -> bool:
        return self._connected or self._running  # test mode counts as "available"

    def status(self) -> CameraStatus:
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
