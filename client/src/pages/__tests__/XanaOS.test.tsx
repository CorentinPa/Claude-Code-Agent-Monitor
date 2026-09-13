/**
 * @file XanaOS.test.tsx
 * @description Unit tests for the Assistants page: discovered assistants
 * render as cards with their sub-agent count and runtime status, the
 * directory-missing empty state shows when the assistants directory does not
 * resolve, and the no-assistants empty state shows when it resolves but is
 * empty.
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

  it("renders one card per discovered assistant", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: "/vault/OS/assistantes",
      assistants_dir_source: "auto",
      assistants_dir_exists: true,
      totals: { discovered: 2 },
      assistants: [XANA, JEREMIE],
    });

    renderPage();

    expect(await screen.findByText("Xana")).toBeInTheDocument();
    expect(screen.getByText("Jeremie")).toBeInTheDocument();
    expect(screen.getByText("Orchestration")).toBeInTheDocument();
    expect(screen.getByText("1 sub-agent")).toBeInTheDocument();
    expect(screen.getByText("No description available.")).toBeInTheDocument();
    expect(screen.getByText("No distilled runtime yet")).toBeInTheDocument();
  });

  it("shows the directory-missing empty state when nothing resolves", async () => {
    vi.mocked(api.xanaos.assistants).mockResolvedValue({
      assistants_dir: null,
      assistants_dir_source: "none",
      assistants_dir_exists: false,
      totals: { discovered: 0 },
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
      totals: { discovered: 0 },
      assistants: [],
    });

    renderPage();

    expect(
      await screen.findByText("No assistants found in /vault/OS/assistantes.")
    ).toBeInTheDocument();
  });
});
