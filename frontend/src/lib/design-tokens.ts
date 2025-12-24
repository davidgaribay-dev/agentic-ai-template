/**
 * Centralized design tokens for layout, breakpoints, and spacing.
 *
 * Use these constants instead of magic numbers to maintain consistency
 * across the application and enable easy global updates.
 */

/** Responsive breakpoints in pixels */
export const BREAKPOINTS = {
  /** Mobile breakpoint (max-width for mobile detection) */
  mobile: 768,
  /** Tablet breakpoint */
  tablet: 1024,
  /** Desktop breakpoint */
  desktop: 1280,
} as const;

/** Layout dimensions in pixels */
export const LAYOUT = {
  /** Side panel configuration */
  sidePanel: {
    default: 500,
    min: 450,
    max: 600,
  },
  /** Sidebar configuration */
  sidebar: {
    /** Width when expanded */
    expanded: 256, // 16rem
    /** Width when collapsed (icon only) */
    collapsed: 48, // 3rem
  },
} as const;

/** Z-index layers for stacking context */
export const Z_INDEX = {
  /** Sidebar and navigation */
  sidebar: 40,
  /** Modal overlays */
  modal: 50,
  /** Toast notifications */
  toast: 60,
  /** Tooltips and popovers */
  tooltip: 70,
} as const;

/** Animation durations in milliseconds */
export const ANIMATION = {
  /** Fast transitions (hover states, etc.) */
  fast: 150,
  /** Normal transitions (sidebar, panels) */
  normal: 200,
  /** Slow transitions (page transitions) */
  slow: 300,
} as const;
