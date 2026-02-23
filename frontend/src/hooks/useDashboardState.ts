"use client";

import { useEffect, useRef, useState } from "react";

import * as api from "@/src/lib/api/dashboardClient";
import type {
  ArmTelemetry,
  CalibrationMap,
  DashboardTabId,
  JointName,
  ProcessesStatus,
  TelemetryPayload,
} from "@/src/lib/api/types";

type CalibrationState = {
  leader: CalibrationMap;
  follower: CalibrationMap;
};

type DragState = Partial<Record<JointName, number>>;

type WsState = "connecting" | "connected" | "disconnected" | "error";

const DEFAULT_PROCS: ProcessesStatus = {
  teleop: { running: false, last_line: "" },
  record: { running: false, last_line: "" },
};

export type DashboardViewModel = ReturnType<typeof useDashboardState>;

export function useDashboardState() {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  const [wsState, setWsState] = useState<WsState>("connecting");
  const [camMode, setCamMode] = useState<string>("rgb");
  const [modeLoading, setModeLoading] = useState(false);
  const [restCamConnected, setRestCamConnected] = useState(false);
  const [camRunning, setCamRunning] = useState(true);
  const [procs, setProcs] = useState<ProcessesStatus>(DEFAULT_PROCS);
  const [leaderPort, setLeaderPort] = useState("/dev/ttyACM0");
  const [followerPort, setFollowerPort] = useState("/dev/ttyACM1");
  const [recordTask, setRecordTask] = useState("Pick and place");
  const [recordEpisodes, setRecordEpisodes] = useState(10);
  const [recordRepoId, setRecordRepoId] = useState("beluga-orin/demo");
  const [calibration, setCalibration] = useState<CalibrationState>({ leader: {}, follower: {} });
  const [dragState, setDragState] = useState<DragState>({});
  const [motorSpeed, setMotorSpeed] = useState(30);
  const [motorAccel, setMotorAccel] = useState(10);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTabId>("overview");

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedActiveRef = useRef(true);
  const lastSendRef = useRef<Partial<Record<JointName, number>>>({});

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let closed = false;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/telemetry`;

    function connect() {
      if (closed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setWsState("connecting");

      ws.onopen = () => setWsState("connected");
      ws.onerror = () => setWsState("error");
      ws.onmessage = (event) => {
        try {
          setTelemetry(JSON.parse(event.data) as TelemetryPayload);
        } catch {
          // no-op
        }
      };
      ws.onclose = () => {
        setWsState("disconnected");
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    feedActiveRef.current = true;
    let timeoutId: number | null = null;
    let cancelled = false;

    async function drawBlobToCanvas(blob: Blob, canvas: HTMLCanvasElement) {
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error("Canvas context unavailable"));
            return;
          }
          canvas.width = img.naturalWidth || 640;
          canvas.height = img.naturalHeight || 480;
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Image decode failed"));
        };
        img.src = url;
      });
    }

    async function fetchFrame() {
      if (cancelled || !feedActiveRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        timeoutId = window.setTimeout(fetchFrame, 100);
        return;
      }

      try {
        const blob = await api.fetchCameraSnapshotBlob();
        await drawBlobToCanvas(blob, canvas);
      } catch {
        // camera endpoint may be offline
      }

      if (!cancelled && feedActiveRef.current) {
        timeoutId = window.setTimeout(fetchFrame, 67);
      }
    }

    void fetchFrame();

    return () => {
      cancelled = true;
      feedActiveRef.current = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const mode = await api.fetchCameraMode();
        if (mounted && mode.mode) setCamMode(mode.mode);
      } catch {
        // no-op
      }
      try {
        const status = await api.fetchCameraStatus();
        if (!mounted) return;
        const connected = status.connected === true;
        setRestCamConnected(connected);
        setCamRunning(connected);
      } catch {
        if (mounted) setRestCamConnected(false);
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    api
      .fetchArmCalibration()
      .then((data) => setCalibration({ leader: data.leader ?? {}, follower: data.follower ?? {} }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .fetchConfig()
      .then((data) => {
        if (data.leader_port) setLeaderPort(data.leader_port);
        if (data.follower_port) setFollowerPort(data.follower_port);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function poll() {
      try {
        setProcs(await api.fetchProcessesStatus());
      } catch {
        // no-op
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => window.clearInterval(id);
  }, []);

  const sys = telemetry?.system;
  const cam = telemetry?.camera;
  const leader = telemetry?.leader as ArmTelemetry | undefined;
  const follower = telemetry?.follower as ArmTelemetry | undefined;
  const leaderConnected = leader?.connected ?? false;
  const followerConnected = follower?.connected ?? false;
  const anyArmConnected = leaderConnected || followerConnected;
  const camConnected = (cam?.connected ?? false) || restCamConnected;
  const sidebarWidth = sidebarOpen ? 200 : 56;

  async function triggerEmergencyStop() {
    await api.armStop().catch(() => {});
  }

  async function triggerHome() {
    await api.armHome().catch(() => {});
  }

  async function toggleCamera() {
    try {
      const response = camRunning ? await api.stopCamera() : await api.startCamera();
      if (response.ok) {
        const next = !camRunning;
        setCamRunning(next);
        setRestCamConnected(next);
        feedActiveRef.current = next;
      }
    } catch {
      // no-op
    }
  }

  async function toggleCamMode() {
    const next = camMode === "rgb" ? "ir" : "rgb";
    setModeLoading(true);
    try {
      const response = await api.setCameraMode(next);
      if (response.ok) setCamMode(next);
    } catch {
      // no-op
    } finally {
      setModeLoading(false);
    }
  }

  async function applyPorts() {
    if (leaderPort === followerPort) return;
    await api.applyPortsConfig({ leader_port: leaderPort, follower_port: followerPort }).catch(() => {});
  }

  async function toggleTeleop() {
    const request = procs.teleop?.running ? api.stopTeleop : api.startTeleop;
    await request().catch(() => {});
  }

  async function toggleRecord() {
    if (procs.record?.running) {
      await api.stopRecord().catch(() => {});
      return;
    }

    await api
      .startRecord({
        task: recordTask,
        num_episodes: recordEpisodes,
        repo_id: recordRepoId,
      })
      .catch(() => {});
  }

  async function moveJoint(joint: JointName, angle: string | number, isFinal = false) {
    if (!followerConnected) return;
    await api
      .moveFollowerJoint({
        joint,
        angle,
        speed: motorSpeed,
        acceleration: motorAccel,
      })
      .catch(() => {});

    if (isFinal) {
      setDragState((prev) => {
        const next = { ...prev };
        delete next[joint];
        return next;
      });
    }
  }

  function onJointDrag(joint: JointName, value: string) {
    setDragState((prev) => ({ ...prev, [joint]: Number.parseFloat(value) }));
    const now = Date.now();
    const last = lastSendRef.current[joint] ?? 0;
    if (now - last >= 120) {
      lastSendRef.current[joint] = now;
      void moveJoint(joint, value, false);
    }
  }

  return {
    state: {
      telemetry,
      wsState,
      camMode,
      modeLoading,
      restCamConnected,
      camRunning,
      procs,
      leaderPort,
      followerPort,
      recordTask,
      recordEpisodes,
      recordRepoId,
      calibration,
      dragState,
      motorSpeed,
      motorAccel,
      sidebarOpen,
      activeTab,
      setLeaderPort,
      setFollowerPort,
      setRecordTask,
      setRecordEpisodes,
      setRecordRepoId,
      setMotorSpeed,
      setMotorAccel,
      setSidebarOpen,
      setActiveTab,
    },
    refs: { canvasRef },
    derived: {
      sys,
      cam,
      leader,
      follower,
      leaderConnected,
      followerConnected,
      anyArmConnected,
      camConnected,
      sidebarWidth,
    },
    actions: {
      toggleCamera,
      toggleCamMode,
      applyPorts,
      toggleTeleop,
      toggleRecord,
      moveJoint,
      onJointDrag,
      triggerEmergencyStop,
      triggerHome,
    },
  };
}
