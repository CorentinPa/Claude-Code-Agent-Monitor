/**
 * @file XanaOS.test.tsx
 * @description Unit tests for the Assistants page: discovered assistants
 * render as cards with their sub-agent count, runtime status, and live/Remote
 * Control status; the directory-missing empty state shows when the
 * assistants directory does not resolve; the no-assistants empty state shows
 * when it resolves but is empty.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { XanaOS } from "../XanaOS";
import { api } from "../../lib/api";
import i18n from "../../i18n";
import type { XanaosAssistant } from "../../lib/types";

vi.mock("../../lib/api", () => ({
  api: {
    xanaos: {
      assistants: vi.fn(),
    },
  },
}));

const XANA: XanaosAssistant = {
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
};

const JEREMIE: XanaosAssistant = {
  first_name: "Jeremie",
  role: "Construction",
  dir_name: "Jeremie-IA-Construction",
  path: "/vault/OS/assistantes/Jeremie-IA-Construction",
  description: null,
  sub_agents: [],
  has_runtime: false,
  distilled_at: null,
  config_dir: null,
  deployed: false,
  up: false,
  busy: false,
  remote_control: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <XanaOS />
    </MemoryRouter>
  );
}

describe("XanaOS", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders one card per discovered assistant, with status and totals", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: "/vault/OS/assistantes",
      assistants_dir_source: "auto",
      assistants_dir_exists: true,
      config_root: "/home/corentin/.Xanaos",
      totals: { discovered: 2, up: 1, remote_control: 1 },
      assistants: [XANA, JEREMIE],
    });

    renderPage();

    expect(await screen.findByText("Xana")).toBeInTheDocument();
    expect(screen.getByText("Jeremie")).toBeInTheDocument();
    expect(screen.getByText("Orchestration")).toBeInTheDocument();
    expect(screen.getByText("1 sub-agent")).toBeInTheDocument();
    expect(screen.getByText("No description available.")).toBeInTheDocument();
    expect(screen.getByText("No distilled runtime yet")).toBeInTheDocument();
    expect(screen.getByText("Up")).toBeInTheDocument();
    expect(screen.getByText("Never deployed")).toBeInTheDocument();
    expect(screen.getByText("2 assistants discovered")).toBeInTheDocument();
    expect(screen.getByText("1 up")).toBeInTheDocument();
    expect(screen.getByText("1 Remote Control")).toBeInTheDocument();
  });

  it("shows a busy assistant as busy, not merely up", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: "/vault/OS/assistantes",
      assistants_dir_source: "auto",
      assistants_dir_exists: true,
      config_root: "/home/corentin/.Xanaos",
      totals: { discovered: 1, up: 1, remote_control: 0 },
      assistants: [{ ...XANA, busy: true, remote_control: false }],
    });

    renderPage();

    expect(await screen.findByText("Busy")).toBeInTheDocument();
  });

  it("shows a deployed-but-not-running assistant as offline", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: "/vault/OS/assistantes",
      assistants_dir_source: "auto",
      assistants_dir_exists: true,
      config_root: "/home/corentin/.Xanaos",
      totals: { discovered: 1, up: 0, remote_control: 0 },
      assistants: [{ ...XANA, up: false, busy: false, remote_control: false }],
    });

    renderPage();

    expect(await screen.findByText("Offline")).toBeInTheDocument();
  });

  it("shows the directory-missing empty state when nothing resolves", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: null,
      assistants_dir_source: "none",
      assistants_dir_exists: false,
      config_root: "/home/corentin/.Xanaos",
      totals: { discovered: 0, up: 0, remote_control: 0 },
      assistants: [],
    });

    renderPage();

    expect(await screen.findByText(/No assistants directory found/)).toBeInTheDocument();
  });

  it("shows the no-assistants empty state when the directory resolves but is empty", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: "/vault/OS/assistantes",
      assistants_dir_source: "auto",
      assistants_dir_exists: true,
      config_root: "/home/corentin/.Xanaos",
      totals: { discovered: 0, up: 0, remote_control: 0 },
      assistants: [],
    });

    renderPage();

    expect(
      await screen.findByText("No assistants found in /vault/OS/assistantes.")
    ).toBeInTheDocument();
  });
});
