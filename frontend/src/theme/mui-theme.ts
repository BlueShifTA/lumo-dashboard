import { createTheme } from "@mui/material/styles";

import { dashboardTokens } from "@/src/theme/tokens";

export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: dashboardTokens.primary },
    success: { main: dashboardTokens.success },
    error: { main: dashboardTokens.danger },
    warning: { main: dashboardTokens.warning },
    background: {
      default: dashboardTokens.bg,
      paper: dashboardTokens.card,
    },
    text: {
      primary: dashboardTokens.text,
      secondary: dashboardTokens.textMuted,
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${dashboardTokens.border}`,
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
  },
});
