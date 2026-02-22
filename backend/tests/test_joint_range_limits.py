"""
Joint range limit tests — verify every controllable joint stays within
calibration bounds from ALL code paths in the dashboard.

No real hardware required. Pure mock tests.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Real calibration data from beluga_follower_arm.json
# ---------------------------------------------------------------------------
FAKE_CAL = {
    "shoulder_pan": {
        "id": 1,
        "drive_mode": 0,
        "homing_offset": -2027,
        "range_min": 943,
        "range_max": 3337,
    },
    "shoulder_lift": {
        "id": 2,
        "drive_mode": 0,
        "homing_offset": -1001,
        "range_min": 775,
        "range_max": 3266,
    },
    "elbow_flex": {
        "id": 3,
        "drive_mode": 0,
        "homing_offset": 1258,
        "range_min": 890,
        "range_max": 3081,
    },
    "wrist_flex": {
        "id": 4,
        "drive_mode": 0,
        "homing_offset": -1973,
        "range_min": 652,
        "range_max": 3222,
    },
    "wrist_roll": {
        "id": 5,
        "drive_mode": 0,
        "homing_offset": -1883,
        "range_min": 0,
        "range_max": 4095,
    },
    "gripper": {
        "id": 6,
        "drive_mode": 0,
        "homing_offset": 1107,
        "range_min": 1925,
        "range_max": 3343,
    },
}

MAX_RES = 4095


# Compute expected limits from calibration
def _expected_limits():
    limits = {}
    for name, data in FAKE_CAL.items():
        if name == "gripper":
            limits[name] = (0.0, 100.0)
        else:
            rmin, rmax = data["range_min"], data["range_max"]
            half = (rmax - rmin) / 2 * 360 / MAX_RES
            limits[name] = (-half, half)
    return limits


EXPECTED_LIMITS = _expected_limits()

JOINT_NAMES = list(FAKE_CAL.keys())

CURRENT_POSITIONS = {j: 0.0 for j in JOINT_NAMES}  # all at center


# ---------------------------------------------------------------------------
# Helper: set up module + mock bus
# ---------------------------------------------------------------------------
def _setup(cal_data=None):
    import sys

    for m in list(sys.modules):
        if "lumo_dashboard" in m:
            del sys.modules[m]
    sys.path.insert(0, str(Path(__file__).parent.parent))

    bus = MagicMock()
    bus.sync_read.return_value = dict(CURRENT_POSITIONS)

    mock_modules = {
        "lerobot": MagicMock(),
        "lerobot.motors": MagicMock(),
        "lerobot.motors.feetech": MagicMock(),
    }

    cal_json = json.dumps(cal_data or FAKE_CAL)

    with (
        patch.dict("sys.modules", mock_modules),
        patch("pathlib.Path.exists", return_value=True),
        patch("pathlib.Path.read_text", return_value=cal_json),
    ):
        import lumo_dashboard.drivers.arm_driver as arm_mod
        from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        follower._arm = bus
        follower._connected = True

        mock_driver = MagicMock()
        mock_driver.follower = follower
        arm_mod._arm = mock_driver

        from lumo_dashboard.api.arm import JointMoveRequest, follower_joint_move

    return follower_joint_move, JointMoveRequest, bus


def _sent_angle(bus, joint):
    """Extract what angle was actually sent to the motor for a joint."""
    assert bus.sync_write.called, "sync_write was never called"
    _, goal_dict = bus.sync_write.call_args[0]
    assert joint in goal_dict, f"Joint {joint} not in sync_write payload"
    return goal_dict[joint]


# ---------------------------------------------------------------------------
# Per-joint: exact calibration limits verified
# ---------------------------------------------------------------------------


class TestCalibrationLimitsExact:
    """Verify the calibration endpoint returns the correct limits for each joint."""

    def setup_method(self):
        import sys

        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

    MOCK_MODULES = {
        "lerobot": MagicMock(),
        "lerobot.motors": MagicMock(),
        "lerobot.motors.feetech": MagicMock(),
    }

    def _get_cal_result(self):
        import sys

        with (
            patch.dict(sys.modules, self.MOCK_MODULES),
            patch("pathlib.Path.exists", return_value=True),
            patch("pathlib.Path.read_text", return_value=json.dumps(FAKE_CAL)),
        ):
            from lumo_dashboard.api.arm import arm_calibration

            return arm_calibration()

    def test_shoulder_pan_limits(self):
        lim = self._get_cal_result()["follower"]["shoulder_pan"]
        assert abs(lim["min"] - (-105.2)) < 0.2
        assert abs(lim["max"] - 105.2) < 0.2

    def test_shoulder_lift_limits(self):
        lim = self._get_cal_result()["follower"]["shoulder_lift"]
        assert abs(lim["min"] - (-109.5)) < 0.2
        assert abs(lim["max"] - 109.5) < 0.2

    def test_elbow_flex_limits(self):
        lim = self._get_cal_result()["follower"]["elbow_flex"]
        assert abs(lim["min"] - (-96.3)) < 0.2
        assert abs(lim["max"] - 96.3) < 0.2

    def test_wrist_flex_limits(self):
        lim = self._get_cal_result()["follower"]["wrist_flex"]
        assert abs(lim["min"] - (-113.0)) < 0.2
        assert abs(lim["max"] - 113.0) < 0.2

    def test_wrist_roll_limits(self):
        lim = self._get_cal_result()["follower"]["wrist_roll"]
        assert abs(lim["min"] - (-180.0)) < 0.2
        assert abs(lim["max"] - 180.0) < 0.2

    def test_gripper_limits(self):
        lim = self._get_cal_result()["follower"]["gripper"]
        assert lim["min"] == 0.0
        assert lim["max"] == 100.0


# ---------------------------------------------------------------------------
# Per-joint: clamping at backend for every possible extreme
# ---------------------------------------------------------------------------


class TestPerJointClamping:
    """
    For every joint, verify that sending +9999 and -9999 both get clamped
    to exactly the calibration limit before reaching the motor.
    """

    @pytest.mark.parametrize("joint", JOINT_NAMES)
    def test_max_exceeded_clamped(self, joint):
        move_fn, ReqClass, bus = _setup()
        expected_max = EXPECTED_LIMITS[joint][1]
        move_fn(ReqClass(joint=joint, angle=9999.0))
        sent = _sent_angle(bus, joint)
        assert sent <= expected_max + 0.01, (
            f"[{joint}] Sent {sent:.2f} but max is {expected_max:.2f} — MOTOR COULD BURN"
        )

    @pytest.mark.parametrize("joint", JOINT_NAMES)
    def test_min_exceeded_clamped(self, joint):
        move_fn, ReqClass, bus = _setup()
        expected_min = EXPECTED_LIMITS[joint][0]
        move_fn(ReqClass(joint=joint, angle=-9999.0))
        sent = _sent_angle(bus, joint)
        assert sent >= expected_min - 0.01, (
            f"[{joint}] Sent {sent:.2f} but min is {expected_min:.2f} — MOTOR COULD BURN"
        )

    @pytest.mark.parametrize("joint", JOINT_NAMES)
    def test_valid_angle_passes_through(self, joint):
        """Mid-range angle should not be modified."""
        move_fn, ReqClass, bus = _setup()
        lo, hi = EXPECTED_LIMITS[joint]
        mid = round((lo + hi) / 2, 1)
        move_fn(ReqClass(joint=joint, angle=mid))
        sent = _sent_angle(bus, joint)
        assert abs(sent - mid) < 0.1, (
            f"[{joint}] Valid angle {mid} was unexpectedly modified to {sent}"
        )

    @pytest.mark.parametrize("joint", JOINT_NAMES)
    def test_max_boundary_exact(self, joint):
        """Sending exactly the max limit must pass through unchanged."""
        move_fn, ReqClass, bus = _setup()
        lo, hi = EXPECTED_LIMITS[joint]
        move_fn(ReqClass(joint=joint, angle=hi))
        sent = _sent_angle(bus, joint)
        assert abs(sent - hi) < 0.01, f"[{joint}] Exact max {hi} was modified to {sent}"

    @pytest.mark.parametrize("joint", JOINT_NAMES)
    def test_min_boundary_exact(self, joint):
        """Sending exactly the min limit must pass through unchanged."""
        move_fn, ReqClass, bus = _setup()
        lo, hi = EXPECTED_LIMITS[joint]
        move_fn(ReqClass(joint=joint, angle=lo))
        sent = _sent_angle(bus, joint)
        assert abs(sent - lo) < 0.01, f"[{joint}] Exact min {lo} was modified to {sent}"


# ---------------------------------------------------------------------------
# Frontend slider bounds (derived from calibration) are within backend clamp
# ---------------------------------------------------------------------------


class TestFrontendSliderBoundsConsistency:
    """
    Verify: frontend slider min/max (from /api/arm/calibration) are equal to
    or narrower than the backend clamp limits. If they diverge, the UI would
    let you request an angle the backend silently clamps — confusing UX.
    """

    def test_slider_limits_match_backend_clamp_limits(self):
        import sys

        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

        with (
            patch.dict(
                "sys.modules",
                {
                    "lerobot": MagicMock(),
                    "lerobot.motors": MagicMock(),
                    "lerobot.motors.feetech": MagicMock(),
                },
            ),
            patch("pathlib.Path.exists", return_value=True),
            patch("pathlib.Path.read_text", return_value=json.dumps(FAKE_CAL)),
        ):
            from lumo_dashboard.api.arm import _get_joint_limits, arm_calibration

        api_limits = arm_calibration()["follower"]  # what the UI gets
        clamp_limits = _get_joint_limits()  # what the backend uses

        for joint in JOINT_NAMES:
            ui_lim = api_limits.get(joint, {})
            lo, hi = clamp_limits.get(joint, (-180, 180))

            if joint == "gripper":
                assert ui_lim["min"] == 0.0 == lo
                assert ui_lim["max"] == 100.0 == hi
            else:
                assert abs(ui_lim["min"] - lo) < 0.2, (
                    f"[{joint}] UI min {ui_lim['min']} ≠ backend clamp min {lo}"
                )
                assert abs(ui_lim["max"] - hi) < 0.2, (
                    f"[{joint}] UI max {ui_lim['max']} ≠ backend clamp max {hi}"
                )


# ---------------------------------------------------------------------------
# /api/arm/move (bulk move) cannot reach motors
# ---------------------------------------------------------------------------


class TestBulkMoveDisabled:
    """/api/arm/move must NOT send Goal_Position — it's disabled in monitor mode."""

    def test_bulk_move_returns_error_not_implemented(self):
        import sys

        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

        with patch.dict(
            "sys.modules",
            {
                "lerobot": MagicMock(),
                "lerobot.motors": MagicMock(),
                "lerobot.motors.feetech": MagicMock(),
            },
        ):
            from lumo_dashboard.api.arm import MoveRequest, arm_move

        result = arm_move(MoveRequest(joints={"shoulder_pan": 9999.0}))
        assert result["ok"] is False
        assert "not implemented" in result["error"].lower()

    def test_bulk_move_never_reaches_bus(self):
        import sys

        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

        with patch.dict(
            "sys.modules",
            {
                "lerobot": MagicMock(),
                "lerobot.motors": MagicMock(),
                "lerobot.motors.feetech": MagicMock(),
            },
        ):
            import lumo_dashboard.drivers.arm_driver as arm_mod
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        bus = MagicMock()
        follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        follower._arm = bus
        follower._connected = True
        arm_mod._arm.follower = follower

        with patch.dict(
            "sys.modules",
            {
                "lerobot": MagicMock(),
                "lerobot.motors": MagicMock(),
                "lerobot.motors.feetech": MagicMock(),
            },
        ):
            from lumo_dashboard.api.arm import MoveRequest, arm_move

        arm_move(MoveRequest(joints={"shoulder_pan": 9999.0, "elbow_flex": -9999.0}))
        bus.sync_write.assert_not_called()
        bus.enable_torque.assert_not_called()
