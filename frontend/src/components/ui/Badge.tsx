"use client";

import { Chip } from "@mui/material";
import type { ChipProps } from "@mui/material";
import type { ReactNode } from "react";

type Tone = "default" | "success" | "danger" | "warning" | "info" | "muted";

export type BadgeProps = Omit<ChipProps, "label" | "color" | "children"> & {
  children: ReactNode;
  tone?: Tone;
};

export function Badge({ children, tone = "default", sx, size = "small", ...props }: BadgeProps) {
  const toneSx =
    tone === "success"
      ? { bgcolor: "#0d2a1a", color: "success.main", borderColor: "#1a4a2a" }
      : tone === "danger"
        ? { bgcolor: "#1a0d0d", color: "error.main", borderColor: "#4a1a1a" }
        : tone === "warning"
          ? { bgcolor: "#1a1200", color: "warning.main", borderColor: "#5c4100" }
          : tone === "info"
            ? { bgcolor: "#0d1a2a", color: "#60a5fa", borderColor: "#1a3a6a" }
            : tone === "muted"
              ? { bgcolor: "#1a1a1a", color: "#777", borderColor: "#333" }
              : {};

  return (
    <Chip
      label={children}
      size={size}
      variant="outlined"
      sx={{
        borderRadius: 1,
        height: 22,
        fontSize: 11,
        "& .MuiChip-label": { px: 1 },
        ...toneSx,
        ...sx,
      }}
      {...props}
    />
  );
}
