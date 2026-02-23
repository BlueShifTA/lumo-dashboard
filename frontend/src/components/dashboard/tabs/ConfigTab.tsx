"use client";

import { Box, MenuItem, Stack, TextField } from "@mui/material";

import type { DashboardViewModel } from "@/src/hooks/useDashboardState";
import { PORT_OPTIONS } from "@/src/lib/constants/dashboard";
import { ActionButton } from "@/src/components/ui/ActionButton";
import { Card } from "@/src/components/ui/Card";
import { SectionTitle } from "@/src/components/ui/SectionTitle";
import tabs from "@/src/components/dashboard/tabs/Tabs.module.css";

type Props = { vm: DashboardViewModel };

export function ConfigTab({ vm }: Props) {
  const { state, actions } = vm;
  const portsConflict = state.leaderPort === state.followerPort;

  return (
    <Box className={tabs.configWrap}>
      <Card sx={{ p: 2.5 }}>
        <SectionTitle>⚙️ Port Configuration</SectionTitle>
        <Stack spacing={1.5}>
          <TextField
            select
            label="🦾 Leader Port"
            value={state.leaderPort}
            onChange={(event) => state.setLeaderPort(event.target.value)}
            fullWidth
          >
            {PORT_OPTIONS.map((port) => (
              <MenuItem key={port} value={port}>
                {port}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="🤖 Follower Port"
            value={state.followerPort}
            onChange={(event) => state.setFollowerPort(event.target.value)}
            fullWidth
          >
            {PORT_OPTIONS.map((port) => (
              <MenuItem key={port} value={port}>
                {port}
              </MenuItem>
            ))}
          </TextField>

          {portsConflict ? <span className={tabs.warningText}>⚠ Ports must be different</span> : null}

          <ActionButton onClick={actions.applyPorts} disabled={portsConflict} tone={portsConflict ? "default" : "success"}>
            Apply
          </ActionButton>
        </Stack>
      </Card>
    </Box>
  );
}
