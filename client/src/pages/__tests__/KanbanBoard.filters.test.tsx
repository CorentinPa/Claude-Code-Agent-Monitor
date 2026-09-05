/**
 * @file KanbanBoard.filters.test.tsx
 * @description Covers the Kanban filter bar. On a board the state IS the column,
 * so the state filter must remove a column rather than empty it; and the date
 * window must default to "all", because the completed / abandoned columns are
 * history that any shorter default would silently blank.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api", () => {
  const r = (value: unknown) => vi.fn().mockResolvedValue(value);
  return {
    api: {
      agents: { list: vi.fn() },
      sessions: { list: r({ sessions: [], total: 0, limit: 10, offset: 0 }) },
    },
  };
});

vi.mock("../../lib/eventBus", () => ({
  eventBus: { subscribe: () => () => {}, onConnection: () => () => {}, connected: true },
}));

import { api } from "../../lib/api";
import { KanbanBoard } from "../KanbanBoard";

const NOW = new Date("2026-06-10T13:00:00.000Z");

function agent(id: string, status: string, updatedAt: string) {
  return {
    id,
    session_id: "sess-1",
    name: id,
    type: "main" as const,
    subagent_type: null,
    status,
    task: null,
    current_tool: null,
    started_at: updatedAt,
    ended_at: null,
    updated_at: updatedAt,
    parent_agent_id: null,
  };
}

async function renderBoard(agents: Array<Record<string, unknown>>) {
  vi.mocked(api.agents.list).mockImplementation((params?: { status?: string }) =>
    Promise.resolve({ agents: agents.filter((a) => a.status === params?.status) } as never)
  );
  render(
    <MemoryRouter initialEntries={["/kanban"]}>
      <KanbanBoard />
    </MemoryRouter>
  );
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("kanban-board-view", "agents");
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Kanban filters", () => {
  it("shows every column by default", async () => {
    await renderBoard([
      agent("a-working", "working", "2026-06-10T12:59:00.000Z"),
      agent("a-error", "error", "2026-06-10T12:59:00.000Z"),
    ]);
    expect(screen.getByRole("region", { name: "Working" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Error" })).toBeInTheDocument();
  });

  it("keeps history visible: the date window defaults to all time", async () => {
    await renderBoard([agent("a-old", "completed", "2020-01-01T00:00:00.000Z")]);
    expect(screen.getByText("a-old")).toBeInTheDocument();
  });

  it("removes the column itself when its state is deselected", async () => {
    await renderBoard([
      agent("a-working", "working", "2026-06-10T12:59:00.000Z"),
      agent("a-error", "error", "2026-06-10T12:59:00.000Z"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /All states/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Working" }));

    expect(screen.getByRole("region", { name: "Working" })).toBeInTheDocument();
    // The column is gone, not merely emptied: no region, no card.
    expect(screen.queryByRole("region", { name: "Error" })).not.toBeInTheDocument();
    expect(screen.queryByText("a-error")).not.toBeInTheDocument();
  });

  it("drops cards outside the selected window", async () => {
    await renderBoard([
      agent("a-recent", "working", "2026-06-10T12:30:00.000Z"),
      agent("a-stale", "working", "2026-06-01T12:00:00.000Z"),
    ]);

    expect(screen.getByText("a-stale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    fireEvent.click(screen.getByRole("option", { name: "Last 24 hours" }));

    expect(screen.getByText("a-recent")).toBeInTheDocument();
    expect(screen.queryByText("a-stale")).not.toBeInTheDocument();
  });

  it("counts the filtered cards in the subtitle, not the raw fetch", async () => {
    await renderBoard([
      agent("a-recent", "working", "2026-06-10T12:30:00.000Z"),
      agent("a-stale", "working", "2026-06-01T12:00:00.000Z"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    fireEvent.click(screen.getByRole("option", { name: "Last 24 hours" }));

    expect(screen.getByText("1 agent tracked")).toBeInTheDocument();
  });
});
