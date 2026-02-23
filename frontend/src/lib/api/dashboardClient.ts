import * as generatedApi from "@/src/generated/endpoints";
import type {
  CalibrationResponse,
  CameraModeResponse,
  CameraStatusResponse,
  ConfigResponse,
  MoveFollowerJointRequest,
  PortsConfigRequest,
  ProcessesStatus,
  RecordStartRequest,
} from "@/src/lib/api/types";

type AxiosLikeResponse<T = unknown> = {
  data: T;
  status: number;
};

type GeneratedFn = (...args: unknown[]) => Promise<AxiosLikeResponse>;

const generated = generatedApi as Record<string, unknown>;

function getGeneratedFn(...candidates: string[]): GeneratedFn | null {
  for (const name of candidates) {
    const fn = generated[name];
    if (typeof fn === "function") return fn as GeneratedFn;
  }
  return null;
}

function toResponse(result: AxiosLikeResponse): Response {
  return new Response(JSON.stringify(result.data ?? {}), { status: result.status ?? 200 });
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson<TBody>(url: string, body: TBody): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchCameraSnapshotBlob(): Promise<Blob> {
  const response = await fetch(`/api/camera/snapshot?t=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.blob();
}

export async function fetchCameraMode(): Promise<CameraModeResponse> {
  const fn = getGeneratedFn("getModeApiCameraModeGet");
  if (fn) return (await fn()).data as CameraModeResponse;
  return parseJson<CameraModeResponse>(await fetch("/api/camera/mode"));
}

export async function fetchCameraStatus(): Promise<CameraStatusResponse> {
  const fn = getGeneratedFn("cameraStatusApiCameraStatusGet");
  if (fn) return (await fn()).data as CameraStatusResponse;
  return parseJson<CameraStatusResponse>(await fetch("/api/camera/status"));
}

export async function fetchArmCalibration(): Promise<CalibrationResponse> {
  const fn = getGeneratedFn("armCalibrationApiArmCalibrationGet");
  if (fn) return (await fn()).data as CalibrationResponse;
  return parseJson<CalibrationResponse>(await fetch("/api/arm/calibration"));
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const fn = getGeneratedFn("configApiConfigGet");
  if (fn) return (await fn()).data as ConfigResponse;
  return parseJson<ConfigResponse>(await fetch("/api/config"));
}

export async function fetchProcessesStatus(): Promise<ProcessesStatus> {
  const fn = getGeneratedFn("allStatusApiProcessesStatusGet", "statusApiProcessesStatusGet");
  if (fn) return (await fn()).data as ProcessesStatus;
  return parseJson<ProcessesStatus>(await fetch("/api/processes/status"));
}

export function startCamera(): Promise<Response> {
  const fn = getGeneratedFn("cameraStartApiCameraStartPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/camera/start", { method: "POST" });
}

export function stopCamera(): Promise<Response> {
  const fn = getGeneratedFn("cameraStopApiCameraStopPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/camera/stop", { method: "POST" });
}

export function setCameraMode(mode: string): Promise<Response> {
  const fn = getGeneratedFn("setModeApiCameraModePost");
  if (fn) return fn({ mode }).then(toResponse);
  return postJson("/api/camera/mode", { mode });
}

export function applyPortsConfig(payload: PortsConfigRequest): Promise<Response> {
  const fn = getGeneratedFn("setPortsApiConfigPortsPost");
  if (fn) return fn(payload).then(toResponse);
  return postJson("/api/config/ports", payload);
}

export function startTeleop(): Promise<Response> {
  const fn = getGeneratedFn("teleopStartApiProcessesTeleopStartPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/processes/teleop/start", { method: "POST" });
}

export function stopTeleop(): Promise<Response> {
  const fn = getGeneratedFn("teleopStopApiProcessesTeleopStopPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/processes/teleop/stop", { method: "POST" });
}

export function startRecord(payload: RecordStartRequest): Promise<Response> {
  const fn = getGeneratedFn("recordStartApiProcessesRecordStartPost");
  if (fn) return fn(payload).then(toResponse);
  return postJson("/api/processes/record/start", payload);
}

export function stopRecord(): Promise<Response> {
  const fn = getGeneratedFn("recordStopApiProcessesRecordStopPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/processes/record/stop", { method: "POST" });
}

export function moveFollowerJoint(payload: MoveFollowerJointRequest): Promise<Response> {
  const fn = getGeneratedFn("followerJointMoveApiArmFollowerMovePost", "followerMoveApiArmFollowerMovePost");
  if (fn) {
    return fn({
      ...payload,
      angle: Number.parseFloat(String(payload.angle)),
    }).then(toResponse);
  }
  return postJson("/api/arm/follower/move", {
    ...payload,
    angle: Number.parseFloat(String(payload.angle)),
  });
}

export function armStop(): Promise<Response> {
  const fn = getGeneratedFn("armStopApiArmStopPost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/arm/stop", { method: "POST" });
}

export function armHome(): Promise<Response> {
  const fn = getGeneratedFn("armHomeApiArmHomePost");
  if (fn) return fn().then(toResponse);
  return fetch("/api/arm/home", { method: "POST" });
}
