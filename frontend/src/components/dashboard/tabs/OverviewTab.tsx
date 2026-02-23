"use client";

import { Box, Stack, Typography } from "@mui/material";

import type { DashboardViewModel } from "@/src/hooks/useDashboardState";
import { ActionButton } from "@/src/components/ui/ActionButton";
import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { SectionTitle } from "@/src/components/ui/SectionTitle";
import { StatusDot } from "@/src/components/ui/StatusDot";
import tabs from "@/src/components/dashboard/tabs/Tabs.module.css";

type Props = { vm: DashboardViewModel };

export function OverviewTab({ vm }: Props) {
  const { state, derived, refs, actions } = vm;
  const { sys, leaderConnected, followerConnected, camConnected } = derived;
  const { camMode, camRunning, modeLoading, procs } = state;

  return (
    <Box className={tabs.overviewGrid}>
      <Box className={tabs.cameraPanel}>
        <Box className={tabs.cameraOverlay}>
          <Badge tone={camConnected ? "success" : "danger"}>
            {camConnected ? "● LIVE" : "● OFFLINE"}
          </Badge>
          <Stack direction="row" spacing={1} alignItems="center">
            <ActionButton size="small" tone={camRunning ? "danger" : "success"} onClick={actions.toggleCamera}>
              {camRunning ? "⏹ OFF" : "▶ ON"}
            </ActionButton>
            {camRunning ? (
              <>
                <Badge tone={camMode === "ir" ? "warning" : "info"}>
                  {camMode === "ir" ? "🌙 IR" : "☀️ RGB"}
                </Badge>
                <ActionButton size="small" onClick={actions.toggleCamMode} disabled={modeLoading}>
                  {modeLoading ? "..." : camMode === "ir" ? "→ RGB" : "→ IR"}
                </ActionButton>
              </>
            ) : null}
          </Stack>
        </Box>
        <canvas ref={refs.canvasRef} className={tabs.canvas} />
      </Box>

      <Stack spacing={1.5}>
        <Card>
          <SectionTitle>Arm Status</SectionTitle>
          <Stack spacing={1}>
            <StatusDot connected={leaderConnected} label="Leader" />
            <StatusDot connected={followerConnected} label="Follower" />
          </Stack>
        </Card>

        <Card>
          <SectionTitle>Quick Actions</SectionTitle>
          <Stack spacing={1}>
            <ActionButton fullWidth onClick={actions.triggerHome}>
              🏠 Home
            </ActionButton>
            <ActionButton fullWidth tone="danger" onClick={actions.triggerEmergencyStop}>
              🛑 EMERGENCY STOP
            </ActionButton>
          </Stack>
        </Card>

        <Card>
          <SectionTitle>Processes</SectionTitle>
          <Stack spacing={1}>
            {[
              { key: "teleop" as const, label: "Teleoperation", color: "var(--success)" },
              { key: "record" as const, label: "Recording", color: "#f59e0b" },
            ].map(({ key, label, color }) => (
              <Stack direction="row" alignItems="center" spacing={1} key={key}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: procs[key]?.running ? color : "#555",
                    boxShadow: procs[key]?.running ? `0 0 6px ${color}` : "none",
                  }}
                />
                <Typography variant="body2" sx={{ fontSize: 13 }} color={procs[key]?.running ? "text.primary" : "text.secondary"}>
                  {label}: {procs[key]?.running ? "Running" : "Idle"}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Card>

        <Card dense>
          <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
            <Typography variant="caption" sx={{ fontSize: 13 }}>
              CPU <b>{sys?.cpu_pct?.toFixed(0) ?? "--"}%</b>
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 13 }}>
              Temp <b>{sys?.cpu_temp ?? "--"}°C</b>
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 13 }}>
              MEM <b>{sys?.mem_pct?.toFixed(0) ?? "--"}%</b>
            </Typography>
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}
