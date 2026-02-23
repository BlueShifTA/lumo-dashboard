"use client";

import { IconButton } from "@mui/material";

import type { DashboardViewModel } from "@/src/hooks/useDashboardState";
import { NAV_ITEMS } from "@/src/lib/constants/dashboard";
import { ActionButton } from "@/src/components/ui/ActionButton";
import { Badge } from "@/src/components/ui/Badge";
import { StatusDot } from "@/src/components/ui/StatusDot";
import { ArmsTab } from "@/src/components/dashboard/tabs/ArmsTab";
import { ConfigTab } from "@/src/components/dashboard/tabs/ConfigTab";
import { OperationsTab } from "@/src/components/dashboard/tabs/OperationsTab";
import { OverviewTab } from "@/src/components/dashboard/tabs/OverviewTab";
import styles from "@/src/components/dashboard/DashboardShell.module.css";

type Props = {
  vm: DashboardViewModel;
};

export function DashboardShell({ vm }: Props) {
  const { state, derived, actions } = vm;

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <IconButton
            size="small"
            onClick={() => state.setSidebarOpen((prev) => !prev)}
            title="Toggle sidebar"
            sx={{ color: "text.primary" }}
          >
            <span>☰</span>
          </IconButton>
          <span className={styles.brand}>🦾 Lumo</span>
          <StatusDot connected={derived.leaderConnected} label="LEADER" />
          <StatusDot connected={derived.followerConnected} label="FOLLOWER" />
          <StatusDot connected={derived.camConnected} label="CAM" />
        </div>

        <div className={styles.topRight}>
          <span className={styles.metric}>
            CPU <b className={styles.metricValue}>{derived.sys?.cpu_pct?.toFixed(0) ?? "--"}%</b>
          </span>
          <span className={styles.metric}>
            Temp <b className={styles.metricValue}>{derived.sys?.cpu_temp ?? "--"}°C</b>
          </span>
          <span className={styles.metric}>
            MEM <b className={styles.metricValue}>{derived.sys?.mem_pct?.toFixed(0) ?? "--"}%</b>
          </span>
          <Badge tone={state.wsState === "connected" ? "success" : "danger"}>WS: {state.wsState}</Badge>
          <ActionButton tone="danger" size="small" onClick={actions.triggerEmergencyStop}>
            🛑 E-STOP
          </ActionButton>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.sidebar} style={{ width: derived.sidebarWidth }}>
          {NAV_ITEMS.map((item) => {
            const active = state.activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`${styles.navItem} ${active ? styles.navItemActive : styles.navItemInactive}`.trim()}
                onClick={() => state.setActiveTab(item.id)}
                title={item.label}
                style={{
                  gap: state.sidebarOpen ? 10 : 0,
                  padding: state.sidebarOpen ? "11px 16px" : "11px 0",
                  justifyContent: state.sidebarOpen ? "flex-start" : "center",
                }}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {state.sidebarOpen ? <span>{item.label}</span> : null}
              </button>
            );
          })}
        </div>

        <div className={styles.mainContent}>
          {state.activeTab === "overview" ? <OverviewTab vm={vm} /> : null}
          {state.activeTab === "arms" ? <ArmsTab vm={vm} /> : null}
          {state.activeTab === "operations" ? <OperationsTab vm={vm} /> : null}
          {state.activeTab === "config" ? <ConfigTab vm={vm} /> : null}
        </div>
      </div>
    </div>
  );
}
