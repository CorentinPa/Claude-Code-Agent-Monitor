/**
 * @file OrchestrationDAG.legend.test.ts
 * @description Unit tests asserting every orchestration-DAG legend swatch resolves
 * to a real translation in all shipped locales, so the legend never renders a raw
 * i18n key or falls back to English in a translated UI.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, afterEach } from "vitest";
import i18n from "i18next";
import "../../../i18n";
import { LEGEND_ITEMS } from "../OrchestrationDAG";

const LANGUAGES = ["en", "zh", "vi", "ko", "es", "fr"];

describe("OrchestrationDAG legend", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("carries no hardcoded label — every swatch is an i18n key", () => {
    for (const item of LEGEND_ITEMS) {
      expect(item, `legend item ${item.key}`).not.toHaveProperty("label");
      expect(item.key).toMatch(/^(common:)?[a-z][A-Za-z.]+$/);
    }
  });

  it("resolves every legend key in every shipped locale", async () => {
    for (const language of LANGUAGES) {
      await i18n.changeLanguage(language);
      for (const item of LEGEND_ITEMS) {
        // i18next echoes the key back on a miss, so key === value means the
        // translation is absent for this locale.
        const value = i18n.t(item.key, { ns: "workflows" });
        expect(value, `${language}:${item.key}`).not.toBe(item.key);
        expect(String(value).trim().length, `${language}:${item.key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it("renders the French legend in French", async () => {
    await i18n.changeLanguage("fr");
    const labels = LEGEND_ITEMS.map((item) => i18n.t(item.key, { ns: "workflows" }));
    expect(labels).toEqual([
      "Sessions",
      "Agent principal",
      "Types de sous-agents",
      "Compressions",
      "Terminé",
      "Erreur",
      "Abandonné",
    ]);
  });
});
