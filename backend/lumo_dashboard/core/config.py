"""Shared runtime config — ports and settings adjustable from the dashboard."""

import threading

from typing_extensions import TypedDict

_lock = threading.Lock()


class RuntimeConfig(TypedDict):
    leader_port: str
    follower_port: str


class RuntimeConfigUpdate(TypedDict, total=False):
    leader_port: str
    follower_port: str


_config: RuntimeConfig = {
    "leader_port": "/dev/ttyACM0",
    "follower_port": "/dev/ttyACM1",
}


def _copy_config() -> RuntimeConfig:
    copied: RuntimeConfig = {
        "leader_port": _config["leader_port"],
        "follower_port": _config["follower_port"],
    }
    return copied


def get_config() -> RuntimeConfig:
    with _lock:
        return _copy_config()


def update_config(updates: RuntimeConfigUpdate) -> RuntimeConfig:
    with _lock:
        _config.update(updates)
        return _copy_config()


def get_leader_port() -> str:
    with _lock:
        return _config["leader_port"]


def get_follower_port() -> str:
    with _lock:
        return _config["follower_port"]
