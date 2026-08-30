/**
 * @file test-setup.ts
 * @description Vitest global setup for the React client test suite. Pulls in
 * jest-dom matchers, initializes the real i18n bundle (same as production),
 * forces English before each test, pins the default date/time formatting locale
 * so snapshots do not depend on the host machine's LANG, installs deterministic
 * local/session storage shims for Node runtimes without browser storage, and
 * runs Testing Library cleanup after every test to prevent DOM leakage between
 * cases.
 *
 * Imported from `vitest.config.ts` via `setupFiles`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import "./i18n/index";
import i18n from "i18next";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    key(index) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

// Node 26 exposes a process-level localStorage getter that returns undefined
// without --localstorage-file. Define deterministic jsdom-backed stores so the
// suite behaves the same on supported Node LTS and newer developer runtimes.
if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
}
if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
}

// Pin the default date/time formatting locale.
//
// Components that render a timestamp without an explicit locale — e.g.
// `lastUpdate.toLocaleTimeString()` on Analytics, Workflows and Claude Config —
// fall back to the locale ICU resolved from the host's LANG at process start.
// The committed snapshots carry en-US 12-hour times, so on any machine with a
// non-en_US locale those screens rendered 24-hour times and the snapshots failed
// for reasons unrelated to the change under test. Setting LANG in this file is
// too late (ICU is already initialized), so default the locale argument instead.
//
// Only an omitted/undefined locale is substituted: a call that names its locale
// (including everything routed through `getCurrentLocale()`) is left untouched,
// so this cannot mask a real i18n regression.
for (const method of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const) {
  const original = Date.prototype[method];
  Date.prototype[method] = function (
    this: Date,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    return original.call(this, locales ?? "en-US", options);
  };
}

/** Pin locale to English — LanguageDetector may otherwise pick up zh/vi from the host OS. */
beforeEach(() => {
  i18n.changeLanguage("en");
});

/** Unmount rendered trees and reset the document between tests. */
afterEach(() => {
  cleanup();
});
