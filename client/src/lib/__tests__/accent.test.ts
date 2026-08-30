/**
 * @file accent.test.ts
 * @description Unit tests for the accent-token override module: defaults,
 * hex validation and normalization, persistence, corrupt-storage fallback,
 * subscriber notification, reset, and DOM application (channel triples for the
 * Tailwind-driven tokens, theme-dependent alpha for the muted fill).
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi } from "vitest";

const STORAGE_KEY = "ccam-accent";

async function freshModule(seed?: unknown) {
  vi.resetModules();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  if (seed !== undefined) localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return import("../accent");
}

describe("accent preferences", () => {
  it("defaults to no override on every token", async () => {
    const { getAccentPrefs, DEFAULT_ACCENT_PREFS } = await freshModule();
    expect(getAccentPrefs()).toEqual(DEFAULT_ACCENT_PREFS);
  });

  it("keeps a valid saved hex and drops an invalid one", async () => {
    const { getAccentPrefs } = await freshModule({
      accent: "#0EA5E9",
      accentHover: "not-a-color",
      accentMuted: "#abc",
    });
    const prefs = getAccentPrefs();
    expect(prefs.accent).toBe("#0ea5e9");
    expect(prefs.accentHover).toBeNull();
    expect(prefs.accentMuted).toBe("#aabbcc");
  });

  it("falls back to defaults on corrupt storage", async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { getAccentPrefs } = await import("../accent");
    expect(getAccentPrefs().accent).toBeNull();
  });

  it("persists updates and notifies subscribers", async () => {
    const { setAccentPrefs, subscribeToAccentPrefs, getAccentPrefs } = await freshModule();
    const seen = vi.fn();
    const unsubscribe = subscribeToAccentPrefs(seen);

    const next = setAccentPrefs({ accent: "#F43F5E" });
    expect(next.accent).toBe("#f43f5e");
    expect(getAccentPrefs().accent).toBe("#f43f5e");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string).accent).toBe("#f43f5e");

    unsubscribe();
    setAccentPrefs({ accent: "#10b981" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("patches one token without clearing the others", async () => {
    const { setAccentPrefs } = await freshModule();
    setAccentPrefs({ accent: "#8b5cf6", accentHover: "#a78bfa" });
    const next = setAccentPrefs({ accentMuted: "#8b5cf6" });
    expect(next).toEqual({
      accent: "#8b5cf6",
      accentHover: "#a78bfa",
      accentMuted: "#8b5cf6",
    });
  });

  it("clears every override on reset", async () => {
    const { setAccentPrefs, resetAccentPrefs, DEFAULT_ACCENT_PREFS } = await freshModule();
    setAccentPrefs({ accent: "#8b5cf6" });
    expect(resetAccentPrefs()).toEqual(DEFAULT_ACCENT_PREFS);
  });
});

describe("hex helpers", () => {
  it("accepts #rgb and #rrggbb in either case, rejects anything else", async () => {
    const { isValidHex } = await freshModule();
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("#AABBCC")).toBe(true);
    expect(isValidHex("abc")).toBe(false);
    expect(isValidHex("#abcd")).toBe(false);
    expect(isValidHex("rgb(1,2,3)")).toBe(false);
    expect(isValidHex(null)).toBe(false);
  });

  it("expands shorthand and converts to channels", async () => {
    const { normalizeHex, hexToRgb } = await freshModule();
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(hexToRgb("#6366f1")).toEqual([99, 102, 241]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });
});

describe("applyAccent", () => {
  it("writes channel triples for the Tailwind tokens and rgba for the muted fill", async () => {
    const { setAccentPrefs, applyAccent } = await freshModule();
    setAccentPrefs({ accent: "#6366f1", accentHover: "#818cf8", accentMuted: "#6366f1" });

    applyAccent("dark");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--accent")).toBe("99 102 241");
    expect(style.getPropertyValue("--accent-hover")).toBe("129 140 248");
    expect(style.getPropertyValue("--accent-muted")).toBe("rgba(99, 102, 241, 0.15)");
  });

  it("uses the light theme's muted alpha", async () => {
    const { setAccentPrefs, applyAccent } = await freshModule();
    setAccentPrefs({ accentMuted: "#6366f1" });
    applyAccent("light");
    expect(document.documentElement.style.getPropertyValue("--accent-muted")).toBe(
      "rgba(99, 102, 241, 0.12)"
    );
  });

  it("removes the inline property for a token with no override", async () => {
    const { setAccentPrefs, applyAccent } = await freshModule();
    setAccentPrefs({ accent: "#8b5cf6" });
    applyAccent("dark");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("139 92 246");

    setAccentPrefs({ accent: null });
    applyAccent("dark");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  });
});
