"use client";

import { Box, Stack, Typography } from "@mui/material";

export type StatusDotProps = {
  connected: boolean;
  label: string;
};

export function StatusDot({ connected, label }: StatusDotProps) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: connected ? "success.main" : "#555",
          boxShadow: connected ? "0 0 6px #22c55e" : "none",
          flexShrink: 0,
        }}
      />
      <Typography variant="caption" color={connected ? "text.primary" : "text.secondary"} sx={{ fontSize: 13 }}>
        {label}: {connected ? "Online" : "Offline"}
      </Typography>
    </Stack>
  );
}
