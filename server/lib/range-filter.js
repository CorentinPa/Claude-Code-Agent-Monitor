/**
 * @file range-filter.js
 * @description Shared parsing and SQL predicates for the dashboard-wide time
 * window (`?from=`/`?to=`). The window composes with the machine-source and
 * provider scopes; none of the three replaces the others. Bounds are normalized
 * to the same ISO-8601 UTC shape the schema stores (`strftime('%Y-%m-%dT%H:%M:%fZ')`),
 * so plain string comparison is a correct chronological comparison.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

/** Normalize one bound to storage shape; null when absent or unparseable. */
function normalizeBound(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Parse `?from=`/`?to=`. An unparseable bound is dropped rather than rejected:
 * a malformed window must degrade to "no window", never to "no data".
 *
 * @param req Express request.
 * @returns `{ from, to }` with null members, or null when neither bound is usable.
 */
function parseRange(req) {
  const from = normalizeBound(req.query ? req.query.from : undefined);
  const to = normalizeBound(req.query ? req.query.to : undefined);
  return from || to ? { from, to } : null;
}

/**
 * SQL predicate bounding one timestamp column to the window.
 *
 * @param range Parsed window, or null.
 * @param col   Fully-qualified timestamp column (e.g. `"s.started_at"`).
 * @returns `{ clause, params }`; empty when there is no window.
 */
function rangeColumnClause(range, col) {
  if (!range) return { clause: "", params: [] };
  const clauses = [];
  const params = [];
  if (range.from) {
    clauses.push(`${col} >= ?`);
    params.push(range.from);
  }
  if (range.to) {
    clauses.push(`${col} <= ?`);
    params.push(range.to);
  }
  return { clause: clauses.join(" AND "), params };
}

module.exports = { parseRange, rangeColumnClause };
