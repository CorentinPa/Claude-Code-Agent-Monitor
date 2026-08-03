/**
 * @file SplashScreen.test.tsx
 * @description Verifies the first-run provider choice and provider-locked live
 * hook installation gate, including existing-hook warnings, installer output,
 * and the explicit continuation path after a successful install.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SplashScreen } from "../SplashScreen";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    settings: {
      info: vi.fn(),
      installHooks: vi.fn(),
    },
  },
}));

const info = vi.mocked(api.settings.info);
const installHooks = vi.mocked(api.settings.installHooks);

describe("SplashScreen", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
    info.mockResolvedValue({
      hooks: {
        installed: false,
        path: "~/.claude/settings.json",
        hooks: {},
        providers: {
          claude: {
            installed: false,
            path: "~/.claude/settings.json",
            hooks: {},
          },
          codex: {
            installed: true,
            has_dashboard_hooks: true,
            path: "~/.codex/hooks.json",
            hooks: {},
          },
        },
      },
    } as unknown as Awaited<ReturnType<typeof api.settings.info>>);
  });

  it("installs the selected provider hooks, shows output, then continues", async () => {
    const user = userEvent.setup();
    installHooks.mockResolvedValue({
      ok: true,
      results: {
        codex: {
          ok: true,
          output: ["Installed Codex lifecycle hooks."],
        },
      },
      hooks: {
        installed: true,
        providers: {
          codex: {
            installed: true,
            path: "~/.codex/hooks.json",
            hooks: {},
          },
        },
      },
    });

    render(<SplashScreen />);

    await user.click(screen.getByRole("radio", { name: /codex beta/i }));
    await user.click(screen.getByRole("button", { name: "Continue to dashboard" }));

    expect(await screen.findByRole("heading", { name: "Set up live monitoring" })).toBeVisible();
    expect(screen.getByText("Existing dashboard hooks detected")).toBeVisible();
    expect(
      screen.getByText(/Dashboard hooks already exist for a selected provider/i)
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Install hooks" }));

    expect(installHooks).toHaveBeenCalledWith(["codex"]);
    expect(await screen.findByText("Installed Codex lifecycle hooks.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue to dashboard" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue to dashboard" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("provider-onboarding-shown-v1")).toBe("1");
  });

  it("allows a user to explicitly continue when hooks were installed already", async () => {
    const user = userEvent.setup();
    render(<SplashScreen />);

    await user.click(screen.getByRole("button", { name: "Continue to dashboard" }));
    expect(await screen.findByRole("dialog", { name: "Set up live monitoring" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "I have already installed hooks" }));

    expect(installHooks).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("provider-onboarding-shown-v1")).toBe("1");
  });
});
