"""Arm driver stub — SO-ARM101 not connected."""

JOINT_NAMES = [
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
]


class ArmDriver:
    """Stub driver for SO-ARM101. Returns offline state until arm is connected."""

    def get_status(self) -> dict:
        return {
            "connected": False,
            "message": "Arm not connected — port /dev/ttyACM1 not available",
            "joints": {name: {"pos": None, "load": None} for name in JOINT_NAMES},
        }

    def move(self, joints: dict, speed: int = 50) -> dict:
        return {"ok": False, "error": "Arm not connected"}

    def home(self) -> dict:
        return {"ok": False, "error": "Arm not connected"}

    def stop(self) -> dict:
        # Always acknowledge stop for safety
        return {"ok": True, "message": "Stop acknowledged (arm offline)"}

    def calibration(self) -> dict:
        return {"ok": False, "error": "Arm not connected"}


_arm = ArmDriver()


def get_arm() -> ArmDriver:
    return _arm
