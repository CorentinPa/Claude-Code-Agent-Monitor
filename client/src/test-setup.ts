/**
 * @file test-setup.ts
 * @description Vitest global setup for the React client test suite. Pulls in
 * jest-dom matchers, initializes the real i18n bundle (same as production),
 * forces English before each test for deterministic assertions, and runs
 * Testing Library cleanup after every test to prevent DOM leakage between cases.
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

/** Pin locale to English — LanguageDetector may otherwise pick up zh/vi from the host OS. */
beforeEach(() => {
  i18n.changeLanguage("en");
});

/** Unmount rendered trees and reset the document between tests. */
afterEach(() => {
  cleanup();
});
