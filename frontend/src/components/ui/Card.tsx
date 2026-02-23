"use client";

import { Paper } from "@mui/material";
import type { PaperProps } from "@mui/material";
import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<PaperProps & { dense?: boolean }>;

export function Card({ children, dense = false, sx, ...props }: CardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: dense ? 1.5 : 2,
        borderRadius: 2,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
}
