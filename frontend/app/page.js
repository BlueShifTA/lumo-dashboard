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

const NAV = [
  { id: "overview", icon: "🏠", label: "Overview" },
  { id: "arms", icon: "🦾", label: "Arms" },
  { id: "operations", icon: "🎮", label: "Operations" },
  { id: "config", icon: "⚙️", label: "Config" },
  { id: "health", icon: "❤️", label: "Health" },
];

function StatusDot({ connected, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 10, height: 10, borderRadius: "50%",
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
    <div style={{
      padding: "8px 12px", borderRadius: 8,
      background: "var(--card-bg)", border: "1px solid var(--border)", marginBottom: 6,
    }}>
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
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: "#1a1a1a" }}>
        <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, pct))}%`, top: -3, width: 2, height: 10, borderRadius: 1, background: offline ? "#333" : "var(--primary)", transform: "translateX(-50%)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", position: "absolute", width: "100%", top: 6, fontSize: 9, color: "#333" }}>
          <span>{min}{unit}</span><span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );
}

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
  const [dragState, setDragState] = useState({});
  const [motorSpeed, setMotorSpeed] = useState(30);
  const [motorAccel, setMotorAccel] = useState(10);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // ── Health state ────────────────────────────────────────────────────────────
  const [healthStatus, setHealthStatus] = useState({ connected: false, last_sync: null, today: null });
  const [healthHistory, setHealthHistory] = useState([]);
  const [healthLoginEmail, setHealthLoginEmail] = useState("");
  const [healthLoginPassword, setHealthLoginPassword] = useState("");
  const [healthLoginLoading, setHealthLoginLoading] = useState(false);
  const [healthSyncLoading, setHealthSyncLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId] = useState(() => Math.random().toString(36).slice(2));

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const feedActiveRef = useRef(true);
  const lastSendRef = useRef({});

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/telemetry`;
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setWsState("connected");
      ws.onclose = () => { setWsState("disconnected"); setTimeout(connect, 3000); };
      ws.onerror = () => setWsState("error");
      ws.onmessage = (e) => { try { setTelemetry(JSON.parse(e.data)); } catch {} };
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  // ── Canvas camera feed ─────────────────────────────────────────────────────
  useEffect(() => {
    feedActiveRef.current = true;
    let timeoutId = null;
    async function fetchFrame() {
      if (!feedActiveRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) { timeoutId = setTimeout(fetchFrame, 100); return; }
      try {
        const res = await fetch(`/api/camera/snapshot?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => { const ctx = canvas.getContext("2d"); canvas.width = img.naturalWidth || 640; canvas.height = img.naturalHeight || 480; ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); resolve(); };
          img.onerror = reject;
          img.src = url;
        });
      } catch {}
      if (feedActiveRef.current) timeoutId = setTimeout(fetchFrame, 67); // ~15fps
    }
    fetchFrame();
    return () => { feedActiveRef.current = false; if (timeoutId) clearTimeout(timeoutId); };
  }, []);

  // ── Poll camera status ─────────────────────────────────────────────────────
  useEffect(() => {
    function poll() {
      fetch("/api/camera/mode").then(r => r.json()).then(d => setCamMode(d.mode)).catch(() => {});
      fetch("/api/camera/status").then(r => r.json()).then(d => { setRestCamConnected(d.connected === true); setCamRunning(d.connected === true); }).catch(() => setRestCamConnected(false));
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Calibration, config, processes ────────────────────────────────────────
  useEffect(() => {
    fetch("/api/arm/calibration").then(r => r.json()).then(d => setCalibration({ leader: d.leader || {}, follower: d.follower || {} })).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => { if (d.leader_port) setLeaderPort(d.leader_port); if (d.follower_port) setFollowerPort(d.follower_port); }).catch(() => {});
  }, []);
  useEffect(() => {
    function poll() { fetch("/api/processes/status").then(r => r.json()).then(setProcs).catch(() => {}); }
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function toggleCamera() {
    const ep = camRunning ? "/api/camera/stop" : "/api/camera/start";
    try {
      const r = await fetch(ep, { method: "POST" });
      if (r.ok) { const next = !camRunning; setCamRunning(next); setRestCamConnected(next); feedActiveRef.current = next; }
    } catch {}
  }

  async function toggleCamMode() {
    const next = camMode === "rgb" ? "ir" : "rgb";
    setModeLoading(true);
    try {
      const r = await fetch("/api/camera/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: next }) });
      if (r.ok) setCamMode(next);
    } catch {}
    setModeLoading(false);
  }

  async function applyPorts() {
    if (leaderPort === followerPort) return;
    await fetch("/api/config/ports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leader_port: leaderPort, follower_port: followerPort }) }).catch(() => {});
  }

  async function toggleTeleop() {
    const ep = procs.teleop?.running ? "/api/processes/teleop/stop" : "/api/processes/teleop/start";
    await fetch(ep, { method: "POST" }).catch(() => {});
  }

  async function toggleRecord() {
    if (procs.record?.running) {
      await fetch("/api/processes/record/stop", { method: "POST" }).catch(() => {});
    } else {
      await fetch("/api/processes/record/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: recordTask, num_episodes: recordEpisodes, repo_id: recordRepoId }) }).catch(() => {});
    }
  }

  async function moveJoint(joint, angle, isFinal = false) {
    if (!followerConnected) return;
    await fetch("/api/arm/follower/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joint, angle: parseFloat(angle), speed: motorSpeed, acceleration: motorAccel }) }).catch(() => {});
    if (isFinal) setDragState(s => { const n = { ...s }; delete n[joint]; return n; });
  }

  function onJointDrag(joint, value) {
    setDragState(s => ({ ...s, [joint]: parseFloat(value) }));
    const now = Date.now();
    const last = lastSendRef.current[joint] || 0;
    if (now - last >= 120) { lastSendRef.current[joint] = now; moveJoint(joint, value, false); }
  }

  // ── Health polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    function pollHealth() {
      fetch("/api/health/status").then(r => r.json()).then(d => setHealthStatus(d)).catch(() => {});
      fetch("/api/health/history?days=7").then(r => r.json()).then(d => setHealthHistory(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (activeTab === "health") { pollHealth(); }
  }, [activeTab]);

  async function healthLogin() {
    setHealthLoginLoading(true);
    try {
      const r = await fetch("/api/health/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: healthLoginEmail, password: healthLoginPassword }) });
      const d = await r.json();
      if (d.success) {
        setHealthLoginEmail(""); setHealthLoginPassword("");
        fetch("/api/health/status").then(r2 => r2.json()).then(setHealthStatus).catch(() => {});
      }
    } catch {}
    setHealthLoginLoading(false);
  }

  async function healthSync() {
    setHealthSyncLoading(true);
    try {
      const r = await fetch("/api/health/sync", { method: "POST" });
      if (r.ok) {
        fetch("/api/health/status").then(r2 => r2.json()).then(setHealthStatus).catch(() => {});
        fetch("/api/health/history?days=7").then(r2 => r2.json()).then(d => setHealthHistory(Array.isArray(d) ? d : [])).catch(() => {});
      }
    } catch {}
    setHealthSyncLoading(false);
  }

  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  async function sendChatMessage() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMessages(m => [...m, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const r = await fetch("/api/health/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg, session_id: chatSessionId }) });
      const d = await r.json();
      setChatMessages(m => [...m, { role: "assistant", content: d.response, tokens_used: d.tokens_used }]);
    } catch {
      setChatMessages(m => [...m, { role: "assistant", content: "Error — could not reach health chat." }]);
    }
    setChatLoading(false);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const sys = telemetry?.system;
  const cam = telemetry?.camera;
  const leader = telemetry?.leader;
  const follower = telemetry?.follower;
  const leaderConnected = leader?.connected ?? false;
  const followerConnected = follower?.connected ?? false;
  const anyArmConnected = leaderConnected || followerConnected;
  const camConnected = (cam?.connected ?? false) || restCamConnected;
  const SIDEBAR_W = sidebarOpen ? 200 : 56;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Global Status Bar ──────────────────────────────────────────────── */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            title="Toggle sidebar"
            style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 20, padding: "2px 4px", lineHeight: 1, borderRadius: 4 }}
          >
            ☰
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.5 }}>🦾 Lumo</span>
          <StatusDot connected={leaderConnected} label="LEADER" />
          <StatusDot connected={followerConnected} label="FOLLOWER" />
          <StatusDot connected={camConnected} label="CAM" />
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)", alignItems: "center" }}>
          <span>CPU <b style={{ color: "var(--text)" }}>{sys?.cpu_pct?.toFixed(0) ?? "--"}%</b></span>
          <span>Temp <b style={{ color: "var(--text)" }}>{sys?.cpu_temp ?? "--"}°C</b></span>
          <span>MEM <b style={{ color: "var(--text)" }}>{sys?.mem_pct?.toFixed(0) ?? "--"}%</b></span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: wsState === "connected" ? "#0d2a1a" : "#1a0d0d", color: wsState === "connected" ? "var(--success)" : "#ef4444", border: `1px solid ${wsState === "connected" ? "#1a4a2a" : "#4a1a1a"}` }}>
            WS: {wsState}
          </span>
          {/* Emergency stop always visible */}
          <button
            onClick={() => fetch("/api/arm/stop", { method: "POST" })}
            style={{ padding: "5px 14px", borderRadius: 6, border: "2px solid var(--danger)", background: "#1a0505", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}
          >
            🛑 E-STOP
          </button>
        </div>
      </div>

      {/* ── Body: Sidebar + Content ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: SIDEBAR_W, flexShrink: 0, borderRight: "1px solid var(--border)",
          background: "var(--card-bg)", transition: "width 0.2s ease",
          overflow: "hidden", display: "flex", flexDirection: "column", paddingTop: 8,
        }}>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              style={{
                display: "flex", alignItems: "center",
                gap: sidebarOpen ? 10 : 0,
                padding: sidebarOpen ? "11px 16px" : "11px 0",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                background: activeTab === item.id ? "#0d2a1a" : "transparent",
                border: "none",
                borderLeft: activeTab === item.id ? "3px solid var(--success)" : "3px solid transparent",
                color: activeTab === item.id ? "var(--success)" : "var(--text-muted)",
                cursor: "pointer", fontSize: 13,
                fontWeight: activeTab === item.id ? 600 : 400,
                width: "100%", textAlign: "left",
                whiteSpace: "nowrap", transition: "background 0.15s",
              }}
            >
              <span style={{ fontSize: 17 }}>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 16, overflow: "auto" }}>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* OVERVIEW TAB                                                    */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, height: "100%" }}>

              {/* Camera feed */}
              <div style={{ background: "#000", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", position: "relative", minHeight: 340 }}>
                <div style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: camConnected ? "#0d2a1a" : "#1a0d0d", color: camConnected ? "var(--success)" : "#ef4444", border: `1px solid ${camConnected ? "#1a4a2a" : "#4a1a1a"}` }}>
                    {camConnected ? "● LIVE" : "● OFFLINE"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={toggleCamera} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: camRunning ? "#1a0505" : "#051a05", color: camRunning ? "#ef4444" : "var(--success)", border: `1px solid ${camRunning ? "#4a1a1a" : "#1a4a1a"}`, cursor: "pointer", fontWeight: 700 }}>
                      {camRunning ? "⏹ OFF" : "▶ ON"}
                    </button>
                    {camRunning && (
                      <>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: camMode === "ir" ? "#1a0d2a" : "#0d1a2a", color: camMode === "ir" ? "#c084fc" : "#60a5fa", border: `1px solid ${camMode === "ir" ? "#4a1a6a" : "#1a3a6a"}`, fontWeight: 600, letterSpacing: 0.5 }}>
                          {camMode === "ir" ? "🌙 IR" : "☀️ RGB"}
                        </span>
                        <button onClick={toggleCamMode} disabled={modeLoading} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "#111", color: modeLoading ? "#555" : "var(--text)", border: "1px solid var(--border)", cursor: modeLoading ? "wait" : "pointer", fontWeight: 600 }}>
                          {modeLoading ? "..." : camMode === "ir" ? "→ RGB" : "→ IR"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#000" }} />
              </div>

              {/* Right panel */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Arm status */}
                <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Arm Status</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <StatusDot connected={leaderConnected} label="Leader" />
                    <StatusDot connected={followerConnected} label="Follower" />
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Quick Actions</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={() => fetch("/api/arm/home", { method: "POST" })} style={{ padding: "10px", borderRadius: 8, border: "1px solid var(--border)", background: "#111", color: "var(--text)", cursor: "pointer", fontSize: 14, width: "100%" }}>
                      🏠 Home
                    </button>
                    <button onClick={() => fetch("/api/arm/stop", { method: "POST" })} style={{ padding: "10px", borderRadius: 8, border: "2px solid var(--danger)", background: "#1a0505", color: "var(--danger)", cursor: "pointer", fontSize: 14, fontWeight: 700, letterSpacing: 0.5, width: "100%" }}>
                      🛑 EMERGENCY STOP
                    </button>
                  </div>
                </div>

                {/* Process status */}
                <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>Processes</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { key: "teleop", label: "Teleoperation", color: "var(--success)" },
                      { key: "record", label: "Recording", color: "#f59e0b" },
                    ].map(({ key, label, color }) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: procs[key]?.running ? color : "#555", display: "inline-block", flexShrink: 0, boxShadow: procs[key]?.running ? `0 0 6px ${color}` : "none" }} />
                        <span style={{ fontSize: 13, color: procs[key]?.running ? "var(--text)" : "var(--text-muted)" }}>
                          {label}: {procs[key]?.running ? "Running" : "Idle"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ARMS TAB                                                        */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "arms" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Leader + Follower panels */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { key: "leader", label: "Leader Arm", port: leaderPort, data: leader, connected: leaderConnected, cal: calibration.leader },
                  { key: "follower", label: "Follower Arm", port: followerPort, data: follower, connected: followerConnected, cal: calibration.follower },
                ].map(({ key, label, port, data, connected, cal }) => (
                  <div key={key} style={{ background: "var(--card-bg)", border: `1px solid ${connected ? "var(--border)" : "#2a1a1a"}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
                        🦾 {label}
                      </h2>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: connected ? "#0d2a1a" : "#1a0d0d", color: connected ? "var(--success)" : "#ef4444", border: `1px solid ${connected ? "#1a4a2a" : "#4a1a1a"}` }}>
                        {connected ? `● ${port}` : "○ offline"}
                      </span>
                    </div>
                    {JOINTS.map(name => (
                      <JointRow key={name} name={name} data={data?.joints?.[name]} limits={cal?.[name]} />
                    ))}
                  </div>
                ))}
              </div>

              {/* Joint Control */}
              <div style={{ background: "var(--card-bg)", border: `1px solid ${followerConnected ? "var(--border)" : "#2a1a1a"}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>🎛 Joint Control</h3>
                  <span style={{ fontSize: 11, color: followerConnected ? "var(--success)" : "#555" }}>{followerConnected ? "● live" : "○ offline"}</span>
                </div>

                {/* Speed & Accel */}
                <div style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                  {[
                    { label: "Speed", value: motorSpeed, set: setMotorSpeed, min: 0, max: 100, step: 5, unit: "%", color: "var(--primary)" },
                    { label: "Accel", value: motorAccel, set: setMotorAccel, min: 0, max: 50, step: 1, unit: "", color: "#f59e0b" },
                  ].map(({ label, value, set, min, max, step, unit, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 44 }}>{label}</span>
                      <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(parseInt(e.target.value))} style={{ flex: 1, accentColor: color }} />
                      <span style={{ fontFamily: "monospace", fontSize: 11, color, minWidth: 36, textAlign: "right" }}>{value}{unit}</span>
                    </div>
                  ))}
                </div>

                {/* Joint sliders */}
                {JOINTS.map(name => {
                  const cur = follower?.joints?.[name]?.pos;
                  const lim = calibration.follower?.[name];
                  const min = lim?.min ?? (name === "gripper" ? 0 : -180);
                  const max = lim?.max ?? (name === "gripper" ? 100 : 180);
                  const unit = name === "gripper" ? "%" : "°";
                  const isDragging = name in dragState;
                  const val = isDragging ? dragState[name] : (cur ?? min);
                  return (
                    <div key={name} style={{ marginBottom: 10 }}>
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
                        type="range" min={min} max={max} step={0.5} value={val}
                        disabled={!followerConnected}
                        onChange={e => onJointDrag(name, e.target.value)}
                        onMouseUp={e => moveJoint(name, e.target.value, true)}
                        onTouchEnd={e => moveJoint(name, e.target.value, true)}
                        style={{ width: "100%", accentColor: followerConnected ? (isDragging ? "#f59e0b" : "var(--primary)") : "#555", opacity: followerConnected ? 1 : 0.4 }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", marginTop: 1 }}>
                        <span>{min}{unit}</span><span>{max}{unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* OPERATIONS TAB                                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "operations" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 860 }}>

              {/* Teleop */}
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>🎮 Teleoperation</h3>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: procs.teleop?.running ? "var(--success)" : "#555", display: "inline-block", boxShadow: procs.teleop?.running ? "0 0 6px var(--success)" : "none" }} />
                </div>
                <button onClick={toggleTeleop} style={{ width: "100%", padding: "12px", borderRadius: 8, border: `1px solid ${procs.teleop?.running ? "var(--danger)" : "var(--border)"}`, background: procs.teleop?.running ? "#1a0505" : "#0d2a1a", color: procs.teleop?.running ? "var(--danger)" : "var(--success)", cursor: "pointer", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  {procs.teleop?.running ? "⏹ Stop Teleop" : "▶ Start Teleop"}
                </button>
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {procs.teleop?.last_line || (procs.teleop?.running ? "Running..." : "Idle")}
                </p>
              </div>

              {/* Record Dataset */}
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>📼 Record Dataset</h3>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: procs.record?.running ? "#f59e0b" : "#555", display: "inline-block", boxShadow: procs.record?.running ? "0 0 6px #f59e0b" : "none" }} />
                </div>
                {!procs.record?.running && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Task description</label>
                      <input value={recordTask} onChange={e => setRecordTask(e.target.value)} placeholder="e.g. Pick and place" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Episodes</label>
                        <input type="number" value={recordEpisodes} onChange={e => setRecordEpisodes(parseInt(e.target.value))} min={1} max={100} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Repo ID</label>
                        <input value={recordRepoId} onChange={e => setRecordRepoId(e.target.value)} placeholder="user/dataset" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} />
                      </div>
                    </div>
                  </div>
                )}
                <button onClick={toggleRecord} style={{ width: "100%", padding: "12px", borderRadius: 8, border: `1px solid ${procs.record?.running ? "var(--danger)" : "#f59e0b"}`, background: procs.record?.running ? "#1a0505" : "#1a1200", color: procs.record?.running ? "var(--danger)" : "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  {procs.record?.running ? "⏹ Stop Recording" : "▶ Start Recording"}
                </button>
                <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {procs.record?.last_line || (procs.record?.running ? "Recording..." : "Idle")}
                </p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* CONFIG TAB                                                      */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "config" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>

              {/* Port config */}
              <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 13, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>⚙️ Port Configuration</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "🦾 Leader Port", value: leaderPort, set: setLeaderPort },
                    { label: "🤖 Follower Port", value: followerPort, set: setFollowerPort },
                  ].map(({ label, value, set }) => (
                    <div key={label}>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>{label}</label>
                      <select value={value} onChange={e => set(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13, cursor: "pointer" }}>
                        {["/dev/ttyACM0", "/dev/ttyACM1", "/dev/ttyUSB0", "/dev/ttyUSB1"].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  ))}
                  {leaderPort === followerPort && (
                    <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ Ports must be different</span>
                  )}
                  <button
                    onClick={applyPorts}
                    disabled={leaderPort === followerPort}
                    style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)", background: leaderPort === followerPort ? "#111" : "#0d2a1a", color: leaderPort === followerPort ? "#555" : "var(--success)", cursor: leaderPort === followerPort ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* HEALTH TAB                                                      */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "health" && (
            <div style={{ display: "flex", gap: 16, height: "calc(100vh - 120px)", overflow: "hidden" }}>

              {/* ── Left: Metrics Panel ──────────────────────────────────── */}
              <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

                {/* Header */}
                <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: healthStatus.connected ? 10 : 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>❤️ Health</span>
                    <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 10, background: healthStatus.connected ? "#0d2a1a" : "#1a1a1a", color: healthStatus.connected ? "var(--success)" : "#555", border: `1px solid ${healthStatus.connected ? "#1a4a2a" : "#333"}` }}>
                      {healthStatus.connected ? "● Connected" : "○ Not Connected"}
                    </span>
                  </div>

                  {/* Login form when not connected */}
                  {!healthStatus.connected && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                      <input
                        type="email"
                        placeholder="Garmin email"
                        value={healthLoginEmail}
                        onChange={e => setHealthLoginEmail(e.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13 }}
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={healthLoginPassword}
                        onChange={e => setHealthLoginPassword(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && healthLogin()}
                        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13 }}
                      />
                      <button
                        onClick={healthLogin}
                        disabled={healthLoginLoading || !healthLoginEmail || !healthLoginPassword}
                        style={{ padding: "9px", borderRadius: 8, border: "1px solid var(--border)", background: "#0d2a1a", color: "var(--success)", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: healthLoginLoading ? 0.6 : 1 }}
                      >
                        {healthLoginLoading ? "Connecting..." : "Connect Garmin"}
                      </button>
                    </div>
                  )}

                  {/* Sync button when connected */}
                  {healthStatus.connected && (
                    <button
                      onClick={healthSync}
                      disabled={healthSyncLoading}
                      style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "#111", color: healthSyncLoading ? "#555" : "var(--text)", cursor: healthSyncLoading ? "wait" : "pointer", fontSize: 13 }}
                    >
                      {healthSyncLoading ? "Syncing..." : "↻ Sync Now"}
                    </button>
                  )}
                </div>

                {/* Today's stat cards */}
                {healthStatus.today && (() => {
                  const t = healthStatus.today;
                  const cards = [
                    {
                      icon: "😴", label: "Sleep Score", value: t.sleep_score, unit: "",
                      pct: t.sleep_score != null ? Math.min(100, t.sleep_score) : null,
                      color: t.sleep_score >= 70 ? "var(--success)" : t.sleep_score >= 50 ? "#f59e0b" : "#ef4444",
                    },
                    {
                      icon: "💓", label: "HRV Avg", value: t.hrv_avg, unit: " ms",
                      pct: t.hrv_avg != null ? Math.min(100, (t.hrv_avg / 100) * 100) : null,
                      color: t.hrv_avg >= 50 ? "var(--success)" : t.hrv_avg >= 35 ? "#f59e0b" : "#ef4444",
                    },
                    {
                      icon: "⚡", label: "Body Battery", value: t.body_battery_max, unit: "%",
                      pct: t.body_battery_max != null ? Math.min(100, t.body_battery_max) : null,
                      color: t.body_battery_max >= 60 ? "var(--success)" : t.body_battery_max >= 30 ? "#f59e0b" : "#ef4444",
                    },
                    {
                      icon: "🧘", label: "Stress Avg", value: t.stress_avg, unit: "",
                      pct: t.stress_avg != null ? Math.min(100, t.stress_avg) : null,
                      color: t.stress_avg <= 25 ? "var(--success)" : t.stress_avg <= 50 ? "#f59e0b" : "#ef4444",
                    },
                    {
                      icon: "👟", label: "Steps", value: t.steps, unit: "",
                      pct: t.steps != null ? Math.min(100, (t.steps / 10000) * 100) : null,
                      color: t.steps >= 8000 ? "var(--success)" : t.steps >= 5000 ? "#f59e0b" : "#ef4444",
                    },
                  ];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {cards.map(card => (
                        <div key={card.label} style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{card.icon} {card.label}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 14, color: card.value != null ? card.color : "#555", fontWeight: 600 }}>
                              {card.value != null ? `${typeof card.value === "number" && card.label !== "Steps" ? card.value.toFixed(0) : card.value}${card.unit}` : "--"}
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: "#1a1a1a" }}>
                            {card.pct != null && (
                              <div style={{ height: 4, borderRadius: 2, background: card.color, width: `${Math.max(0, Math.min(100, card.pct))}%`, maxWidth: "100%", transition: "width 0.4s ease" }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 7-day history list */}
                {healthHistory.length > 0 && (
                  <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                    <h3 style={{ margin: "0 0 10px 0", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>7-Day History</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {healthHistory.map(row => {
                        const d = new Date(row.date + "T00:00:00");
                        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        return (
                          <div key={row.date} style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", padding: "3px 0", borderBottom: "1px solid #1a1a1a" }}>
                            {label} · 😴{row.sleep_score ?? "--"} · ⚡{row.body_battery_max ?? "--"} · 💓{row.hrv_avg ?? "--"}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right: Chat Panel ─────────────────────────────────────── */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>

                {/* Message list */}
                <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {chatMessages.length === 0 && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>Ask me about your sleep, energy, stress, or activity</span>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "80%", padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                        background: msg.role === "user" ? "#0d2a1a" : "var(--card-bg)",
                        border: `1px solid ${msg.role === "user" ? "var(--primary)" : "var(--border)"}`,
                        color: "var(--text)",
                        whiteSpace: "pre-wrap",
                      }}>
                        {msg.content}
                      </div>
                      {msg.role === "assistant" && msg.tokens_used && (
                        <span style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{msg.tokens_used} tokens</span>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: "flex", alignItems: "flex-start" }}>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "var(--card-bg)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
                    placeholder="Ask about your health data..."
                    disabled={chatLoading}
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "#111", color: "var(--text)", fontSize: 13, outline: "none" }}
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={chatLoading || !chatInput.trim()}
                    style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)", background: chatLoading || !chatInput.trim() ? "#111" : "#0d2a1a", color: chatLoading || !chatInput.trim() ? "#555" : "var(--success)", cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
