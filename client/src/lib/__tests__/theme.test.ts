/**
 * @file theme.test.ts
 * @description Unit tests for the dark/light/system theme preference module:
 * defaults, persistence, corrupt-storage fallback, subscriber notification,
 * effective-theme resolution (including the "system" media-query path), and
 * DOM application.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi } from "vitest";

const STORAGE_KEY = "ccam-theme";

function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mql = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler);
    },
    removeEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
      const i = listeners.indexOf(handler);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql)
  );
  return {
    fireChange: (matches: boolean) => {
      mql.matches = matches;
      for (const l of listeners) l({ matches } as MediaQueryListEvent);
    },
  };
}

async function freshModule(seed?: unknown) {
  vi.resetModules();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  if (seed !== undefined) localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  mockMatchMedia(false);
  return import("../theme");
}

describe("theme preferences", () => {
  it("defaults to dark mode", async () => {
    mockMatchMedia(false);
    const { getThemePrefs, DEFAULT_THEME_PREFS } = await freshModule();
    expect(getThemePrefs()).toEqual(DEFAULT_THEME_PREFS);
    expect(getThemePrefs().mode).toBe("dark");
  });

  it("merges a partial saved object over the defaults", async () => {
    mockMatchMedia(false);
    const { getThemePrefs } = await freshModule({ mode: "light" });
    expect(getThemePrefs().mode).toBe("light");
  });

  it("falls back to defaults on corrupt storage", async () => {
    mockMatchMedia(false);
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { getThemePrefs } = await import("../theme");
    expect(getThemePrefs().mode).toBe("dark");
  });

  it("rejects an invalid mode, keeping the default", async () => {
    mockMatchMedia(false);
    const { getThemePrefs } = await freshModule({ mode: "purple" });
    expect(getThemePrefs().mode).toBe("dark");
  });

  it("persists updates and notifies subscribers", async () => {
    mockMatchMedia(false);
    const { setThemePrefs, subscribeToThemePrefs, getThemePrefs } = await freshModule();
    const seen = vi.fn();
    const unsubscribe = subscribeToThemePrefs(seen);
    const next = setThemePrefs({ mode: "light" });
    expect(next.mode).toBe("light");
    expect(getThemePrefs().mode).toBe("light");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string).mode).toBe("light");
    unsubscribe();
    setThemePrefs({ mode: "dark" });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("getEffectiveTheme", () => {
  it("resolves mode=dark to dark regardless of OS preference", async () => {
    mockMatchMedia(true);
    const { getEffectiveTheme, setThemePrefs } = await freshModule();
    setThemePrefs({ mode: "dark" });
    expect(getEffectiveTheme()).toBe("dark");
  });

  it("resolves mode=light to light regardless of OS preference", async () => {
    mockMatchMedia(true);
    const { getEffectiveTheme, setThemePrefs } = await freshModule();
    setThemePrefs({ mode: "light" });
    expect(getEffectiveTheme()).toBe("light");
  });

  it("resolves mode=system from the OS preference, both ways", async () => {
    const { getEffectiveTheme, setThemePrefs } = await freshModule();
    const media = mockMatchMedia(true);
    setThemePrefs({ mode: "system" });
    expect(getEffectiveTheme()).toBe("dark");
    media.fireChange(false);
    expect(getEffectiveTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets data-theme on <html> to the effective theme", async () => {
    mockMatchMedia(false);
    const { applyTheme, setThemePrefs } = await freshModule();
    setThemePrefs({ mode: "light" });
    applyTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    setThemePrefs({ mode: "dark" });
    applyTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("re-applies automatically when the OS preference changes while mode=system", async () => {
    const { applyTheme, setThemePrefs } = await freshModule();
    const media = mockMatchMedia(true);
    setThemePrefs({ mode: "system" });
    applyTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    media.fireChange(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("stops reacting to OS changes once mode is no longer system", async () => {
    const { applyTheme, setThemePrefs } = await freshModule();
    const media = mockMatchMedia(true);
    setThemePrefs({ mode: "system" });
    applyTheme();
    setThemePrefs({ mode: "dark" });
    applyTheme();
    media.fireChange(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
