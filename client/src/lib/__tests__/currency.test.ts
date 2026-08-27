/**
 * @file currency.test.ts
 * @description Unit tests for the USD/EUR display-currency preference module:
 * defaults, persistence, rate sanitization, subscriber notification, and the
 * conversion/symbol/code helpers consumed by the cost formatters.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi } from "vitest";

const STORAGE_KEY = "ccam-currency-prefs";

/** Re-imports the module so each test starts from a clean module-level state. */
async function freshModule(seed?: unknown) {
  vi.resetModules();
  localStorage.clear();
  if (seed !== undefined) localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return import("../currency");
}

describe("currency preferences", () => {
  it("defaults to USD (disabled) with a 0.86 EUR/USD rate", async () => {
    const { getCurrencyPrefs, DEFAULT_CURRENCY_PREFS } = await freshModule();
    expect(getCurrencyPrefs()).toEqual(DEFAULT_CURRENCY_PREFS);
    expect(getCurrencyPrefs().enabled).toBe(false);
    expect(getCurrencyPrefs().eurPerUsd).toBe(0.86);
  });

  it("merges a partial saved object over the defaults", async () => {
    const { getCurrencyPrefs } = await freshModule({ enabled: true });
    const prefs = getCurrencyPrefs();
    expect(prefs.enabled).toBe(true);
    expect(prefs.eurPerUsd).toBe(0.86);
  });

  it("falls back to defaults on corrupt storage", async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { getCurrencyPrefs } = await import("../currency");
    expect(getCurrencyPrefs().enabled).toBe(false);
  });

  it("rejects a non-positive or non-finite stored rate, keeping the default", async () => {
    const { getCurrencyPrefs: zero } = await freshModule({ eurPerUsd: 0 });
    expect(zero().eurPerUsd).toBe(0.86);

    const { getCurrencyPrefs: negative } = await freshModule({ eurPerUsd: -1 });
    expect(negative().eurPerUsd).toBe(0.86);

    const { getCurrencyPrefs: nan } = await freshModule({ eurPerUsd: NaN });
    expect(nan().eurPerUsd).toBe(0.86);
  });

  it("persists updates and rejects an invalid rate patch", async () => {
    const { setCurrencyPrefs } = await freshModule();
    const next = setCurrencyPrefs({ enabled: true, eurPerUsd: 0.92 });
    expect(next).toEqual({ enabled: true, eurPerUsd: 0.92 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string).eurPerUsd).toBe(0.92);

    const rejected = setCurrencyPrefs({ eurPerUsd: -5 });
    expect(rejected.eurPerUsd).toBe(0.86);
  });

  it("notifies subscribers on change and stops after unsubscribe", async () => {
    const { setCurrencyPrefs, subscribeToCurrencyPrefs } = await freshModule();
    const seen = vi.fn();
    const unsubscribe = subscribeToCurrencyPrefs(seen);
    setCurrencyPrefs({ enabled: true });
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    setCurrencyPrefs({ enabled: false });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("convertCost", () => {
  it("returns the USD amount unchanged when EUR display is disabled", async () => {
    const { convertCost } = await freshModule();
    expect(convertCost(50)).toBe(50);
  });

  it("applies the configured rate when EUR display is enabled", async () => {
    const { convertCost } = await freshModule({ enabled: true, eurPerUsd: 0.86 });
    expect(convertCost(50)).toBeCloseTo(43, 5);
  });
});

describe("currencySymbol / currencyCode", () => {
  it("reports $ / USD when disabled", async () => {
    const { currencySymbol, currencyCode } = await freshModule();
    expect(currencySymbol()).toBe("$");
    expect(currencyCode()).toBe("USD");
  });

  it("reports € / EUR when enabled", async () => {
    const { currencySymbol, currencyCode } = await freshModule({ enabled: true });
    expect(currencySymbol()).toBe("€");
    expect(currencyCode()).toBe("EUR");
  });
});

describe("composeCurrency", () => {
  it("prefixes the symbol with no separator for USD in en-US", async () => {
    const { composeCurrency } = await freshModule();
    expect(composeCurrency("43.00", "en-US")).toBe("$43.00");
  });

  it("prefixes the symbol with no separator for EUR in en-US (US convention for a foreign currency)", async () => {
    const { composeCurrency } = await freshModule({ enabled: true });
    expect(composeCurrency("43.00", "en-US")).toBe("$43.00".replace("$", "€"));
  });

  it("suffixes the symbol with a space for EUR in fr-FR (French convention)", async () => {
    const { composeCurrency } = await freshModule({ enabled: true });
    expect(composeCurrency("43,00", "fr-FR")).toBe("43,00 €");
  });

  it("suffixes the symbol with a space for USD in fr-FR too (French convention applies regardless of currency)", async () => {
    const { composeCurrency } = await freshModule();
    expect(composeCurrency("43,00", "fr-FR")).toBe("43,00 $");
  });
});
