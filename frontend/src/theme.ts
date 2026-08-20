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

  /**
   * Growth assessment palette.
   *
   * Four outcomes, four colours. 'below' and 'behind' are deliberately
   * different hues: a kit that is small but growing steadily is not the same
   * as one whose gap is widening, and colouring them alike would make every
   * runt look like an emergency.
   */
  growthOnTrack: "#059669",
  growthOnTrackSoft: "#ecfdf5",
  growthAbove: "#0891b2",
  growthAboveSoft: "#ecfeff",
  growthBelow: "#d97706",
  growthBelowSoft: "#fffbeb",
  growthBehind: "#dc2626",
  growthBehindSoft: "#fef2f2",
  growthUnknown: "#94a3b8",
  growthUnknownSoft: "#f1f5f9",

  /** Litter life-stage accents, keyed to the rearing milestones in the
   *  published sources: nest box, starting solids, weaning at 35 days. */
  stageNursing: "#16a34a",
  stageNursingSoft: "#f0fdf4",
  stageSolids: "#0d9488",
  stageSolidsSoft: "#f0fdfa",
  stageWeaned: "#7c3aed",
  stageWeanedSoft: "#f5f3ff",
  stageGrown: "#64748b",
  stageGrownSoft: "#f1f5f9",

  /** Chart elements. */
  chartReference: "#94a3b8",
  chartBand: "#e2e8f0",
  chartLine: "#4f46e5",
  chartGrid: "#eef2f7",
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
  /** Delay between successive list items in a staggered entrance. */
  stagger: 70,
};
