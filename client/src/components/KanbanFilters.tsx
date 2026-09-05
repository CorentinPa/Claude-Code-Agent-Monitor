/**
 * @file KanbanFilters.tsx
 * @description Filter bar for the Kanban board: which states to show, and how
 * far back to look.
 *
 * On a board the state IS the column, so the state control removes whole
 * columns instead of emptying them — an empty column holds width without
 * telling the reader anything, while a removed one gives that width back to
 * the columns still in play.
 *
 * The period defaults to "all time" here, unlike on the dashboard: the
 * completed / error / abandoned columns exist to hold history, and any shorter
 * default would blank them the moment the board opens.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useTranslation } from "react-i18next";
import { Filter, X } from "lucide-react";
import { Select } from "./Select";
import type { SelectOption } from "./Select";
import { MultiSelect } from "./MultiSelect";
import { TIME_RANGES, isTimeRange } from "../lib/timeRange";
import type { TimeRange } from "../lib/timeRange";

/** Kanban filter state, persisted across reloads. */
export interface KanbanFiltersValue {
  /** Column states to show; an EMPTY array means every state, not none. */
  statuses: string[];
  /** How far back a card's last activity may be. */
  range: TimeRange;
}

/** Filter state a fresh board starts from: everything, all time. */
export const DEFAULT_KANBAN_FILTERS: KanbanFiltersValue = { statuses: [], range: "all" };

const STORAGE_KEY = "kanban-board-filters";

/** Whether the value equals {@link DEFAULT_KANBAN_FILTERS}. */
export function isDefaultKanbanFilters(value: KanbanFiltersValue): boolean {
  return value.statuses.length === 0 && value.range === DEFAULT_KANBAN_FILTERS.range;
}

/**
 * Reads persisted filters, dropping anything it cannot vouch for so a key
 * written by an older build cannot wedge the board.
 */
export function loadKanbanFilters(): KanbanFiltersValue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KANBAN_FILTERS;
    const parsed = JSON.parse(raw) as Partial<KanbanFiltersValue>;
    return {
      statuses: Array.isArray(parsed.statuses)
        ? parsed.statuses.filter((s): s is string => typeof s === "string")
        : [],
      range: isTimeRange(parsed.range) ? parsed.range : DEFAULT_KANBAN_FILTERS.range,
    };
  } catch {
    return DEFAULT_KANBAN_FILTERS;
  }
}

/** Persists filters; storage failures are non-fatal. */
export function saveKanbanFilters(value: KanbanFiltersValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* non-fatal: filters simply won't survive a reload */
  }
}

/**
 * Keeps only the states that exist on the board currently shown. Switching
 * between the Agents and Sessions boards changes the column set, and a
 * selection left pointing at the other board's states would render an empty
 * board with no visible cause.
 *
 * @param statuses Persisted selection.
 * @param available States the active board actually has.
 * @returns The surviving selection; empty (meaning "all") when nothing survives.
 */
export function reconcileStatuses(statuses: string[], available: readonly string[]): string[] {
  const kept = statuses.filter((s) => available.includes(s));
  return kept.length === statuses.length ? statuses : kept;
}

/** Props for {@link KanbanFilters}. */
export interface KanbanFiltersProps {
  /** States of the board currently shown, already labelled for display. */
  stateOptions: SelectOption<string>[];
  /** Current filter state. */
  value: KanbanFiltersValue;
  /** Called with the next full filter state. */
  onChange: (next: KanbanFiltersValue) => void;
}

/**
 * Kanban filter bar.
 *
 * @param props See {@link KanbanFiltersProps}.
 */
export function KanbanFilters({ stateOptions, value, onChange }: KanbanFiltersProps) {
  const { t } = useTranslation("kanban");

  const rangeOptions: SelectOption<TimeRange>[] = TIME_RANGES.map((range) => ({
    value: range,
    label: t(`common:timeRange.${range}`),
  }));

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="kanban-filters">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 pr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>{t("filters.label")}</span>
      </div>

      <div className="w-[220px]">
        <MultiSelect
          label={t("filters.states.label")}
          options={stateOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={value.statuses}
          onChange={(statuses) => onChange({ ...value, statuses })}
          allLabel={t("filters.states.all")}
          selectedCountLabel={(count) => t("filters.states.selected", { count })}
          searchPlaceholder={t("filters.states.search")}
          emptyLabel={t("filters.states.empty")}
          clearLabel={t("filters.states.clear")}
        />
      </div>

      <div className="flex items-center gap-2 bg-surface-1 px-2 py-1 rounded-lg border border-border h-[38px] w-[210px]">
        <span className="text-[11px] text-gray-500 whitespace-nowrap">
          {t("common:timeRange.label")}
        </span>
        <div className="flex-1 min-w-0">
          <Select<TimeRange>
            value={value.range}
            onChange={(range) => onChange({ ...value, range })}
            options={rangeOptions}
          />
        </div>
      </div>

      {!isDefaultKanbanFilters(value) && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_KANBAN_FILTERS)}
          className="btn-ghost text-xs"
        >
          <X className="w-3 h-3" /> {t("filters.reset")}
        </button>
      )}
    </div>
  );
}
