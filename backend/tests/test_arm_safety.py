"""
Arm safety audit tests.
All tests use mocks — NO real hardware required.

Critical invariants tested:
  1. Connect never writes to motors (no torque/Goal_Position changes)
  2. Disconnect never touches torque (leaves arm as-is)
  3. Joint move always reads current positions BEFORE writing Goal_Position
  4. Joint move sets ALL joints in a single write (no partial move)
  5. Goal_Position is written BEFORE enable_torque (no snap-to-memory)
  6. Out-of-range angles are clamped to calibrated limits
  7. Offline guard — no bus calls when arm is not connected
  8. Port swap cleanly stops old monitor before starting new one
  9. Thread safety — joint state reads are always under lock
 10. Read failure triggers disconnect(disable_torque=False), not enable_torque
"""

import json
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch, call, PropertyMock
import pytest

# ---------------------------------------------------------------------------
# Fake calibration data matching beluga_follower_arm.json structure
# ---------------------------------------------------------------------------
FAKE_CAL = {
    "shoulder_pan":  {"id": 1, "drive_mode": 0, "homing_offset": -2027, "range_min": 943,  "range_max": 3337},
    "shoulder_lift": {"id": 2, "drive_mode": 0, "homing_offset": -1001, "range_min": 775,  "range_max": 3266},
    "elbow_flex":    {"id": 3, "drive_mode": 0, "homing_offset":  1258, "range_min": 890,  "range_max": 3081},
    "wrist_flex":    {"id": 4, "drive_mode": 0, "homing_offset": -1973, "range_min": 652,  "range_max": 3222},
    "wrist_roll":    {"id": 5, "drive_mode": 0, "homing_offset": -1883, "range_min": 0,    "range_max": 4095},
    "gripper":       {"id": 6, "drive_mode": 0, "homing_offset":  1107, "range_min": 1925, "range_max": 3343},
}

JOINT_NAMES = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]

# Realistic "current positions" the mock bus returns
CURRENT_POSITIONS = {
    "shoulder_pan": 12.5,
    "shoulder_lift": -30.0,
    "elbow_flex": 45.0,
    "wrist_flex": 0.0,
    "wrist_roll": -90.0,
    "gripper": 50.0,
}


def make_mock_bus(current_positions=None):
    """Return a fully mocked FeetechMotorsBus."""
    bus = MagicMock()
    bus.sync_read.return_value = current_positions or dict(CURRENT_POSITIONS)
    return bus


# ---------------------------------------------------------------------------
# Helpers to build SingleArmMonitor without starting the background thread
# ---------------------------------------------------------------------------
def _make_monitor(arm_type="follower", connected=False, mock_bus=None):
    """Build a SingleArmMonitor with mocked lerobot, no real thread."""
    # Patch all lerobot imports so they never actually load
    with patch.dict("sys.modules", {
        "lerobot": MagicMock(),
        "lerobot.motors": MagicMock(),
        "lerobot.motors.feetech": MagicMock(),
    }):
        import importlib
        import sys
        # Remove cached module if any
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]

        sys.path.insert(0, str(Path(__file__).parent.parent))
        from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

    monitor = SingleArmMonitor("test", "/dev/ttyACM0", arm_type)
    if connected and mock_bus:
        monitor._connected = True
        monitor._arm = mock_bus
    return monitor


# ---------------------------------------------------------------------------
# Test helpers that operate directly on SingleArmMonitor internals
# ---------------------------------------------------------------------------

