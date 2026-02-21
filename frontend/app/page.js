"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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

function JointRow({ name, data, limits }) {
  const pos = data?.pos;
  const offline = pos === null || pos === undefined;
  const min = limits?.min ?? (name === "gripper" ? 0 : -180);
  const max = limits?.max ?? (name === "gripper" ? 100 : 180);
  const unit = name === "gripper" ? "%" : "°";
  const pct = offline ? 50 : Math.round(((pos - min) / (max - min)) * 100);

  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        marginBottom: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: offline ? "var(--text-muted)" : "var(--text)", fontSize: 13 }}>
          {JOINT_LABELS[name] || name}
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 14, color: offline ? "var(--text-muted)" : "var(--primary)", minWidth: 56, textAlign: "right" }}>
            {offline ? `--${unit}` : `${pos.toFixed(1)}${unit}`}
          </span>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: offline ? "#1a1a1a" : "#0d2a1a", color: offline ? "#555" : "var(--success)", border: `1px solid ${offline ? "#333" : "#1a4a2a"}` }}>
            {offline ? "OFFLINE" : "ACTIVE"}
          </span>
        </span>
      </div>
      {/* Range bar */}
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: "#1a1a1a" }}>
        <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, pct))}%`, top: -3, width: 2, height: 10, borderRadius: 1, background: offline ? "#333" : "var(--primary)", transform: "translateX(-50%)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", width: "100%", top: 6, fontSize: 9, color: "#333" }}>
          <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
      </div>
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
  const [camRunning, setCamRunning] = useState(true);
  const [procs, setProcs] = useState({ teleop: { running: false, last_line: "" }, record: { running: false, last_line: "" } });
  const [leaderPort, setLeaderPort] = useState("/dev/ttyACM0");
  const [followerPort, setFollowerPort] = useState("/dev/ttyACM1");
  const [recordTask, setRecordTask] = useState("Pick and place");
  const [recordEpisodes, setRecordEpisodes] = useState(10);
  const [recordRepoId, setRecordRepoId] = useState("beluga-orin/demo");
  const [calibration, setCalibration] = useState({ leader: {}, follower: {} });
  const [dragState, setDragState] = useState({}); // {jointName: value} while dragging
  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const feedActiveRef = useRef(true);

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

  // Canvas-based camera feed — fetch snapshots, draw to canvas
  useEffect(() => {
    feedActiveRef.current = true;
    let timeoutId = null;

    async function fetchFrame() {
      if (!feedActiveRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) { timeoutId = setTimeout(fetchFrame, 100); return; }

      try {
        const res = await fetch(`/api/camera/snapshot?t=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const ctx = canvas.getContext("2d");
            canvas.width = img.naturalWidth || 640;
            canvas.height = img.naturalHeight || 480;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = reject;
          img.src = url;
        });
      } catch {}

      if (feedActiveRef.current) timeoutId = setTimeout(fetchFrame, 67); // ~15fps
    }

    fetchFrame();
    return () => {
      feedActiveRef.current = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
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
        feedActiveRef.current = next; // pause/resume canvas loop
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
      if (r.ok) setCamMode(next);
    } catch {}
    setModeLoading(false);
  }

  // Load calibration limits on mount (both leader + follower)
  useEffect(() => {
    fetch("/api/arm/calibration")
      .then(r => r.json())
      .then(d => setCalibration({ leader: d.leader || {}, follower: d.follower || {} }))
      .catch(() => {});
  }, []);

  // Load port config on mount
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => {
      if (d.leader_port) setLeaderPort(d.leader_port);
      if (d.follower_port) setFollowerPort(d.follower_port);
    }).catch(() => {});
  }, []);

  async function applyPorts() {
    if (leaderPort === followerPort) return;
    await fetch("/api/config/ports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leader_port: leaderPort, follower_port: followerPort }),
    }).catch(() => {});
  }

  // Poll process status every 2s
  useEffect(() => {
    function poll() {
      fetch("/api/processes/status").then(r => r.json()).then(setProcs).catch(() => {});
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  async function toggleTeleop() {
    const ep = procs.teleop?.running ? "/api/processes/teleop/stop" : "/api/processes/teleop/start";
    await fetch(ep, { method: "POST" }).catch(() => {});
  }

  async function toggleRecord() {
    if (procs.record?.running) {
      await fetch("/api/processes/record/stop", { method: "POST" }).catch(() => {});
    } else {
      await fetch("/api/processes/record/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: recordTask, num_episodes: recordEpisodes, repo_id: recordRepoId }),
      }).catch(() => {});
    }
  }

  async function moveJoint(joint, angle) {
    if (!followerConnected) return;
    await fetch("/api/arm/follower/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joint, angle: parseFloat(angle) }),
    }).catch(() => {});
    // Clear drag state — slider reverts to live position
    setDragState(s => { const n = {...s}; delete n[joint]; return n; });
  }

  const sys = telemetry?.system;
  const cam = telemetry?.camera;
  const leader = telemetry?.leader;
  const follower = telemetry?.follower;
  const leaderConnected = leader?.connected ?? false;
  const followerConnected = follower?.connected ?? false;
  const anyArmConnected = leaderConnected || followerConnected;
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
          <StatusDot connected={leaderConnected} label="LEADER" />
          <StatusDot connected={followerConnected} label="FOLLOWER" />
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
        {/* Dual Arm Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { key: "leader", label: "Leader Arm", port: leaderPort, data: leader, connected: leaderConnected, cal: calibration.leader },
            { key: "follower", label: "Follower Arm", port: followerPort, data: follower, connected: followerConnected, cal: calibration.follower },
          ].map(({ key, label, port, data, connected, cal }) => (
            <div
              key={key}
              style={{
                background: "var(--card-bg)",
                border: `1px solid ${connected ? "var(--border)" : "#2a1a1a"}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
                  🦾 {label}
                </h2>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 4,
                  background: connected ? "#0d2a1a" : "#1a0d0d",
                  color: connected ? "var(--success)" : "#ef4444",
                  border: `1px solid ${connected ? "#1a4a2a" : "#4a1a1a"}`,
                }}>
                  {connected ? `● ${port}` : `○ offline`}
                </span>
              </div>
              {JOINTS.map((name) => (
                <JointRow key={name} name={name} data={data?.joints?.[name]} limits={cal?.[name]} />
              ))}
            </div>
          ))}
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
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              background: "#000",
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
            {anyArmConnected ? "Arms ready" : "Arms offline"}
          </span>
        </div>

        {/* Port Config Row */}
        <div style={{ gridColumn: "1 / -1", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, minWidth: 60 }}>PORTS</span>
          {[
            { label: "🦾 Leader", value: leaderPort, set: setLeaderPort },
            { label: "🤖 Follower", value: followerPort, set: setFollowerPort },
          ].map(({ label, value, set }) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ color: "var(--text-muted)" }}>{label}</span>
              <select value={value} onChange={e => set(e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 12, cursor: "pointer" }}>
                {["/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyUSB0", "/dev/ttyUSB1"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          ))}
          <button
            onClick={applyPorts}
            disabled={leaderPort === followerPort}
            style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid var(--border)", background: leaderPort === followerPort ? "#111" : "#0d2a1a", color: leaderPort === followerPort ? "#555" : "var(--success)", cursor: leaderPort === followerPort ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}
          >
            Apply
          </button>
          {leaderPort === followerPort && <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ ports must differ</span>}
        </div>

        {/* Control Panel — full width */}
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

          {/* Teleop Card */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>🎮 Teleoperation</h3>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: procs.teleop?.running ? "var(--success)" : "#555", display: "inline-block", boxShadow: procs.teleop?.running ? "0 0 6px var(--success)" : "none" }} />
            </div>
            <button
              onClick={toggleTeleop}
              style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${procs.teleop?.running ? "var(--danger)" : "var(--border)"}`, background: procs.teleop?.running ? "#1a0505" : "#0d2a1a", color: procs.teleop?.running ? "var(--danger)" : "var(--success)", cursor: "pointer", fontSize: 14, fontWeight: 700, marginBottom: 8 }}
            >
              {procs.teleop?.running ? "⏹ Stop Teleop" : "▶ Start Teleop"}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {procs.teleop?.last_line || (procs.teleop?.running ? "Running..." : "Idle")}
            </p>
          </div>

          {/* Record Card */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>📼 Record Dataset</h3>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: procs.record?.running ? "#f59e0b" : "#555", display: "inline-block", boxShadow: procs.record?.running ? "0 0 6px #f59e0b" : "none" }} />
            </div>
            {!procs.record?.running && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                <input value={recordTask} onChange={e => setRecordTask(e.target.value)} placeholder="Task description" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 12 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" value={recordEpisodes} onChange={e => setRecordEpisodes(parseInt(e.target.value))} min={1} max={100} style={{ width: 60, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 12 }} />
                  <input value={recordRepoId} onChange={e => setRecordRepoId(e.target.value)} placeholder="user/dataset" style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 12 }} />
                </div>
              </div>
            )}
            <button
              onClick={toggleRecord}
              style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${procs.record?.running ? "var(--danger)" : "#f59e0b"}`, background: procs.record?.running ? "#1a0505" : "#1a1200", color: procs.record?.running ? "var(--danger)" : "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 700, marginBottom: 8 }}
            >
              {procs.record?.running ? "⏹ Stop Recording" : "▶ Start Recording"}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {procs.record?.last_line || (procs.record?.running ? "Recording..." : "Idle")}
            </p>
          </div>

          {/* Joint Control Card */}
          <div style={{ background: "var(--card-bg)", border: `1px solid ${followerConnected ? "var(--border)" : "#2a1a1a"}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>🎛 Joint Control</h3>
              <span style={{ fontSize: 11, color: followerConnected ? "var(--success)" : "#555" }}>{followerConnected ? "● live" : "○ offline"}</span>
            </div>
            {JOINTS.map(name => {
              const cur = follower?.joints?.[name]?.pos;
              const lim = calibration.follower?.[name];
              const min = lim?.min ?? (name === "gripper" ? 0 : -180);
              const max = lim?.max ?? (name === "gripper" ? 100 : 180);
              const unit = name === "gripper" ? "%" : "°";
              // While dragging use drag value; otherwise use live motor position
              const isDragging = name in dragState;
              const val = isDragging ? dragState[name] : (cur ?? min);
              return (
                <div key={name} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
                    <span>{JOINT_LABELS[name]}</span>
                    <span style={{ fontFamily: "monospace", color: followerConnected ? "var(--primary)" : "#555" }}>
                      {isDragging
                        ? <span style={{ color: "#f59e0b" }}>{parseFloat(val).toFixed(1)}{unit}</span>
                        : cur != null ? `${cur.toFixed(1)}${unit}` : "--"
                      }
                    </span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={0.5}
                    value={val}
                    disabled={!followerConnected}
                    onChange={e => setDragState(s => ({ ...s, [name]: parseFloat(e.target.value) }))}
                    onMouseUp={e => moveJoint(name, e.target.value)}
                    onTouchEnd={e => moveJoint(name, e.target.value)}
                    style={{ width: "100%", accentColor: followerConnected ? "var(--primary)" : "#555", opacity: followerConnected ? 1 : 0.4 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", marginTop: 1 }}>
                    <span>{min}{unit}</span><span>{max}{unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
