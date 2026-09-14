/**
 * @file XanaosAssistantDetail.test.tsx
 * @description Unit tests for the assistant "see more" detail modal: it
 * fetches on open, renders sub-agents, recent sessions (with a working
 * conversation link when known, an inert label otherwise), and recent
 * activity, closes on Escape and on the close button, and renders nothing
 * when no assistant is selected.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { XanaosAssistantDetail } from "../XanaosAssistantDetail";
import { api } from "../../lib/api";
import i18n from "../../i18n";
import type { XanaosAssistantDetail as AssistantDetail } from "../../lib/types";

vi.mock("../../lib/api", () => ({
  api: {
    xanaos: {
      assistant: vi.fn(),
    },
  },
}));

const DETAIL: AssistantDetail = {
  first_name: "Xana",
  role: "Orchestration",
  dir_name: "Xana-IA-Orchestration",
  path: "/vault/OS/assistantes/Xana-IA-Orchestration",
  description: "Oriente les demandes vers la bonne assistante.",
  sub_agents: ["routingGuardDesk"],
  has_runtime: true,
  distilled_at: "2026-09-11T20:05:09.739Z",
  config_dir: "/home/corentin/.Xanaos/Xana",
  deployed: true,
  up: true,
  busy: false,
  remote_control: true,
  recent_sessions: [
    {
      session_id: "sess-1",
      modified_at: "2026-09-14T05:00:00.000Z",
      name: "Mandat direct",
      status: "completed",
      started_at: "2026-09-14T04:00:00.000Z",
      ended_at: "2026-09-14T05:00:00.000Z",
      known: true,
    },
    {
      session_id: "sess-2",
      modified_at: "2026-09-13T05:00:00.000Z",
      name: null,
      status: null,
      started_at: null,
      ended_at: null,
      known: false,
    },
  ],
  recent_events: [
    {
      session_id: "sess-1",
      event_type: "PostToolUse",
      tool_name: "Read",
      summary: "Read a file",
      created_at: "2026-09-14T05:00:00.000Z",
    },
  ],
};

function renderModal(firstName: string | null, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <XanaosAssistantDetail firstName={firstName} onClose={onClose} />
    </MemoryRouter>
  );
}

describe("XanaosAssistantDetail", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.mocked(api.xanaos.assistant).mockResolvedValue(DETAIL);
  });

  it("renders nothing when no assistant is selected", () => {
    renderModal(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fetches and renders the assistant's detail", async () => {
    renderModal("Xana");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(api.xanaos.assistant).toHaveBeenCalledWith("Xana");
    expect(screen.getAllByText("Xana").length).toBeGreaterThan(0);
    expect(screen.getByText("routingGuardDesk")).toBeInTheDocument();
    expect(screen.getByText("Mandat direct")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View conversation" })).toHaveAttribute(
      "href",
      "/sessions/sess-1"
    );
    expect(screen.getByText("Not indexed")).toBeInTheDocument();
    expect(screen.getByText(/Read a file/)).toBeInTheDocument();
  });

  it("shows the empty states when there is no session or activity history", async () => {
    vi.mocked(api.xanaos.assistant).mockResolvedValue({
      ...DETAIL,
      recent_sessions: [],
      recent_events: [],
    });
    renderModal("Xana");

    expect(await screen.findByText("No sessions recorded.")).toBeInTheDocument();
    expect(screen.getByText("No activity recorded.")).toBeInTheDocument();
  });

  it("closes on Escape and on the close button", async () => {
    const onClose = vi.fn();
    renderModal("Xana", onClose);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
