/**
 * @file Settings.appearance.test.tsx
 * @description Render tests for the Appearance section's theme selector:
 * the three options render, clicking one persists the mode and updates
 * document.documentElement's data-theme attribute.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Settings } from "../Settings";
import {
  applyTheme,
  setThemePrefs,
  subscribeToThemePrefs,
  DEFAULT_THEME_PREFS,
} from "../../lib/theme";

// jsdom lacks IntersectionObserver, which Settings.tsx's scroll-spy effect uses
// unconditionally once loading clears. Same stub as screens.snapshot.test.tsx.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver =
  globalThis.IntersectionObserver || (ObserverStub as unknown as typeof IntersectionObserver);

// jsdom also lacks matchMedia. theme.ts's applyTheme() unconditionally attaches
// a prefers-color-scheme listener the first time it runs (see the Layout.tsx
// subscription simulated below). Same stub as screens.snapshot.test.tsx.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as MediaQueryList;
}

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const r = (value: unknown) => vi.fn().mockResolvedValue(value);
  const settingsInfo = {
    db: {
      path: "/tmp/test.db",
      size: 0,
      counts: {},
      pragmas: {
        journal_mode: "wal",
        synchronous: 1,
        auto_vacuum: 0,
        encoding: "UTF-8",
        foreign_keys: 1,
        busy_timeout: 5000,
      },
      load_stats: { m5: 0, m15: 0, h1: 0 },
    },
    hooks: { installed: true, path: "/tmp/settings.json", hooks: {} },
    server: {
      uptime: 0,
      node_version: "v22.0.0",
      platform: "linux",
      ws_connections: 0,
      memory: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0 },
      cpu_load: [0, 0, 0],
      arch: "x64",
      total_mem: 0,
      free_mem: 0,
      cpus: 1,
    },
    transcript_cache: { size: 0, maxSize: 100, hits: 0, misses: 0, keys: [] },
  };
  return {
    ...actual,
    api: {
      ...(actual.api as Record<string, unknown>),
      pricing: {
        list: r({ pricing: [] }),
        listGpt: r({ pricing: [] }),
        totalCost: r({ total_cost: 0 }),
      },
      settings: {
        info: r(settingsInfo),
        claudeHome: { get: r({ claude_home: "/home/test/.claude" }) },
        codexHome: { get: r({ codex_home: "/home/test/.codex" }) },
        exportData: () => "/api/settings/export",
      },
    },
  };
});

describe("Settings Appearance section", () => {
  // Applying data-theme on a prefs change is Layout.tsx's job (the app-root
  // wiring from Task 5: `applyTheme(); return subscribeToThemePrefs(applyTheme);`),
  // not Settings.tsx's. These tests render <Settings> standalone, without
  // <Layout>, so reproduce that one subscription here to exercise the real
  // end-to-end effect of clicking an option.
  let unsubscribeTheme: () => void;

  beforeEach(() => {
    unsubscribeTheme = subscribeToThemePrefs(applyTheme);
  });

  afterEach(() => {
    unsubscribeTheme();
    setThemePrefs(DEFAULT_THEME_PREFS);
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders all three theme options with the current mode selected", async () => {
    setThemePrefs({ mode: "light" });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>
    );

    const light = await screen.findByRole("radio", { name: "Light" });
    expect(light).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
  });

  it("persists the mode and applies data-theme when a new option is clicked", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>
    );

    const light = await screen.findByRole("radio", { name: "Light" });
    fireEvent.click(light);

    expect(JSON.parse(localStorage.getItem("ccam-theme") as string).mode).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
