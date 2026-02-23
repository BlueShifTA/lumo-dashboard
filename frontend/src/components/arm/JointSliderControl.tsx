"use client";

import { Box, Slider, Stack, Typography } from "@mui/material";

import { JOINT_LABELS } from "@/src/lib/constants/dashboard";
import type { ArmTelemetry, CalibrationMap, JointName } from "@/src/lib/api/types";
import styles from "@/src/components/arm/JointSliderControl.module.css";

type JointSliderControlProps = {
  name: JointName;
  follower?: ArmTelemetry;
  calibration?: CalibrationMap;
  dragState: Partial<Record<JointName, number>>;
  followerConnected: boolean;
  onJointDrag: (joint: JointName, value: string) => void;
  moveJoint: (joint: JointName, angle: string | number, isFinal?: boolean) => Promise<void>;
};

export function JointSliderControl({
  name,
  follower,
  calibration,
  dragState,
  followerConnected,
  onJointDrag,
  moveJoint,
}: JointSliderControlProps) {
  const cur = follower?.joints?.[name]?.pos;
  const lim = calibration?.[name];
  const min = lim?.min ?? (name === "gripper" ? 0 : -180);
  const max = lim?.max ?? (name === "gripper" ? 100 : 180);
  const unit = name === "gripper" ? "%" : "°";
  const isDragging = name in dragState;
  const val = isDragging ? dragState[name] ?? min : (cur ?? min);
  const accentColor = followerConnected ? (isDragging ? "#f59e0b" : "var(--primary)") : "#555";

  return (
    <div className={styles.sliderRow}>
      <div className={styles.sliderHeader}>
        <span>{JOINT_LABELS[name]}</span>
        <span className={`${styles.sliderValue} ${followerConnected ? "" : styles.sliderValueMuted}`.trim()}>
          {isDragging ? (
            <span className={styles.sliderValueDragging}>
              {Number.parseFloat(String(val)).toFixed(1)}
              {unit}
            </span>
          ) : cur != null ? (
            `${cur.toFixed(1)}${unit}`
          ) : (
            "--"
          )}
        </span>
      </div>
      <Box sx={{ px: 0.5 }}>
        <Slider
          value={Number(val)}
          min={min}
          max={max}
          step={0.5}
          disabled={!followerConnected}
          onChange={(_, value) => onJointDrag(name, String(value))}
          onChangeCommitted={(_, value) => {
            void moveJoint(name, String(value), true);
          }}
          sx={{
            color: accentColor,
            py: 0.5,
            "& .MuiSlider-thumb": { width: 12, height: 12 },
          }}
        />
      </Box>
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
  );
}
