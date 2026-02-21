"""Dual arm driver — SO-ARM101 leader (/dev/ttyACM0) + follower (/dev/ttyACM1)."""

import sys
import threading
import time
import logging

log = logging.getLogger(__name__)

JOINT_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]

# Add lerobot to path
sys.path.insert(0, "/home/nvidia/Project/lerobot/src")

try:
    from lerobot.teleoperators.so_leader.so_leader import SOLeader
    from lerobot.teleoperators.so_leader.config_so_leader import SOLeaderTeleopConfig
    from lerobot.robots.so_follower.so_follower import SOFollower
    from lerobot.robots.so_follower.config_so_follower import SOFollowerRobotConfig
    LEROBOT_AVAILABLE = True
    log.info("LeRobot imports OK")
except Exception as e:
    LEROBOT_AVAILABLE = False
    log.warning(f"LeRobot not available: {e}")


def _empty_joints():
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
        self._thread = None
        self._arm = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name=f"arm-{self.name}")
        self._thread.start()

    def stop(self):
        self._running = False

    def _connect(self):
        try:
            if self.arm_type == "leader":
                config = SOLeaderTeleopConfig(port=self.port, use_degrees=True)
                arm = SOLeader(config)
            else:
                config = SOFollowerRobotConfig(port=self.port)
                arm = SOFollower(config)

            arm.connect(calibrate=False)
            self._arm = arm
            self._connected = True
            log.info(f"[{self.name}] Connected on {self.port}")
            return True
        except Exception as e:
            log.warning(f"[{self.name}] Connect failed: {e}")
            self._arm = None
            self._connected = False
            return False

    def _read_joints(self):
        try:
            if self.arm_type == "leader":
                raw = self._arm.get_action()
            else:
                raw = self._arm.get_observation()
            # raw = {"shoulder_pan.pos": 12.3, ...}
            joints = {}
            for name in JOINT_NAMES:
                key = f"{name}.pos"
                val = raw.get(key)
                joints[name] = {"pos": round(float(val), 1) if val is not None else None, "load": None}
            return joints
        except Exception as e:
            log.warning(f"[{self.name}] Read error: {e}")
            return None

    def _loop(self):
        retry_delay = 3.0
        while self._running:
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
                try:
                    if self._arm:
                        self._arm.disconnect()
                except Exception:
                    pass
                self._arm = None
                with self._lock:
                    self._joints = _empty_joints()
            else:
                with self._lock:
                    self._joints = joints

            time.sleep(0.1)  # 10 Hz

    def get_status(self) -> dict:
        with self._lock:
            return {
                "connected": self._connected,
                "port": self.port,
                "joints": dict(self._joints),
            }


class ArmDriver:
    """Dual-arm monitor: leader + follower."""

    def __init__(self):
        self.leader = SingleArmMonitor("leader", "/dev/ttyACM0", "leader")
        self.follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        self.leader.start()
        self.follower.start()

    def get_status(self) -> dict:
        """Legacy single-arm status — returns follower for backwards compat."""
        fs = self.follower.get_status()
        return {
            "connected": fs["connected"],
            "message": "Arm not connected" if not fs["connected"] else "OK",
            "joints": fs["joints"],
        }

    def get_dual_status(self) -> dict:
        return {
            "leader": self.leader.get_status(),
            "follower": self.follower.get_status(),
        }

    def move(self, joints: dict, speed: int = 50) -> dict:
        return {"ok": False, "error": "Move not implemented in monitor mode"}

    def home(self) -> dict:
        return {"ok": False, "error": "Home not implemented in monitor mode"}

    def stop(self) -> dict:
        return {"ok": True, "message": "Stop acknowledged"}

    def calibration(self) -> dict:
        return {"ok": False, "error": "Not implemented"}


_arm = ArmDriver()


def get_arm() -> ArmDriver:
    return _arm
