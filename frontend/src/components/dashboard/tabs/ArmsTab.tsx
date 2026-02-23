"use client";

import { Box, Slider, Stack, Typography } from "@mui/material";

import type { DashboardViewModel } from "@/src/hooks/useDashboardState";
import { JOINTS } from "@/src/lib/constants/dashboard";
import { JointRow } from "@/src/components/arm/JointRow";
import { JointSliderControl } from "@/src/components/arm/JointSliderControl";
import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { SectionTitle } from "@/src/components/ui/SectionTitle";
import tabs from "@/src/components/dashboard/tabs/Tabs.module.css";

type Props = { vm: DashboardViewModel };

export function ArmsTab({ vm }: Props) {
  const { state, derived, actions } = vm;
  const { leaderPort, followerPort, calibration, dragState, motorSpeed, motorAccel } = state;
  const { leader, follower, leaderConnected, followerConnected } = derived;

  return (
    <Box className={tabs.armsGrid}>
      <Stack spacing={1.5}>
        {[
          { key: "leader", label: "Leader Arm", port: leaderPort, data: leader, connected: leaderConnected, cal: calibration.leader },
          { key: "follower", label: "Follower Arm", port: followerPort, data: follower, connected: followerConnected, cal: calibration.follower },
        ].map(({ key, label, port, data, connected, cal }) => (
          <Card key={key} sx={{ borderColor: connected ? "divider" : "#2a1a1a" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Typography variant="overline" sx={{ fontSize: 13, color: "text.secondary", letterSpacing: "0.08em" }}>
                🦾 {label}
              </Typography>
              <Badge tone={connected ? "success" : "danger"}>
                {connected ? `● ${port}` : "○ offline"}
              </Badge>
            </Stack>
            {JOINTS.map((name) => (
              <JointRow key={name} name={name} data={data?.joints?.[name]} limits={cal?.[name]} />
            ))}
          </Card>
        ))}
      </Stack>

      <Card sx={{ borderColor: followerConnected ? "divider" : "#2a1a1a" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <SectionTitle sx={{ mb: 0 }}>🎛 Joint Control</SectionTitle>
          <Typography variant="caption" sx={{ color: followerConnected ? "success.main" : "#555" }}>
            {followerConnected ? "● live" : "○ offline"}
          </Typography>
        </Stack>

        <Box className={tabs.speedBox}>
          {[
            { label: "Speed", value: motorSpeed, setValue: state.setMotorSpeed, min: 0, max: 100, step: 5, unit: "%", color: "var(--primary)" },
            { label: "Accel", value: motorAccel, setValue: state.setMotorAccel, min: 0, max: 50, step: 1, unit: "", color: "#f59e0b" },
          ].map(({ label, value, setValue, min, max, step, unit, color }) => (
            <div className={tabs.speedRow} key={label}>
              <span className={tabs.speedLabel}>{label}</span>
              <Slider
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(_, newValue) => setValue(Number(newValue))}
                sx={{ color, flex: 1, py: 0 }}
              />
              <span className={tabs.speedValue} style={{ color }}>
                {value}
                {unit}
              </span>
            </div>
          ))}
        </Box>

        {JOINTS.map((name) => (
          <JointSliderControl
            key={name}
            name={name}
            follower={follower}
            calibration={calibration.follower}
            dragState={dragState}
            followerConnected={followerConnected}
            onJointDrag={actions.onJointDrag}
            moveJoint={actions.moveJoint}
          />
        ))}
      </Card>
    </Box>
  );
}
