import type { DashboardTabId, JointName } from "@/src/lib/api/types";

export const JOINTS: readonly JointName[] = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper",
];

export const JOINT_LABELS: Record<JointName, string> = {
  shoulder_pan: "Shoulder Pan",
  shoulder_lift: "Shoulder Lift",
  elbow_flex: "Elbow Flex",
  wrist_flex: "Wrist Flex",
  wrist_roll: "Wrist Roll",
  gripper: "Gripper",
};

export const NAV_ITEMS: Array<{ id: DashboardTabId; icon: string; label: string }> = [
  { id: "overview", icon: "🏠", label: "Overview" },
  { id: "arms", icon: "🦾", label: "Arms" },
  { id: "operations", icon: "🎮", label: "Operations" },
  { id: "config", icon: "⚙️", label: "Config" },
];

export const PORT_OPTIONS = [
  "/dev/ttyACM0",
  "/dev/ttyACM1",
  "/dev/ttyUSB0",
  "/dev/ttyUSB1",
] as const;
