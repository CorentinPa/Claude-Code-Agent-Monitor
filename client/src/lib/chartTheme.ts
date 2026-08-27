/**
 * @file chartTheme.ts
 * @description Shared color constants for chart/visualization components. Two
 * kinds: `CHART_SERIES` is a fixed categorical palette used identically in
 * dark and light mode (already mid/high-saturation hues that read on either
 * background, so no per-theme split is needed). The `CHART_*` string
 * constants below it are `var(...)` references into the canvas-dependent
 * tokens defined in `index.css` (tooltip chrome, ring/donut track, heatmap
 * empty-cell) that DO have distinct dark/light values.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export const CHART_SERIES = [
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#f97316",
  "#6366f1",
] as const;

export const CHART_TOOLTIP_BG = "var(--chart-tooltip-bg)";
export const CHART_TOOLTIP_BORDER = "var(--chart-tooltip-border)";
export const CHART_TOOLTIP_TITLE = "var(--chart-tooltip-title)";
export const CHART_TOOLTIP_LABEL = "var(--chart-tooltip-label)";
export const CHART_TOOLTIP_VALUE = "var(--chart-tooltip-value)";
export const CHART_TOOLTIP_DESC = "var(--chart-tooltip-desc)";
export const CHART_TRACK = "var(--chart-track)";
export const CHART_HEATMAP_EMPTY = "var(--chart-heatmap-empty)";
export const CHART_OVERLAY_1 = "var(--chart-overlay-1)";
export const CHART_OVERLAY_2 = "var(--chart-overlay-2)";
