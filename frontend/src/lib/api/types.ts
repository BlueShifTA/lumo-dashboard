export type DashboardTabId = "overview" | "arms" | "operations" | "config";

export type JointName =
  | "shoulder_pan"
  | "shoulder_lift"
  | "elbow_flex"
  | "wrist_flex"
  | "wrist_roll"
  | "gripper";

export type JointTelemetry = {
  pos?: number | null;
};

export type ArmTelemetry = {
  connected?: boolean;
  joints?: Partial<Record<JointName, JointTelemetry>>;
};

export type SystemTelemetry = {
  cpu_pct?: number;
  cpu_temp?: number;
  mem_pct?: number;
};

export type CameraTelemetry = {
  connected?: boolean;
};

export type TelemetryPayload = {
  system?: SystemTelemetry;
  camera?: CameraTelemetry;
  leader?: ArmTelemetry;
  follower?: ArmTelemetry;
};

export type CalibrationLimits = {
  min?: number;
  max?: number;
};

export type CalibrationMap = Partial<Record<JointName, CalibrationLimits>>;

export type CalibrationResponse = {
  leader?: CalibrationMap;
  follower?: CalibrationMap;
};

export type ProcessStatus = {
  running?: boolean;
  last_line?: string;
};

export type ProcessesStatus = {
  teleop?: ProcessStatus;
  record?: ProcessStatus;
};

export type CameraModeResponse = {
  mode?: string;
};

export type CameraStatusResponse = {
  connected?: boolean;
};

export type ConfigResponse = {
  leader_port?: string;
  follower_port?: string;
};

export type RecordStartRequest = {
  task: string;
  num_episodes: number;
  repo_id: string;
};

export type PortsConfigRequest = {
  leader_port: string;
  follower_port: string;
};

export type MoveFollowerJointRequest = {
  joint: JointName;
  angle: string | number;
  speed: number;
  acceleration: number;
};
