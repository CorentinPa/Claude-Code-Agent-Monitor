/**
 * @file DashboardFilters.test.tsx
 * @description Covers the Dashboard filter bar: time-window maths feeding the
 * `from` query param, persistence hardening against malformed storage, and the
 * per-tab control set (the Health tab must not offer knobs its endpoints cannot
 * honour).
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DashboardFilters,
  DEFAULT_DASHBOARD_FILTERS,
  isDefaultFilters,
  loadDashboardFilters,
  saveDashboardFilters,
} from "../DashboardFilters";
import { rangeStartIso, rangeStartMs } from "../../lib/timeRange";
import type { DashboardFiltersValue } from "../DashboardFilters";

const NOW = Date.parse("2026-03-19T12:00:00.000Z");

describe("rangeStartMs / rangeStartIso", () => {
  it("subtracts the preset window from the supplied clock", () => {
    expect(rangeStartMs("1h", NOW)).toBe(NOW - 3_600_000);
    expect(rangeStartMs("24h", NOW)).toBe(NOW - 86_400_000);
    expect(rangeStartMs("7d", NOW)).toBe(NOW - 7 * 86_400_000);
    expect(rangeStartMs("30d", NOW)).toBe(NOW - 30 * 86_400_000);
  });

  it("returns no bound for the unbounded preset so the param can be dropped", () => {
    expect(rangeStartMs("all", NOW)).toBeNull();
    expect(rangeStartIso("all", NOW)).toBeUndefined();
  });

  it("formats the bound as ISO for the /api/events `from` param", () => {
    expect(rangeStartIso("24h", NOW)).toBe("2026-03-18T12:00:00.000Z");
  });
});

describe("filter persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved value", () => {
    const value: DashboardFiltersValue = {
      range: "7d",
      agentId: "agent-1",
      sessionStatus: "completed",
    };
    saveDashboardFilters(value);
    expect(loadDashboardFilters()).toEqual(value);
  });

  it("falls back to defaults when storage is empty or unparseable", () => {
    expect(loadDashboardFilters()).toEqual(DEFAULT_DASHBOARD_FILTERS);
    localStorage.setItem("dashboard_filters", "{not json");
    expect(loadDashboardFilters()).toEqual(DEFAULT_DASHBOARD_FILTERS);
  });

  it("drops enum members it does not recognise instead of trusting them", () => {
    localStorage.setItem(
      "dashboard_filters",
      JSON.stringify({ range: "99y", sessionStatus: "zombie", agentId: 42 })
    );
    expect(loadDashboardFilters()).toEqual(DEFAULT_DASHBOARD_FILTERS);
  });
});

describe("isDefaultFilters", () => {
  it("is true only when every field is untouched", () => {
    expect(isDefaultFilters(DEFAULT_DASHBOARD_FILTERS)).toBe(true);
    expect(isDefaultFilters({ ...DEFAULT_DASHBOARD_FILTERS, range: "1h" })).toBe(false);
    expect(isDefaultFilters({ ...DEFAULT_DASHBOARD_FILTERS, agentId: "a" })).toBe(false);
  });
});

describe("DashboardFilters", () => {
  const agentOptions = [{ value: "agent-1", label: "Refactor run" }];

  it("offers period and agent on the Monitor tab, and never provider", () => {
    render(
      <DashboardFilters
        tab="monitor"
        value={DEFAULT_DASHBOARD_FILTERS}
        onChange={vi.fn()}
        agentOptions={agentOptions}
      />
    );

    expect(screen.getByText("Period")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
    // Provider belongs to the app-wide data scope, never to this bar.
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
  });

  it("offers only the session scope the Health endpoints can honour", () => {
    render(
      <DashboardFilters
        tab="health"
        value={DEFAULT_DASHBOARD_FILTERS}
        onChange={vi.fn()}
        agentOptions={agentOptions}
      />
    );

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.queryByText("Period")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
  });

  it("hides the reset control until a filter is actually set", () => {
    const { rerender } = render(
      <DashboardFilters
        tab="monitor"
        value={DEFAULT_DASHBOARD_FILTERS}
        onChange={vi.fn()}
        agentOptions={agentOptions}
      />
    );
    expect(screen.queryByText("Reset")).not.toBeInTheDocument();

    rerender(
      <DashboardFilters
        tab="monitor"
        value={{ ...DEFAULT_DASHBOARD_FILTERS, range: "1h" }}
        onChange={vi.fn()}
        agentOptions={agentOptions}
      />
    );
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });
});
