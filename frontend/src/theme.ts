/**
 * Design tokens for HopHub.
 *
 * Defined once so a palette or spacing change is a single edit rather than
 * a search across every screen — the same externalised-configuration
 * principle as .env on the backend and config.ts for the API URL.
 */

export const COLORS = {

    tierNormal: "#059669",
  tierMonitor: "#d97706",
  tierUrgent: "#dc2626",
  
  primary: "#4f46e5",
  primaryDark: "#4338ca",
  primarySoft: "#eef2ff",

  surface: "#ffffff",
  background: "#f8fafc",
  backgroundWarm: "#faf7f5",
  border: "#e5e7eb",
  borderFocus: "#a5b4fc",

  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",

  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  success: "#059669",
  successSoft: "#ecfdf5",

  female: "#ec4899",
  male: "#3b82f6",
  unknown: "#94a3b8",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

/** Shared animation timings, so motion feels consistent across screens. */
export const MOTION = {
  fast: 180,
  base: 320,
  slow: 480,
};