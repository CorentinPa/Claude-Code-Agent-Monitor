/**
 * @file timeRange.ts
 * @description The dashboard's shared time-window presets and their bounds.
 * Extracted from the Dashboard filter bar once the Kanban board became a second
 * consumer: the presets are a product vocabulary ("last 24 hours"), not a
 * property of one page's filter component.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

/** Time-window presets offered by every temporality control in the app. */
export type TimeRange = "1h" | "24h" | "7d" | "30d" | "all";

/** Every preset, in the order controls should list them. */
export const TIME_RANGES: readonly TimeRange[] = ["1h", "24h", "7d", "30d", "all"] as const;

const RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Whether an arbitrary string is a known preset; use before trusting storage. */
export function isTimeRange(value: unknown): value is TimeRange {
  return typeof value === "string" && (TIME_RANGES as readonly string[]).includes(value);
}

/**
 * Lower bound of a time window as epoch milliseconds.
 *
 * @param range Selected preset.
 * @param now   Injectable clock, for deterministic tests.
 * @returns The window start, or `null` for the unbounded "all" preset.
 */
export function rangeStartMs(range: TimeRange, now: number = Date.now()): number | null {
  if (range === "all") return null;
  return now - RANGE_MS[range];
}

/**
 * Lower bound of a time window as an ISO string, for the `from` query param
 * accepted by GET /api/events, /api/stats and /api/pricing/cost.
 *
 * @param range Selected preset.
 * @param now   Injectable clock, for deterministic tests.
 * @returns The ISO timestamp, or `undefined` when the window is unbounded (so
 *   the caller can drop the param entirely rather than send an empty value).
 */
export function rangeStartIso(range: TimeRange, now: number = Date.now()): string | undefined {
  const ms = rangeStartMs(range, now);
  return ms === null ? undefined : new Date(ms).toISOString();
}

/**
 * Whether a timestamp falls inside a window. Absent or unparseable timestamps
 * are kept: a row whose date we cannot read must not be silently dropped by a
 * filter the user did not aim at it.
 *
 * @param iso   Timestamp to test.
 * @param range Selected preset.
 * @param now   Injectable clock, for deterministic tests.
 */
export function isWithinRange(
  iso: string | null | undefined,
  range: TimeRange,
  now: number = Date.now()
): boolean {
  const start = rangeStartMs(range, now);
  if (start === null) return true;
  if (!iso) return true;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? true : ms >= start;
}
