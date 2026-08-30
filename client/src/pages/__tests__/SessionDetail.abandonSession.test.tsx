/**
 * @file SessionDetail.abandonSession.test.tsx
 * @description Tests for the manual "End Session" action on SessionDetail: the
 * button only appears for active/waiting sessions, requires a second confirming
 * click before calling the API, reloads the session on success, and surfaces an
 * inline error without crashing when the API call fails.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SessionDetail } from "../SessionDetail";
import type { Agent, Session, DashboardEvent } from "../../lib/types";

// ── Mock API ─────────────────────────────────────────────────────────────────

let mockSession: Session = {
  id: "sess-1",
  name: "Test Session",
  status: "active",
  cwd: "/test",
  model: "claude-opus-4-6",
  started_at: "2026-03-05T10:00:00.000Z",
  ended_at: null,
  metadata: null,
};
let mockAgents: Agent[] = [];
const abandonMock = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    sessions: {
      get: vi.fn(() =>
        Promise.resolve({
          session: mockSession,
          agents: mockAgents,
          events: [] as DashboardEvent[],
        })
      ),
      transcripts: vi.fn(() => Promise.resolve({ transcripts: [] })),
      abandon: (...args: unknown[]) => abandonMock(...args),
      stats: vi.fn(() =>
        Promise.resolve({
          session_id: "sess-1",
          total_events: 0,
          events_by_type: [],
          tools_used: [],
          error_count: 0,
          first_event_at: null,
          last_event_at: null,
          agents: { total: 0, main: 0, subagent: 0, compaction: 0, by_status: {} },
          subagent_types: [],
          tokens: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
          },
        })
      ),
    },
    pricing: {
      sessionCost: vi.fn(() => Promise.resolve({ total_cost: 0, breakdown: [] })),
    },
    events: {
      list: vi.fn(() =>
        Promise.resolve({ events: [] as DashboardEvent[], limit: 50, offset: 0, total: 0 })
      ),
      facets: vi.fn(() => Promise.resolve({ event_types: [], tool_names: [] })),
    },
  },
}));

vi.mock("../../lib/eventBus", () => ({
  eventBus: { subscribe: vi.fn(() => () => {}) },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/sessions/sess-1"]}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SessionDetail - End Session action", () => {
  beforeEach(() => {
    mockSession = {
      id: "sess-1",
      name: "Test Session",
      status: "active",
      cwd: "/test",
      model: "claude-opus-4-6",
      started_at: "2026-03-05T10:00:00.000Z",
      ended_at: null,
      metadata: null,
    };
    mockAgents = [];
    abandonMock.mockReset();
  });

  it("shows an End Session button for an active session", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /end session/i })).toBeInTheDocument();
  });

  it("hides the End Session button once the session has ended", async () => {
    mockSession = { ...mockSession, status: "completed", ended_at: "2026-03-05T11:00:00.000Z" };
    renderPage();
    // Wait for the page to finish loading before asserting an absence.
    expect(await screen.findByText("Test Session")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /end session/i })).not.toBeInTheDocument();
  });

  it("requires a second confirming click before calling the API", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: /end session/i });
    fireEvent.click(button);
    expect(abandonMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /confirm end session/i })).toBeInTheDocument();
  });

  it("calls the abandon API on the confirming click and reloads the session", async () => {
    abandonMock.mockResolvedValue({
      session: { ...mockSession, status: "abandoned" },
      agents_updated: 0,
    });
    renderPage();
    const button = await screen.findByRole("button", { name: /end session/i });
    fireEvent.click(button);
    const confirmButton = await screen.findByRole("button", { name: /confirm end session/i });

    // The reload after a successful call re-fetches from api.sessions.get,
    // which is still stubbed to the original (active) mockSession — update it
    // to reflect what the server would return so the reload is observable.
    mockSession = { ...mockSession, status: "abandoned", ended_at: "2026-03-05T11:00:00.000Z" };
    fireEvent.click(confirmButton);

    await waitFor(() => expect(abandonMock).toHaveBeenCalledWith("sess-1"));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /end session/i })).not.toBeInTheDocument()
    );
  });

  it("shows an inline error and keeps the button when the API call fails", async () => {
    abandonMock.mockRejectedValue(new Error("network down"));
    renderPage();
    const button = await screen.findByRole("button", { name: /end session/i });
    fireEvent.click(button);
    const confirmButton = await screen.findByRole("button", { name: /confirm end session/i });
    fireEvent.click(confirmButton);

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm end session/i })).toBeInTheDocument();
  });
});
