"use client";

import { Box, Stack, TextField, Typography } from "@mui/material";

import type { DashboardViewModel } from "@/src/hooks/useDashboardState";
import { ActionButton } from "@/src/components/ui/ActionButton";
import { Card } from "@/src/components/ui/Card";
import { SectionTitle } from "@/src/components/ui/SectionTitle";
import tabs from "@/src/components/dashboard/tabs/Tabs.module.css";

type Props = { vm: DashboardViewModel };

export function OperationsTab({ vm }: Props) {
  const { state, actions } = vm;
  const { procs, recordTask, recordEpisodes, recordRepoId } = state;

  return (
    <Box className={tabs.operationsGrid}>
      <Card sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <SectionTitle sx={{ mb: 0 }}>🎮 Teleoperation</SectionTitle>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: procs.teleop?.running ? "var(--success)" : "#555",
              boxShadow: procs.teleop?.running ? "0 0 6px var(--success)" : "none",
            }}
          />
        </Stack>
        <ActionButton
          onClick={actions.toggleTeleop}
          fullWidth
          tone={procs.teleop?.running ? "danger" : "success"}
          sx={{ mb: 1.25 }}
        >
          {procs.teleop?.running ? "⏹ Stop Teleop" : "▶ Start Teleop"}
        </ActionButton>
        <Typography className={tabs.monoLine}>
          {procs.teleop?.last_line || (procs.teleop?.running ? "Running..." : "Idle")}
        </Typography>
      </Card>

      <Card sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <SectionTitle sx={{ mb: 0 }}>📼 Record Dataset</SectionTitle>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: procs.record?.running ? "#f59e0b" : "#555",
              boxShadow: procs.record?.running ? "0 0 6px #f59e0b" : "none",
            }}
          />
        </Stack>

        {!procs.record?.running ? (
          <Stack spacing={1} sx={{ mb: 1.25 }}>
            <TextField
              label="Task description"
              value={recordTask}
              onChange={(event) => state.setRecordTask(event.target.value)}
              placeholder="e.g. Pick and place"
              fullWidth
            />
            <Box className={tabs.numberGrid}>
              <TextField
                label="Episodes"
                type="number"
                value={recordEpisodes}
                inputProps={{ min: 1, max: 100 }}
                onChange={(event) => state.setRecordEpisodes(Number.parseInt(event.target.value || "0", 10))}
                fullWidth
              />
              <TextField
                label="Repo ID"
                value={recordRepoId}
                onChange={(event) => state.setRecordRepoId(event.target.value)}
                placeholder="user/dataset"
                fullWidth
              />
            </Box>
          </Stack>
        ) : null}

        <ActionButton
          onClick={actions.toggleRecord}
          fullWidth
          tone={procs.record?.running ? "danger" : "warning"}
          sx={{ mb: 1.25 }}
        >
          {procs.record?.running ? "⏹ Stop Recording" : "▶ Start Recording"}
        </ActionButton>
        <Typography className={tabs.monoLine}>
          {procs.record?.last_line || (procs.record?.running ? "Recording..." : "Idle")}
        </Typography>
      </Card>
    </Box>
  );
}