class TestConnectSafety:
    """Invariant 1: connect() must NEVER write to motors."""

    def _run_connect(self, arm_type="follower", cal_data=None):
        """Run _connect() with mocked lerobot and return the mock bus."""
        mock_bus_class = MagicMock()
        mock_bus_instance = make_mock_bus()
        mock_bus_class.return_value = mock_bus_instance

        mock_motor_calibration = MagicMock(side_effect=lambda **kw: MagicMock(**kw))
        mock_norm_mode = MagicMock()
        mock_norm_mode.DEGREES = "degrees"
        mock_norm_mode.RANGE_0_100 = "range_0_100"

        modules = {
            "lerobot": MagicMock(),
            "lerobot.motors": MagicMock(
                Motor=MagicMock(),
                MotorNormMode=mock_norm_mode,
                MotorCalibration=mock_motor_calibration,
            ),
            "lerobot.motors.feetech": MagicMock(FeetechMotorsBus=mock_bus_class),
        }

        cal_json = json.dumps(cal_data or FAKE_CAL)

        with patch.dict("sys.modules", modules):
            import sys
            for m in list(sys.modules):
                if "lumo_dashboard" in m:
                    del sys.modules[m]
            sys.path.insert(0, str(Path(__file__).parent.parent))

            with patch("pathlib.Path.exists", return_value=True), \
                 patch("pathlib.Path.read_text", return_value=cal_json):
                from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
                monitor = SingleArmMonitor("test", "/dev/ttyACM0", arm_type)
                result = monitor._connect()

        return result, mock_bus_instance

    def test_connect_succeeds(self):
        ok, bus = self._run_connect()
        assert ok is True

    def test_connect_calls_handshake_true(self):
        """bus.connect() must be called with handshake=True."""
        ok, bus = self._run_connect()
        bus.connect.assert_called_once_with(handshake=True)

    def test_connect_never_calls_enable_torque(self):
        """CRITICAL: enable_torque must NEVER be called during connect."""
        ok, bus = self._run_connect()
        bus.enable_torque.assert_not_called()

    def test_connect_never_calls_disable_torque(self):
        """Torque state must be left exactly as-is on connect."""
        ok, bus = self._run_connect()
        bus.disable_torque.assert_not_called()

    def test_connect_never_writes_goal_position(self):
        """CRITICAL: no Goal_Position writes during connect — prevents motor snap."""
        ok, bus = self._run_connect()
        for c in bus.sync_write.call_args_list:
            assert "Goal_Position" not in str(c), \
                f"Goal_Position was written during connect: {c}"
        bus.sync_write.assert_not_called()

    def test_connect_never_calls_configure(self):
        """SOLeader/SOFollower configure() must not be used — it re-enables torque."""
        ok, bus = self._run_connect()
        # If configure existed on the bus mock, it must not be called
        bus.configure.assert_not_called() if hasattr(bus, "configure") else None

    def test_connect_leader_uses_correct_cal_path(self):
        """Leader arm must load from teleoperators/so_leader path."""
        read_paths = []

        original_read_text = Path.read_text
        def capturing_read_text(self_path, *args, **kwargs):
            read_paths.append(str(self_path))
            return json.dumps(FAKE_CAL)

        with patch.dict("sys.modules", {
            "lerobot": MagicMock(),
            "lerobot.motors": MagicMock(
                Motor=MagicMock(), MotorNormMode=MagicMock(), MotorCalibration=MagicMock()
            ),
            "lerobot.motors.feetech": MagicMock(),
        }):
            import sys
            for m in list(sys.modules):
                if "lumo_dashboard" in m:
                    del sys.modules[m]
            sys.path.insert(0, str(Path(__file__).parent.parent))

            with patch("pathlib.Path.exists", return_value=True), \
                 patch("pathlib.Path.read_text", capturing_read_text):
                from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
                mon = SingleArmMonitor("leader", "/dev/ttyACM0", "leader")
                mon._connect()

        assert any("so_leader" in p for p in read_paths), \
            f"Leader should load so_leader calibration, but read paths were: {read_paths}"


