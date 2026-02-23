"use client";

import { Button } from "@mui/material";
import type { ButtonProps } from "@mui/material";

type Tone = "default" | "success" | "danger" | "warning";

export type ActionButtonProps = ButtonProps & {
  tone?: Tone;
};

export function ActionButton({
  tone = "default",
  size = "medium",
  variant = "outlined",
  sx,
  ...props
}: ActionButtonProps) {
  const toneSx =
    tone === "success"
      ? { bgcolor: "#0d2a1a", color: "success.main", borderColor: "#1a4a2a" }
      : tone === "danger"
        ? { bgcolor: "#1a0505", color: "error.main", borderColor: "error.main", borderWidth: 2 }
        : tone === "warning"
          ? { bgcolor: "#1a1200", color: "warning.main", borderColor: "warning.main" }
          : { bgcolor: "#111", color: "text.primary", borderColor: "divider" };

  return (
    <Button
      size={size}
      variant={variant}
      sx={{
        justifyContent: "center",
        ...toneSx,
        "&:hover": { opacity: 0.9, ...toneSx },
        "&.Mui-disabled": { color: "#666", borderColor: "#333" },
        ...sx,
      }}
      {...props}
    />
  );
}
