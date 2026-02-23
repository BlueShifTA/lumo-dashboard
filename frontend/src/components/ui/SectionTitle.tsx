"use client";

import { Typography } from "@mui/material";
import type { TypographyProps } from "@mui/material";
import type { PropsWithChildren } from "react";

type SectionTitleProps = PropsWithChildren<TypographyProps>;

export function SectionTitle({ children, sx, ...props }: SectionTitleProps) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: "block",
        mb: 1.5,
        fontSize: 12,
        letterSpacing: "0.08em",
        color: "text.secondary",
        ...sx,
      }}
      {...props}
    >
      {children}
    </Typography>
  );
}
