"use client";

import { useEffect, useState, useRef } from "react";

const JOINTS = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper",
];

const JOINT_LABELS = {
  shoulder_pan: "Shoulder Pan",
  shoulder_lift: "Shoulder Lift",
  elbow_flex: "Elbow Flex",
  wrist_flex: "Wrist Flex",
  wrist_roll: "Wrist Roll",
  gripper: "Gripper",
};

function StatusDot({ connected, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: connected ? "var(--success)" : "#555",
          display: "inline-block",
          boxShadow: connected ? "0 0 6px var(--success)" : "none",
        }}
      />
      <span style={{ color: connected ? "var(--text)" : "var(--text-muted)", fontSize: 13 }}>
        {label}: {connected ? "Online" : "Offline"}
      </span>
    </span>
  );
}

function JointRow({ name, data }) {
  const pos = data?.pos;
  const offline = pos === null || pos === undefined;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        marginBottom: 6,
      }}
    >
      <span style={{ color: offline ? "var(--text-muted)" : "var(--text)", fontSize: 14 }}>
        {JOINT_LABELS[name] || name}
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 16,
            color: offline ? "var(--text-muted)" : "var(--primary)",
            minWidth: 60,
            textAlign: "right",
          }}
        >
          {offline ? "--°" : `${pos.toFixed(1)}°`}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 4,
            background: offline ? "#1a1a1a" : "#0d2a1a",
            color: offline ? "#555" : "var(--success)",
            border: `1px solid ${offline ? "#333" : "#1a4a2a"}`,
          }}
        >
          {offline ? "OFFLINE" : "ACTIVE"}
        </span>
      </span>
    </div>
  );
}

