"""Dual arm driver — SO-ARM101 leader (/dev/ttyACM0) + follower (/dev/ttyACM1)."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Mapping
from importlib.util import find_spec
from typing import Protocol

from typing_extensions import TypedDict

log = logging.getLogger(__name__)

JOINT_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]

try:
    LEROBOT_AVAILABLE = find_spec("lerobot") is not None
    if LEROBOT_AVAILABLE:
        log.info("LeRobot package is available")
    else:
        log.warning("LeRobot package not available")
except Exception as e:
    LEROBOT_AVAILABLE = False
    log.warning(f"LeRobot not available: {e}")


class JointSample(TypedDict):
    pos: float | None
    load: float | None


JointsMap = dict[str, JointSample]


class SingleArmStatus(TypedDict):
    connected: bool
    port: str
    joints: JointsMap


class LegacyArmStatus(TypedDict):
    connected: bool
    message: str
    joints: JointsMap


class DualArmStatus(TypedDict):
    leader: SingleArmStatus
    follower: SingleArmStatus


class FeetechBusProtocol(Protocol):
    motors: Mapping[str, object]

    def connect(self, handshake: bool = True) -> None: ...
    def disconnect(self, disable_torque: bool = False) -> None: ...
    def sync_read(self, register: str) -> Mapping[str, float | None]: ...
    def sync_write(self, register: str, values: Mapping[str, int | float]) -> None: ...
    def enable_torque(self) -> None: ...


def _empty_joints() -> JointsMap:
    return {name: {"pos": None, "load": None} for name in JOINT_NAMES}


class SingleArmMonitor:
    """Reads joint positions from one arm in a background thread."""

    def __init__(self, name: str, port: str, arm_type: str):
        self.name = name
        self.port = port
        self.arm_type = arm_type  # "leader" or "follower"
        self._lock = threading.Lock()
        self._joints = _empty_joints()
        self._connected = False
        self._running = False
        self._paused = False
        self._thread: threading.Thread | None = None
        self._arm: FeetechBusProtocol | None = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._paused = False
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name=f"arm-{self.name}"
        )
        thread = self._thread
        if thread is not None:
            thread.start()

    def stop(self) -> None:
        self._running = False
        self._paused = False
        self._disconnect()

    def pause(self) -> None:
        """Release serial port without stopping the monitoring thread (e.g. before teleop)."""
        self._paused = True
        self._disconnect()
        with self._lock:
            self._connected = False
            self._joints = _empty_joints()
        log.info(f"[{self.name}] Paused (serial port released)")

    def resume(self) -> None:
        """Re-enable monitoring after teleop/record exits."""
        self._paused = False
        log.info(f"[{self.name}] Resumed (will reconnect)")

    def _connect(self) -> bool:
        try:
            # Use FeetechMotorsBus directly — read-only monitoring.
            # Never call configure() or enable_torque() so the arm stays
            # in whatever torque/position state it was already in.
            import json
            from pathlib import Path

            from lerobot.motors import Motor, MotorNormMode
            from lerobot.motors.feetech import FeetechMotorsBus

            norm = MotorNormMode.DEGREES
            motors = {
                "shoulder_pan": Motor(1, "sts3215", norm),
                "shoulder_lift": Motor(2, "sts3215", norm),
                "elbow_flex": Motor(3, "sts3215", norm),
                "wrist_flex": Motor(4, "sts3215", norm),
                "wrist_roll": Motor(5, "sts3215", norm),
                "gripper": Motor(6, "sts3215", MotorNormMode.RANGE_0_100),
            }

            # Load calibration file so positions are normalized correctly
            CAL_ROOT = Path.home() / ".cache/huggingface/lerobot/calibration"
            if self.arm_type == "leader":
                cal_path = CAL_ROOT / "teleoperators/so_leader/beluga_leader_arm.json"
            else:
                cal_path = CAL_ROOT / "robots/so_follower/beluga_follower_arm.json"

            calibration: object | None = None
            if cal_path.exists():
                from lerobot.motors import MotorCalibration

                raw_cal = json.loads(cal_path.read_text())
                calibration = {
                    name: MotorCalibration(
                        id=data["id"],
                        drive_mode=data["drive_mode"],
                        homing_offset=data["homing_offset"],
                        range_min=data["range_min"],
                        range_max=data["range_max"],
                    )
                    for name, data in raw_cal.items()
                }

            bus = FeetechMotorsBus(
                port=self.port, motors=motors, calibration=calibration
            )
            # Connect with handshake to verify motors are present — no torque/config changes
            bus.connect(handshake=True)
            self._arm = bus
            self._connected = True
            log.info(f"[{self.name}] Connected (read-only) on {self.port}")
            return True
        except Exception as e:
            log.warning(f"[{self.name}] Connect failed: {e}")
            self._arm = None
            self._connected = False
            return False

    def _read_joints(self) -> JointsMap | None:
        try:
            # Read Present_Position directly — no torque or Goal_Position writes
            arm = self._arm
            if arm is None:
                return None
            raw = arm.sync_read("Present_Position")
            joints: JointsMap = {}
            for name in JOINT_NAMES:
                val = raw.get(name)
                joints[name] = {
                    "pos": round(float(val), 1) if val is not None else None,
                    "load": None,
                }
            return joints
        except Exception as e:
            log.warning(f"[{self.name}] Read error: {e}")
            return None

    def _disconnect(self) -> None:
        try:
            if self._arm:
                # disconnect without touching torque — pass disable_torque=False
                self._arm.disconnect(disable_torque=False)
        except Exception:
            pass
        self._arm = None

    def _loop(self) -> None:
        retry_delay = 3.0
        while self._running:
            if self._paused:
                time.sleep(0.5)
                continue
            if not self._connected:
                if not LEROBOT_AVAILABLE:
                    time.sleep(5)
                    continue
                if not self._connect():
                    time.sleep(retry_delay)
                    continue

            joints = self._read_joints()
            if joints is None:
                # Read failed — mark disconnected, retry
                self._connected = False
                self._disconnect()
                with self._lock:
                    self._joints = _empty_joints()
            else:
                with self._lock:
                    self._joints = joints

            time.sleep(0.1)  # 10 Hz

    def get_status(self) -> SingleArmStatus:
        with self._lock:
            return {
                "connected": self._connected,
                "port": self.port,
                "joints": dict(self._joints),
            }


class ArmDriver:
    """Dual-arm monitor: leader + follower."""

    def __init__(self) -> None:
        from lumo_dashboard.core.config import get_follower_port, get_leader_port

        self.leader = SingleArmMonitor("leader", get_leader_port(), "leader")
        self.follower = SingleArmMonitor("follower", get_follower_port(), "follower")
        self.leader.start()
        self.follower.start()

    def pause_all(self) -> None:
        """Release serial ports so external processes (teleop/record) can use them."""
        self.leader.pause()
        self.follower.pause()

    def resume_all(self) -> None:
        """Resume monitoring after external process exits."""
        self.leader.resume()
        self.follower.resume()

    def set_ports(self, leader_port: str, follower_port: str) -> None:
        """Reconnect arms on new ports."""
        if self.leader.port != leader_port:
            self.leader.stop()
            self.leader = SingleArmMonitor("leader", leader_port, "leader")
            self.leader.start()
        if self.follower.port != follower_port:
            self.follower.stop()
            self.follower = SingleArmMonitor("follower", follower_port, "follower")
            self.follower.start()

    def get_status(self) -> LegacyArmStatus:
        """Legacy single-arm status — returns follower for backwards compat."""
        fs = self.follower.get_status()
        return {
            "connected": fs["connected"],
            "message": "Arm not connected" if not fs["connected"] else "OK",
            "joints": fs["joints"],
        }

    def get_dual_status(self) -> DualArmStatus:
        return {
            "leader": self.leader.get_status(),
            "follower": self.follower.get_status(),
        }

    def move(self, joints: Mapping[str, float], speed: int = 50) -> dict[str, object]:
        del joints, speed
        return {"ok": False, "error": "Move not implemented in monitor mode"}

    def home(self) -> dict[str, object]:
        return {"ok": False, "error": "Home not implemented in monitor mode"}

    def stop(self) -> dict[str, object]:
        return {"ok": True, "message": "Stop acknowledged"}

    def calibration(self) -> dict[str, object]:
        return {"ok": False, "error": "Not implemented"}


_arm = ArmDriver()


def get_arm() -> ArmDriver:
    return _arm
