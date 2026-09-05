/**
 * @file DashboardFilters.tsx
 * @description Compact filter bar for the Dashboard page. Exposes a time window
 * ("temporality") and a main-agent scope on the Monitor tab, and the
 * session-status scope on the Health tab. Only the controls that actually
 * narrow the current tab are rendered, so the bar never shows a dead knob:
 * /api/settings/info returns a live process snapshot with no per-agent or
 * per-timestamp dimension to filter on.
 *
 * Provider (Claude / Codex) is deliberately NOT offered here: `lib/dataScope.ts`
 * already owns that dimension application-wide and applies it server-side via
 * `?providers=` on every scoped endpoint. A second, page-local provider control
 * would filter a different set of panels by a different mechanism.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Filter, X } from "lucide-react";
import { Select } from "./Select";
import type { SelectOption } from "./Select";
import { isTimeRange, TIME_RANGES } from "../lib/timeRange";
import type { TimeRange } from "../lib/timeRange";

/** Session lifecycle scope forwarded to GET /api/workflows. */
export type DashboardSessionStatus = "all" | "active" | "completed";

/** The full Dashboard filter state, persisted across reloads. */
export interface DashboardFiltersValue {
  /** Time window applied to the activity feed and the active-agent list. */
  range: TimeRange;
  /** Id of a single main agent to scope to; "" means every agent. */
  agentId: string;
  /** Session lifecycle scope for the Health tab's workflow rollups. */
  sessionStatus: DashboardSessionStatus;
}

/** Filter state a fresh dashboard starts from. */
export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersValue = {
  range: "24h",
  agentId: "",
  sessionStatus: "all",
};

const STORAGE_KEY = "dashboard_filters";

/** Whether the value equals {@link DEFAULT_DASHBOARD_FILTERS} in every field. */
export function isDefaultFilters(value: DashboardFiltersValue): boolean {
  return (
    value.range === DEFAULT_DASHBOARD_FILTERS.range &&
    value.agentId === DEFAULT_DASHBOARD_FILTERS.agentId &&
    value.sessionStatus === DEFAULT_DASHBOARD_FILTERS.sessionStatus
  );
}

/**
 * Reads persisted filters, falling back to the defaults on absent, malformed,
 * or partially-shaped storage. Unknown enum members are dropped rather than
 * trusted, so a stale key written by an older build can't wedge the UI.
 *
 * @returns A fully-populated filter value.
 */
export function loadDashboardFilters(): DashboardFiltersValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_FILTERS;
    const parsed = JSON.parse(raw) as Partial<DashboardFiltersValue>;
    return {
      range: isTimeRange(parsed.range) ? parsed.range : DEFAULT_DASHBOARD_FILTERS.range,
      agentId: typeof parsed.agentId === "string" ? parsed.agentId : "",
      sessionStatus:
        parsed.sessionStatus === "active" || parsed.sessionStatus === "completed"
          ? parsed.sessionStatus
          : "all",
    };
  } catch {
    return DEFAULT_DASHBOARD_FILTERS;
  }
}

/**
 * Persists filters. Storage failures (private mode, quota) are swallowed: the
 * bar must keep working even when nothing can be saved.
 *
 * @param value The filter state to persist.
 */
export function saveDashboardFilters(value: DashboardFiltersValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* non-fatal: filters simply won't survive a reload */
  }
}

/** Props for {@link DashboardFilters}. */
export interface DashboardFiltersProps {
  /** Which dashboard tab is active; decides which controls are shown. */
  tab: "monitor" | "health";
  /** Current filter state. */
  value: DashboardFiltersValue;
  /** Called with the next full filter state. */
  onChange: (next: DashboardFiltersValue) => void;
  /** Selectable main agents, already labelled for display. */
  agentOptions: SelectOption<string>[];
}

function Field({ label, width, children }: { label: string; width: string; children: ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 bg-surface-1 px-2 py-1 rounded-lg border border-border h-[34px] ${width}`}
    >
      <span className="text-[11px] text-gray-500 whitespace-nowrap">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Dashboard filter bar.
 *
 * @param props See {@link DashboardFiltersProps}.
 */
export function DashboardFilters({ tab, value, onChange, agentOptions }: DashboardFiltersProps) {
  const { t } = useTranslation("dashboard");

  // The period vocabulary lives in `common` because the Kanban board speaks it
  // too; only this bar's own labels stay in the `dashboard` namespace.
  const rangeOptions: SelectOption<TimeRange>[] = TIME_RANGES.map((value) => ({
    value,
    label: t(`common:timeRange.${value}`),
  }));

  const statusOptions: SelectOption<DashboardSessionStatus>[] = [
    { value: "all", label: t("filters.sessionStatus.all") },
    { value: "active", label: t("filters.sessionStatus.active") },
    { value: "completed", label: t("filters.sessionStatus.completed") },
  ];

  const agents: SelectOption<string>[] = [
    { value: "", label: t("filters.agent.all") },
    ...agentOptions,
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-filters">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 pr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>{t("filters.label")}</span>
      </div>

      {tab === "monitor" ? (
        <>
          <Field label={t("common:timeRange.label")} width="w-[190px]">
            <Select<TimeRange>
              value={value.range}
              onChange={(range) => onChange({ ...value, range })}
              options={rangeOptions}
            />
          </Field>
          <Field label={t("filters.agent.label")} width="w-[240px]">
            <Select<string>
              value={value.agentId}
              onChange={(agentId) => onChange({ ...value, agentId })}
              options={agents}
            />
          </Field>
        </>
      ) : (
        <Field label={t("filters.sessionStatus.label")} width="w-[220px]">
          <Select<DashboardSessionStatus>
            value={value.sessionStatus}
            onChange={(sessionStatus) => onChange({ ...value, sessionStatus })}
            options={statusOptions}
          />
        </Field>
      )}

      {!isDefaultFilters(value) && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_DASHBOARD_FILTERS)}
          className="btn-ghost text-xs"
        >
          <X className="w-3 h-3" /> {t("filters.reset")}
        </button>
      )}

      <span className="text-[11px] text-gray-600 ml-auto max-w-[22rem] text-right">
        {tab === "monitor" ? t("filters.statsGlobalNote") : t("filters.healthSnapshotNote")}
      </span>
    </div>
  );
}
