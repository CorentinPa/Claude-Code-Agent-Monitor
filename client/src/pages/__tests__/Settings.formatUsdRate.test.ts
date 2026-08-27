/**
 * @file Settings.formatUsdRate.test.ts
 * @description Unit tests for `formatUsdRate`, the pricing-table rate formatter:
 * float-noise guarding and the EUR conversion applied when the currency display
 * preference is enabled.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, afterEach } from "vitest";
import { formatUsdRate } from "../Settings";
import { setCurrencyPrefs, DEFAULT_CURRENCY_PREFS } from "../../lib/currency";

describe("formatUsdRate", () => {
  afterEach(() => setCurrencyPrefs(DEFAULT_CURRENCY_PREFS));

  it("formats a positive rate as USD by default", () => {
    expect(formatUsdRate(3)).toBe("$3.00");
  });

  it("returns an em dash for a non-finite or non-positive rate", () => {
    expect(formatUsdRate(0)).toBe("—");
    expect(formatUsdRate(-1)).toBe("—");
    expect(formatUsdRate(NaN)).toBe("—");
  });

  it("converts to EUR when the currency preference is enabled", () => {
    setCurrencyPrefs({ enabled: true, eurPerUsd: 0.86 });
    expect(formatUsdRate(3)).toBe("€2.58");
  });
});
