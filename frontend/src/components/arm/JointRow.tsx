"use client";

import { Box, Stack, Typography } from "@mui/material";

import { JOINT_LABELS } from "@/src/lib/constants/dashboard";
import type { CalibrationLimits, JointName, JointTelemetry } from "@/src/lib/api/types";
import { Badge } from "@/src/components/ui/Badge";
import styles from "@/src/components/arm/JointRow.module.css";

type JointRowProps = {
  name: JointName;
  data?: JointTelemetry;
  limits?: CalibrationLimits;
};

export function JointRow({ name, data, limits }: JointRowProps) {
  const pos = data?.pos;
  const offline = pos === null || pos === undefined;
  const min = limits?.min ?? (name === "gripper" ? 0 : -180);
  const max = limits?.max ?? (name === "gripper" ? 100 : 180);
  const unit = name === "gripper" ? "%" : "°";
  const pct = offline ? 50 : Math.round(((pos - min) / (max - min)) * 100);

  return (
    <Box className={styles.row}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" color={offline ? "text.secondary" : "text.primary"} sx={{ fontSize: 13 }}>
          {JOINT_LABELS[name]}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            component="span"
            sx={{
              fontFamily: "monospace",
              fontSize: 14,
              minWidth: 56,
              textAlign: "right",
              color: offline ? "text.secondary" : "primary.main",
            }}
          >
            {offline ? `--${unit}` : `${pos.toFixed(1)}${unit}`}
          </Typography>
          <Badge tone={offline ? "muted" : "success"}>{offline ? "OFFLINE" : "ACTIVE"}</Badge>
        </Stack>
      </Stack>
      <div className={styles.track}>
        <div
          className={`${styles.marker} ${offline ? styles.markerMuted : ""}`.trim()}
          style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
        />
        <div className={styles.limits}>
          <span>
            {min}
            {unit}
          </span>
          <span>
            {max}
            {unit}
          </span>
        </div>
      </div>
    </Box>
  );
}
