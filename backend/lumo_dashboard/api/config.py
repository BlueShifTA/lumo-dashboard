"""Runtime config API — port assignment and settings."""

from fastapi import APIRouter
from pydantic import BaseModel

from lumo_dashboard.core.config import get_config, update_config
from lumo_dashboard.drivers.arm_driver import get_arm

router = APIRouter(prefix="/config", tags=["config"])

VALID_PORTS = ["/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyUSB0", "/dev/ttyUSB1"]


class PortConfig(BaseModel):
    leader_port: str
    follower_port: str


@router.get("")
def get_current_config():
    return get_config()


@router.post("/ports")
def set_ports(req: PortConfig):
    if req.leader_port == req.follower_port:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Leader and follower ports must differ")
    update_config({"leader_port": req.leader_port, "follower_port": req.follower_port})
    # Reconnect arm monitors on new ports
    get_arm().set_ports(req.leader_port, req.follower_port)
    return get_config()
