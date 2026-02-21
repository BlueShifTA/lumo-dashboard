"""LeRobot process manager — start/stop/status for teleop and record."""

import subprocess
import threading
import signal
import logging
from collections import deque
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter(prefix="/processes", tags=["processes"])

LEROBOT_BIN = "/home/nvidia/miniforge3/envs/lerobot/bin"
FOLLOWER_PORT = "/dev/ttyACM1"
LEADER_PORT = "/dev/ttyACM0"

TELEOP_CMD = [
    f"{LEROBOT_BIN}/lerobot-teleoperate",
    "--robot.type=so101_follower",
    f"--robot.port={FOLLOWER_PORT}",
    "--robot.id=beluga_follower",
    "--teleop.type=so101_leader",
    f"--teleop.port={LEADER_PORT}",
    "--teleop.id=beluga_leader",
    "--display_data=false",
]


class ManagedProcess:
    """Wraps a subprocess with output capture and lifecycle management."""

    def __init__(self, name: str):
        self.name = name
        self._proc: subprocess.Popen | None = None
        self._log: deque = deque(maxlen=50)
        self._lock = threading.Lock()

    @property
    def running(self) -> bool:
        with self._lock:
            return self._proc is not None and self._proc.poll() is None

    def start(self, cmd: list[str]) -> None:
        if self.running:
            self.stop()
        with self._lock:
            self._log.clear()
            try:
                self._proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
                t = threading.Thread(target=self._drain, daemon=True)
                t.start()
                log.info(f"[{self.name}] Started PID={self._proc.pid}")
            except Exception as e:
                log.error(f"[{self.name}] Start failed: {e}")
                self._log.append(f"ERROR: {e}")
                self._proc = None
                raise

    def stop(self) -> None:
        with self._lock:
            proc = self._proc
        if proc and proc.poll() is None:
            try:
                proc.send_signal(signal.SIGINT)
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            log.info(f"[{self.name}] Stopped")

    def _drain(self) -> None:
        proc = self._proc
        if not proc:
            return
        for line in proc.stdout:
            line = line.rstrip()
            with self._lock:
                self._log.append(line)

    def status(self) -> dict:
        with self._lock:
            pid = self._proc.pid if self._proc else None
            rc = self._proc.poll() if self._proc else None
            logs = list(self._log)[-20:]
        return {
            "running": self.running,
            "pid": pid if self.running else None,
            "returncode": rc,
            "log": logs,
            "last_line": logs[-1] if logs else "",
        }


class RecordRequest(BaseModel):
    task: str = "Pick and place"
    num_episodes: int = 10
    repo_id: str = "beluga-orin/demo"


# Global process instances
_teleop = ManagedProcess("teleop")
_record = ManagedProcess("record")


@router.get("/status")
def all_status():
    return {
        "teleop": _teleop.status(),
        "record": _record.status(),
    }


@router.post("/teleop/start")
def teleop_start():
    try:
        _teleop.start(TELEOP_CMD)
        return {"ok": True, "pid": _teleop._proc.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/teleop/stop")
def teleop_stop():
    _teleop.stop()
    return {"ok": True}


@router.post("/record/start")
def record_start(req: RecordRequest):
    cmd = [
        f"{LEROBOT_BIN}/lerobot-record",
        "--robot.type=so101_follower",
        f"--robot.port={FOLLOWER_PORT}",
        "--robot.id=beluga_follower",
        "--teleop.type=so101_leader",
        f"--teleop.port={LEADER_PORT}",
        "--teleop.id=beluga_leader",
        f"--dataset.repo_id={req.repo_id}",
        f"--dataset.num_episodes={req.num_episodes}",
        f"--dataset.single_task={req.task}",
        "--display_data=false",
    ]
    try:
        _record.start(cmd)
        return {"ok": True, "pid": _record._proc.pid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record/stop")
def record_stop():
    _record.stop()
    return {"ok": True}