const API_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.host}`
  : "";

export default function Dashboard() {
  const [telemetry, setTelemetry] = useState(null);
  const [wsState, setWsState] = useState("connecting");
  const [camMode, setCamMode] = useState("rgb");
  const [modeLoading, setModeLoading] = useState(false);
  const [restCamConnected, setRestCamConnected] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [camRunning, setCamRunning] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/telemetry`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setWsState("connected");
      ws.onclose = () => {
        setWsState("disconnected");
        setTimeout(connect, 3000);
      };
      ws.onerror = () => setWsState("error");
      ws.onmessage = (e) => {
        try {
          setTelemetry(JSON.parse(e.data));
        } catch {}
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Poll camera mode + status every 5s (REST fallback — independent of WebSocket)
  useEffect(() => {
    function pollCamera() {
      fetch("/api/camera/mode")
        .then((r) => r.json())
        .then((d) => setCamMode(d.mode))
        .catch(() => {});
      fetch("/api/camera/status")
        .then((r) => r.json())
        .then((d) => {
          setRestCamConnected(d.connected === true);
          setCamRunning(d.connected === true);
        })
        .catch(() => setRestCamConnected(false));
    }
    pollCamera();
    const id = setInterval(pollCamera, 5000);
    return () => clearInterval(id);
  }, []);

  async function toggleCamera() {
    const endpoint = camRunning ? "/api/camera/stop" : "/api/camera/start";
    try {
      const r = await fetch(endpoint, { method: "POST" });
      if (r.ok) {
        const next = !camRunning;
        setCamRunning(next);
        setRestCamConnected(next);
        if (next) setTimeout(() => setStreamKey((k) => k + 1), 500);
      }
    } catch {}
  }

  async function toggleCamMode() {
    const next = camMode === "rgb" ? "ir" : "rgb";
    setModeLoading(true);
    try {
      const r = await fetch("/api/camera/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (r.ok) {
        setCamMode(next);
        setStreamKey((k) => k + 1); // force stream reload with new mode
      }
    } catch {}
    setModeLoading(false);
  }

  const sys = telemetry?.system;
  const arm = telemetry?.arm;
  const cam = telemetry?.camera;
  const armConnected = arm?.connected ?? false;
  const camConnected = (cam?.connected ?? false) || restCamConnected;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Status Bar */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
            🦾 Lumo Dashboard
          </span>
          <StatusDot connected={armConnected} label="ARM" />
          <StatusDot connected={camConnected} label="CAM" />
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <span>CPU: <b style={{ color: "var(--text)" }}>{sys?.cpu_pct?.toFixed(0) ?? "--"}%</b></span>
          <span>
            CPU Temp: <b style={{ color: "var(--text)" }}>{sys?.cpu_temp ?? "--"}°C</b>
          </span>
          <span>MEM: <b style={{ color: "var(--text)" }}>{sys?.mem_pct?.toFixed(0) ?? "--"}%</b></span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: wsState === "connected" ? "#0d2a1a" : "#1a0d0d",
              color: wsState === "connected" ? "var(--success)" : "#ef4444",
              border: `1px solid ${wsState === "connected" ? "#1a4a2a" : "#4a1a1a"}`,
            }}
          >
            WS: {wsState}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr auto",
          gap: 0,
          padding: 16,
          gap: 16,
        }}
      >
        {/* Joint Panel */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 16,
            }}
          >
            Robot Arm — Joint Telemetry
          </h2>
          {JOINTS.map((name) => (
            <JointRow key={name} name={name} data={arm?.joints?.[name]} />
          ))}
          {!armConnected && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 8,
                background: "#1a1008",
                border: "1px solid #3a2a08",
                color: "#888",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              ⚠️ Arm not connected — port /dev/ttyACM1
            </div>
          )}
        </div>

        {/* Camera Feed */}
        <div
          style={{
            background: "#000",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Top bar: LIVE status + mode badge + toggle */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: 4,
                background: camConnected ? "#0d2a1a" : "#1a0d0d",
                color: camConnected ? "var(--success)" : "#ef4444",
                border: `1px solid ${camConnected ? "#1a4a2a" : "#4a1a1a"}`,
              }}
            >
              {camConnected ? "● LIVE" : "● OFFLINE"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* On/Off toggle */}
              <button
                onClick={toggleCamera}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 4,
                  background: camRunning ? "#1a0505" : "#051a05",
                  color: camRunning ? "#ef4444" : "var(--success)",
                  border: `1px solid ${camRunning ? "#4a1a1a" : "#1a4a1a"}`,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {camRunning ? "⏹ OFF" : "▶ ON"}
              </button>
              {/* IR/RGB mode */}
              {camRunning && (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: camMode === "ir" ? "#1a0d2a" : "#0d1a2a",
                      color: camMode === "ir" ? "#c084fc" : "#60a5fa",
                      border: `1px solid ${camMode === "ir" ? "#4a1a6a" : "#1a3a6a"}`,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                    }}
                  >
                    {camMode === "ir" ? "🌙 IR" : "☀️ RGB"}
                  </span>
                  <button
                    onClick={toggleCamMode}
                    disabled={modeLoading}
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 4,
                      background: "#111",
                      color: modeLoading ? "#555" : "var(--text)",
                      border: "1px solid var(--border)",
                      cursor: modeLoading ? "wait" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {modeLoading ? "..." : camMode === "ir" ? "→ RGB" : "→ IR"}
                  </button>
                </>
              )}
            </div>
          </div>
          <img
            key={streamKey}
            src={`/api/camera/stream?t=${streamKey}`}
            alt="Camera feed"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
            onError={() => {
              // Auto-retry after 2s on stream error
              setTimeout(() => setStreamKey((k) => k + 1), 2000);
            }}
          />
        </div>

        {/* Task Panel — full width */}
        <div
          style={{
            gridColumn: "1 / -1",
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, minWidth: 80 }}
          >
            TASKS
          </span>
          <button
            onClick={() => fetch("/api/arm/home", { method: "POST" })}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#111",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            🏠 Home
          </button>
          <button
            onClick={() => fetch("/api/arm/stop", { method: "POST" })}
            style={{
              padding: "8px 28px",
              borderRadius: 8,
              border: "2px solid var(--danger)",
              background: "#1a0505",
              color: "var(--danger)",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            🛑 EMERGENCY STOP
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {armConnected ? "Arm ready" : "Arm offline — commands queued"}
          </span>
        </div>
      </div>
    </div>
  );
}
