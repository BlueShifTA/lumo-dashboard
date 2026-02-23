"use client";

import { DashboardShell } from "@/src/components/dashboard/DashboardShell";
import { useDashboardState } from "@/src/hooks/useDashboardState";

export default function DashboardPage() {
  const vm = useDashboardState();
  return <DashboardShell vm={vm} />;
}