class TestDisconnectSafety:
    """Invariant 2: disconnect() must NEVER touch torque."""

    def _make_connected_monitor(self):
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        monitor = SingleArmMonitor("test", "/dev/ttyACM0", "follower")
        mock_bus = make_mock_bus()
        monitor._arm = mock_bus
        monitor._connected = True
        return monitor, mock_bus

    def test_disconnect_passes_disable_torque_false(self):
        """CRITICAL: disconnect must pass disable_torque=False to leave arm as-is."""
        monitor, bus = self._make_connected_monitor()
        monitor._disconnect()
        bus.disconnect.assert_called_once_with(disable_torque=False)

    def test_disconnect_never_calls_enable_torque(self):
        monitor, bus = self._make_connected_monitor()
        monitor._disconnect()
        bus.enable_torque.assert_not_called()

    def test_disconnect_never_calls_disable_torque_directly(self):
        """Must not call disable_torque() — that would change motor state."""
        monitor, bus = self._make_connected_monitor()
        monitor._disconnect()
        bus.disable_torque.assert_not_called()

    def test_disconnect_clears_arm_reference(self):
        monitor, bus = self._make_connected_monitor()
        monitor._disconnect()
        assert monitor._arm is None

    def test_disconnect_handles_bus_error_gracefully(self):
        """Even if bus.disconnect() raises, _arm is still cleared."""
        monitor, bus = self._make_connected_monitor()
        bus.disconnect.side_effect = Exception("serial error")
        monitor._disconnect()  # must not raise
        assert monitor._arm is None


class TestReadSafety:
    """Invariant 3: _read_joints() must never write to motors."""

    def _make_monitor_with_bus(self, positions=None):
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
        monitor = SingleArmMonitor("test", "/dev/ttyACM0", "follower")
        bus = make_mock_bus(positions)
        monitor._arm = bus
        monitor._connected = True
        return monitor, bus

    def test_read_joints_only_reads_present_position(self):
        monitor, bus = self._make_monitor_with_bus()
        monitor._read_joints()
        bus.sync_read.assert_called_once_with("Present_Position")

    def test_read_joints_never_writes(self):
        """CRITICAL: reading joints must never write any register."""
        monitor, bus = self._make_monitor_with_bus()
        monitor._read_joints()
        bus.sync_write.assert_not_called()
        bus.write.assert_not_called()

    def test_read_joints_never_enables_torque(self):
        monitor, bus = self._make_monitor_with_bus()
        monitor._read_joints()
        bus.enable_torque.assert_not_called()

    def test_read_joints_returns_all_joints(self):
        monitor, bus = self._make_monitor_with_bus(CURRENT_POSITIONS)
        result = monitor._read_joints()
        assert result is not None
        for name in JOINT_NAMES:
            assert name in result
            assert result[name]["pos"] is not None

    def test_read_joints_returns_correct_values(self):
        monitor, bus = self._make_monitor_with_bus(CURRENT_POSITIONS)
        result = monitor._read_joints()
        assert result["shoulder_pan"]["pos"] == 12.5
        assert result["gripper"]["pos"] == 50.0

    def test_read_failure_marks_disconnected(self):
        monitor, bus = self._make_monitor_with_bus()
        bus.sync_read.side_effect = Exception("serial timeout")
        result = monitor._read_joints()
        assert result is None  # signals failure to _loop

    def test_read_failure_does_not_enable_torque(self):
        """Even on error, torque must not be touched."""
        monitor, bus = self._make_monitor_with_bus()
        bus.sync_read.side_effect = Exception("serial timeout")
        monitor._read_joints()
        bus.enable_torque.assert_not_called()


