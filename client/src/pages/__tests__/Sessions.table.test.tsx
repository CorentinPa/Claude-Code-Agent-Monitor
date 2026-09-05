/**
 * @file Sessions.table.test.tsx
 * @description Covers the Sessions table row itself, which the screen snapshot
 * does not reach: its default mock returns no sessions, so that snapshot only
 * captures the empty state. Asserts the three columns fed by data the API
 * already returned but the table used to drop — model, the latest human prompt,
 * and how long a blocked session has been waiting — plus the "unknown" model
 * sentinel rendering as an absent value.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api", () => {
  const r = (value: unknown) => vi.fn().mockResolvedValue(value);
  return {
    api: {
      sessions: {
        list: vi.fn(),
        facets: r({ cwds: [], sources: ["local"] }),
      },
      remoteSources: { list: r({ sources: [] }) },
      run: { list: r({ items: [] }) },
    },
  };
});

import { api } from "../../lib/api";
import { Sessions } from "../Sessions";

const NOW = new Date("2026-06-10T13:00:00.000Z");

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    name: "Refactor the ingest path",
    status: "active" as const,
    cwd: "/workspace/app",
    model: "claude-opus-5[1m]",
    started_at: "2026-06-10T12:00:00.000Z",
    ended_at: null,
    metadata: null,
    provider: "claude" as const,
    source: "local",
    agent_count: 3,
    last_activity: "2026-06-10T12:58:00.000Z",
    cost: 1.25,
    prompt_preview: "Première demande, plus ancienne\nDernière demande, la plus récente",
    awaiting_input_since: null,
    awaiting_reason: null,
    ...overrides,
  };
}

async function renderSessions(sessions: Array<Record<string, unknown>>) {
  vi.mocked(api.sessions.list).mockResolvedValue({
    sessions,
    total: sessions.length,
    limit: 10,
    offset: 0,
  } as never);

  render(
    <MemoryRouter initialEntries={["/sessions"]}>
      <Sessions />
    </MemoryRouter>
  );
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Sessions table", () => {
  it("shows the model that explains the cost, formatted like the rest of the app", async () => {
    await renderSessions([sessionRow()]);
    expect(screen.getByText("Claude Opus 5 (1M)")).toBeInTheDocument();
  });

  it("renders the Codex 'unknown' model sentinel as an absent value, not as a name", async () => {
    await renderSessions([sessionRow({ model: "unknown" })]);
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });

  it("shows the most recent human prompt, not the oldest", async () => {
    await renderSessions([sessionRow()]);
    expect(screen.getByText("Dernière demande, la plus récente")).toBeInTheDocument();
    expect(screen.queryByText("Première demande, plus ancienne")).not.toBeInTheDocument();
  });

  it("still identifies an unnamed session by its prompt", async () => {
    await renderSessions([sessionRow({ name: null })]);
    expect(screen.getByText("Dernière demande, la plus récente")).toBeInTheDocument();
  });

  it("shows how long a blocked session has been waiting, not just that it is", async () => {
    await renderSessions([
      sessionRow({
        awaiting_input_since: "2026-06-10T11:25:00.000Z",
        awaiting_reason: "notification",
      }),
    ]);
    // 13:00 − 11:25 = 1h 35m, via the same formatter the Duration column uses.
    expect(screen.getByText("1h 35m")).toBeInTheDocument();
  });

  it("shows no waiting duration for a session that is not blocked", async () => {
    await renderSessions([sessionRow()]);
    expect(screen.queryByText(/^\d+h \d+m$/)).not.toBeInTheDocument();
  });
});
