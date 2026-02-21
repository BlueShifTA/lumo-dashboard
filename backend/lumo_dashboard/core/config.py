"""Shared runtime config — ports and settings adjustable from the dashboard."""

import threading

_lock = threading.Lock()

_config = {
    "leader_port": "/dev/ttyACM0",
    "follower_port": "/dev/ttyACM1",
}


def get_config() -> dict:
    with _lock:
        return dict(_config)


def update_config(updates: dict) -> dict:
    with _lock:
        _config.update(updates)
        return dict(_config)


def get_leader_port() -> str:
    with _lock:
        return _config["leader_port"]


def get_follower_port() -> str:
    with _lock:
        return _config["follower_port"]