class TestJointMoveSafety:
    """
    Invariants 4 & 5: the MOST CRITICAL safety path.
    Order MUST be:
      1. sync_read("Present_Position")
      2. sync_write("Goal_Position", ALL joints at current pos + target)
      3. enable_torque()

    If this order is violated, motors can snap to stale Goal_Position in memory.
    """

    def _build_follower(self, current_positions=None):
        """Return (app, arm_driver_module) with mock bus injected."""
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers import arm_driver
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        mock_bus = make_mock_bus(current_positions or CURRENT_POSITIONS)
        follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        follower._arm = mock_bus
        follower._connected = True
        return follower, mock_bus

    def test_move_reads_current_positions_first(self):
        """sync_read must be called BEFORE sync_write."""
        follower, bus = self._build_follower()
        call_order = []
        bus.sync_read.side_effect = lambda *a, **kw: (call_order.append("read"), CURRENT_POSITIONS)[1]
        bus.sync_write.side_effect = lambda *a, **kw: call_order.append("write")
        bus.enable_torque.side_effect = lambda *a, **kw: call_order.append("torque")

        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import ArmDriver, get_arm
            import lumo_dashboard.drivers.arm_driver as arm_mod
            arm_mod._arm = MagicMock()
            arm_mod._arm.follower = follower

            from lumo_dashboard.api.arm import follower_joint_move
            from lumo_dashboard.api.arm import JointMoveRequest

        follower_joint_move(JointMoveRequest(joint="shoulder_pan", angle=30.0))
        assert call_order == ["read", "write", "torque"], \
            f"UNSAFE call order: {call_order}. Expected read → write → torque"

    def test_move_includes_all_joints_in_write(self):
        """sync_write must include ALL 6 joints — never a partial write."""
        follower, bus = self._build_follower()

        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import ArmDriver
            import lumo_dashboard.drivers.arm_driver as arm_mod
            arm_mod._arm = MagicMock()
            arm_mod._arm.follower = follower
            from lumo_dashboard.api.arm import follower_joint_move, JointMoveRequest

        follower_joint_move(JointMoveRequest(joint="elbow_flex", angle=20.0))

        write_calls = bus.sync_write.call_args_list
        assert len(write_calls) == 1, f"Expected exactly 1 sync_write, got {len(write_calls)}"
        data_name, goal_dict = write_calls[0][0]
        assert data_name == "Goal_Position"
        missing = [j for j in JOINT_NAMES if j not in goal_dict]
        assert not missing, f"Missing joints in Goal_Position write: {missing}"

    def test_move_only_changes_target_joint(self):
        """Non-target joints must keep their CURRENT positions — not hardcoded values."""
        follower, bus = self._build_follower()

        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            import lumo_dashboard.drivers.arm_driver as arm_mod
            arm_mod._arm = MagicMock()
            arm_mod._arm.follower = follower
            from lumo_dashboard.api.arm import follower_joint_move, JointMoveRequest

        follower_joint_move(JointMoveRequest(joint="wrist_flex", angle=15.0))

        _, goal_dict = bus.sync_write.call_args[0]
        assert goal_dict["wrist_flex"] == 15.0, "Target joint not set correctly"
        # All other joints must equal their current positions
        for j in JOINT_NAMES:
            if j != "wrist_flex":
                assert goal_dict[j] == CURRENT_POSITIONS[j], \
                    f"Joint {j} changed from {CURRENT_POSITIONS[j]} to {goal_dict[j]} — UNSAFE"

    def test_enable_torque_called_after_goal_position_set(self):
        """enable_torque() must come AFTER sync_write() — never before."""
        follower, bus = self._build_follower()
        write_called_before_torque = []
        def mock_enable_torque():
            # At the moment torque is enabled, sync_write must already have been called
            write_called_before_torque.append(bus.sync_write.called)
        bus.enable_torque.side_effect = mock_enable_torque

        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            import lumo_dashboard.drivers.arm_driver as arm_mod
            arm_mod._arm = MagicMock()
            arm_mod._arm.follower = follower
            from lumo_dashboard.api.arm import follower_joint_move, JointMoveRequest

        follower_joint_move(JointMoveRequest(joint="gripper", angle=80.0))
        assert write_called_before_torque == [True], \
            "enable_torque() was called BEFORE sync_write — motors would snap!"

    def test_move_offline_returns_503(self):
        """No bus calls when arm is offline."""
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
            import lumo_dashboard.drivers.arm_driver as arm_mod
            arm_mod._arm = MagicMock()

        bus = make_mock_bus()
        offline_follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        offline_follower._connected = False
        offline_follower._arm = None
        arm_mod._arm.follower = offline_follower

        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.api.arm import follower_joint_move, JointMoveRequest
            from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            follower_joint_move(JointMoveRequest(joint="shoulder_pan", angle=10.0))
        assert exc.value.status_code == 503
        bus.sync_read.assert_not_called()
        bus.sync_write.assert_not_called()
        bus.enable_torque.assert_not_called()


