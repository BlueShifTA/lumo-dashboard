"""Arm control API endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lumo_dashboard.drivers.arm_driver import DualArmStatus, LegacyArmStatus, get_arm

router = APIRouter(prefix="/arm", tags=["arm"])

JointRange = tuple[float, float]
JointLimits = dict[str, JointRange]
CalibrationJoint = dict[str, float | str]
CalibrationRole = dict[str, CalibrationJoint]
CalibrationResponse = dict[str, CalibrationRole]


class MoveRequest(BaseModel):
    joints: dict[str, float] = Field(default_factory=dict)
    speed: int = 50


class JointMoveRequest(BaseModel):
    joint: str
    angle: float
    speed: int = 30  # 0–100 (% of max); default 30 for safety
    acceleration: int = 10  # 0–254; lower = smoother ramp; default 10


@router.get("/status")
def arm_status() -> LegacyArmStatus:
    return get_arm().get_status()


@router.get("/dual")
def arm_dual() -> DualArmStatus:
    return get_arm().get_dual_status()


@router.post("/move")
def arm_move(req: MoveRequest) -> dict[str, object]:
    return get_arm().move(req.joints, req.speed)


@router.post("/home")
def arm_home() -> dict[str, object]:
    return get_arm().home()


@router.post("/stop")
def arm_stop() -> dict[str, object]:
    return get_arm().stop()


@router.get("/calibration")
def arm_calibration() -> CalibrationResponse:
    """Return joint min/max in degrees and 0-100 for gripper, from calibration files."""
    import json
    from pathlib import Path

    CAL_ROOT = Path.home() / ".cache/huggingface/lerobot/calibration"
    MAX_RES = 4095  # STS3215

    result: CalibrationResponse = {}
    for role, cal_path in [
        ("follower", CAL_ROOT / "robots/so_follower/beluga_follower_arm.json"),
        ("leader", CAL_ROOT / "teleoperators/so_leader/beluga_leader_arm.json"),
    ]:
        if not cal_path.exists():
            result[role] = {}
            continue
        cal = json.loads(cal_path.read_text())
        joints: CalibrationRole = {}
        for name, data in cal.items():
            rmin, rmax = data["range_min"], data["range_max"]
            if name == "gripper":
                joints[name] = {"min": 0.0, "max": 100.0, "unit": "%"}
            else:
                half = (rmax - rmin) / 2 * 360 / MAX_RES
                joints[name] = {
                    "min": round(-half, 1),
                    "max": round(half, 1),
                    "unit": "deg",
                }
        result[role] = joints
    return result


def _get_joint_limits() -> JointLimits:
    """Return {joint: (min, max)} from calibration file."""
    import json
    from pathlib import Path

    MAX_RES = 4095
    cal_path = (
        Path.home()
        / ".cache/huggingface/lerobot/calibration/robots/so_follower/beluga_follower_arm.json"
    )
    if not cal_path.exists():
        return {}
    cal = json.loads(cal_path.read_text())
    limits: JointLimits = {}
    for name, data in cal.items():
        if name == "gripper":
            limits[name] = (0.0, 100.0)
        else:
            rmin, rmax = data["range_min"], data["range_max"]
            half = (rmax - rmin) / 2 * 360 / MAX_RES
            limits[name] = (-half, half)
    return limits


def _speed_to_goal_velocity(speed_pct: int) -> int:
    """Map UI speed % (0–100) to STS3215 Goal_Velocity raw value.

    STS3215 Goal_Velocity:
      0       = use maximum motor speed (no limit)
      1–3000  = steps/s limit; ~50 steps/s is very slow, ~2000 is fast

    We invert: speed_pct 0 → very slow (50), speed_pct 100 → no limit (0).
    At 30% default the motor moves at ~350 steps/s — safe and visible.
    """
    if speed_pct >= 100:
        return 0  # max speed, no limit
    # Linear map: 0% → 50, 100% → 0 (via clamp at 99%)
    return max(1, round(50 + (99 - speed_pct) / 99 * 1950))


@router.post("/follower/move")
def follower_joint_move(req: JointMoveRequest) -> dict[str, object]:
    arm = get_arm()
    if not arm.follower._connected or arm.follower._arm is None:
        raise HTTPException(status_code=503, detail="Follower arm not connected")

    # Clamp angle to calibrated limits — prevents out-of-range commands
    limits = _get_joint_limits()
    angle = req.angle
    if req.joint in limits:
        lo, hi = limits[req.joint]
        angle = max(lo, min(hi, angle))

    try:
        bus = arm.follower._arm  # FeetechMotorsBus
        joint_names = list(bus.motors.keys())

        # 1. Read current positions for all joints
        cur = bus.sync_read("Present_Position")
        goal: dict[str, float] = {}
        for name in joint_names:
            value = cur.get(name)
            if value is None:
                raise RuntimeError(f"Missing current position for joint: {name}")
            goal[name] = float(value)
        goal[req.joint] = angle

        # 2. Apply speed + acceleration to all joints so motion is smooth
        goal_vel = _speed_to_goal_velocity(req.speed)
        accel = max(0, min(254, req.acceleration))
        vel_dict = {name: goal_vel for name in joint_names}
        accel_dict = {name: accel for name in joint_names}
        bus.sync_write("Goal_Velocity", vel_dict)
        bus.sync_write("Acceleration", accel_dict)

        # 3. Enable torque and write target position
        bus.sync_write("Goal_Position", goal)
        bus.enable_torque()

        return {
            "ok": True,
            "joint": req.joint,
            "angle": angle,
            "clamped": angle != req.angle,
            "goal_velocity": goal_vel,
            "acceleration": accel,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
