"""Arm control API endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from lumo_dashboard.drivers.arm_driver import get_arm

router = APIRouter(prefix="/arm", tags=["arm"])


class MoveRequest(BaseModel):
    joints: dict[str, float] = {}
    speed: int = 50

class JointMoveRequest(BaseModel):
    joint: str
    angle: float


@router.get("/status")
def arm_status():
    return get_arm().get_status()


@router.get("/dual")
def arm_dual():
    return get_arm().get_dual_status()


@router.post("/move")
def arm_move(req: MoveRequest):
    return get_arm().move(req.joints, req.speed)


@router.post("/home")
def arm_home():
    return get_arm().home()


@router.post("/stop")
def arm_stop():
    return get_arm().stop()


@router.get("/calibration")
def arm_calibration():
    return get_arm().calibration()


@router.post("/follower/move")
def follower_joint_move(req: JointMoveRequest):
    arm = get_arm()
    if not arm.follower._connected or arm.follower._arm is None:
        raise HTTPException(status_code=503, detail="Follower arm not connected")
    try:
        arm.follower._arm.bus.sync_write("Goal_Position", {req.joint: req.angle})
        return {"ok": True, "joint": req.joint, "angle": req.angle}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