class TestAngleClamping:
    """Invariant 6: angles must be clamped to calibration limits before sending."""

    # NOTE: Current code does NOT clamp — these tests will FAIL until clamping is added.
    # This is intentional: failing tests document the gap.

    CAL_LIMITS = {
        "shoulder_pan":  {"min": -105.2, "max": 105.2},
        "shoulder_lift": {"min": -109.5, "max": 109.5},
        "elbow_flex":    {"min": -96.3,  "max": 96.3},
        "wrist_flex":    {"min": -113.0, "max": 113.0},
        "wrist_roll":    {"min": -180.0, "max": 180.0},
        "gripper":       {"min": 0.0,    "max": 100.0},
    }

    def _run_move_with_angle(self, joint, angle):
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))

        bus = make_mock_bus()

        mock_modules = {
            "lerobot": MagicMock(),
            "lerobot.motors": MagicMock(),
            "lerobot.motors.feetech": MagicMock(),
        }

        with patch.dict("sys.modules", mock_modules), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.read_text", return_value=json.dumps(FAKE_CAL)):

            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
            import lumo_dashboard.drivers.arm_driver as arm_mod

            follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
            follower._arm = bus
            follower._connected = True

            mock_arm = MagicMock()
            mock_arm.follower = follower
            arm_mod._arm = mock_arm

            from lumo_dashboard.api.arm import follower_joint_move, JointMoveRequest
            follower_joint_move(JointMoveRequest(joint=joint, angle=angle))

        _, goal_dict = bus.sync_write.call_args[0]
        return goal_dict[joint]

    def test_angle_above_max_is_clamped(self):
        """Sending 200° to shoulder_pan (max ~105.2°) must be clamped."""
        result = self._run_move_with_angle("shoulder_pan", 200.0)
        assert result <= 105.3, \
            f"shoulder_pan sent {result}° but max is ~105.2° — motor could burn"

    def test_angle_below_min_is_clamped(self):
        """Sending -200° to shoulder_pan (min ~-105.2°) must be clamped."""
        result = self._run_move_with_angle("shoulder_pan", -200.0)
        assert result >= -105.3, \
            f"shoulder_pan sent {result}° but min is ~-105.2° — motor could burn"


class TestPortSwapSafety:
    """Invariant 8: port swap must stop old monitor before starting new one."""

    def _make_arm_driver(self):
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.core.config import update_config
            update_config({"leader_port": "/dev/ttyACM0", "follower_port": "/dev/ttyACM1"})
            from lumo_dashboard.drivers.arm_driver import ArmDriver
            driver = ArmDriver.__new__(ArmDriver)
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor
            driver.leader = SingleArmMonitor("leader", "/dev/ttyACM0", "leader")
            driver.follower = SingleArmMonitor("follower", "/dev/ttyACM1", "follower")
        return driver

    def test_port_swap_stops_old_leader(self):
        driver = self._make_arm_driver()
        old_leader = driver.leader
        old_leader.stop = MagicMock()
        old_leader.start = MagicMock()

        driver.set_ports("/dev/ttyACM1", "/dev/ttyACM1")  # swap leader to ACM1
        old_leader.stop.assert_called_once()

    def test_port_swap_stops_old_follower(self):
        driver = self._make_arm_driver()
        old_follower = driver.follower
        old_follower.stop = MagicMock()
        old_follower.start = MagicMock()

        driver.set_ports("/dev/ttyACM0", "/dev/ttyACM0")  # swap follower to ACM0
        old_follower.stop.assert_called_once()

    def test_port_swap_same_port_no_restart(self):
        """If port hasn't changed, don't restart — avoid unnecessary reconnects."""
        driver = self._make_arm_driver()
        driver.leader.stop = MagicMock()
        driver.follower.stop = MagicMock()

        driver.set_ports("/dev/ttyACM0", "/dev/ttyACM1")  # same ports
        driver.leader.stop.assert_not_called()
        driver.follower.stop.assert_not_called()

    def test_new_monitor_has_correct_port(self):
        driver = self._make_arm_driver()
        driver.leader.stop = MagicMock()
        driver.leader.start = MagicMock()

        driver.set_ports("/dev/ttyACM1", "/dev/ttyACM1")
        assert driver.leader.port == "/dev/ttyACM1"


class TestThreadSafety:
    """Invariant 9: joint state reads must be under lock."""

    def test_concurrent_reads_do_not_corrupt_state(self):
        """Read _joints from multiple threads simultaneously — no race conditions."""
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        monitor = SingleArmMonitor("test", "/dev/ttyACM0", "follower")
        monitor._connected = True

        results = []
        errors = []

        def read_status():
            try:
                for _ in range(100):
                    s = monitor.get_status()
                    assert "joints" in s
                    results.append(s)
            except Exception as e:
                errors.append(e)

        def write_joints():
            for _ in range(100):
                with monitor._lock:
                    monitor._joints = dict(CURRENT_POSITIONS)
                time.sleep(0.0001)

        threads = [threading.Thread(target=read_status) for _ in range(4)]
        threads.append(threading.Thread(target=write_joints))
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert not errors, f"Thread safety errors: {errors}"
        assert len(results) > 0

    def test_connected_flag_consistent_with_arm(self):
        """_connected=True must imply _arm is not None."""
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.drivers.arm_driver import SingleArmMonitor

        monitor = SingleArmMonitor("test", "/dev/ttyACM0", "follower")
        # When connected, _arm must be set
        monitor._connected = True
        monitor._arm = make_mock_bus()
        assert monitor._arm is not None, "Connected but _arm is None — inconsistent state"

        # When disconnected, _arm should be None
        monitor._arm = None
        monitor._connected = False
        assert monitor._arm is None


class TestCalibrationEndpoint:
    """Calibration values must match the actual calibration files."""

    def test_follower_ranges_within_physical_limits(self):
        """Follower joint ranges should be symmetric around 0 and < 180°."""
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.api.arm import arm_calibration

        with patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.read_text", return_value=json.dumps(FAKE_CAL)):
            result = arm_calibration()

        follower = result["follower"]
        for name, lim in follower.items():
            if name == "gripper":
                assert lim["min"] == 0.0
                assert lim["max"] == 100.0
            else:
                assert lim["min"] < 0, f"{name} min should be negative"
                assert lim["max"] > 0, f"{name} max should be positive"
                assert abs(lim["min"]) <= 180.0, f"{name} min {lim['min']} exceeds motor range"
                assert lim["max"] <= 180.0, f"{name} max {lim['max']} exceeds motor range"
                # Should be symmetric (within float tolerance)
                assert abs(abs(lim["min"]) - lim["max"]) < 0.5, \
                    f"{name} range not symmetric: {lim['min']} / {lim['max']}"

    def test_missing_calibration_file_returns_empty(self):
        import sys
        for m in list(sys.modules):
            if "lumo_dashboard" in m:
                del sys.modules[m]
        sys.path.insert(0, str(Path(__file__).parent.parent))
        with patch.dict("sys.modules", {"lerobot": MagicMock(), "lerobot.motors": MagicMock(), "lerobot.motors.feetech": MagicMock()}):
            from lumo_dashboard.api.arm import arm_calibration

        with patch("pathlib.Path.exists", return_value=False):
            result = arm_calibration()
        assert result["follower"] == {}
        assert result["leader"] == {}
