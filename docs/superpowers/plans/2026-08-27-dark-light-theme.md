# Dark/Light Theme (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dark/Light/System theme selector to Settings, backed by a CSS-custom-property token layer that recolors the entire app — including all 12 chart/visualization files — with no automated visual regressions and no accent-color picker (Phase 2).

**Architecture:** `client/tailwind.config.js`'s `gray`/`surface`/`border`/`accent` colors become `var(--token)` references resolved from `:root` (dark, unchanged values) and `[data-theme="light"]` (new values) blocks in `client/src/index.css`. A new `client/src/lib/theme.ts` singleton (mirroring `sound.ts`/`currency.ts`) owns the `dark | light | system` preference, resolves the effective theme, and sets `data-theme` on `<html>`. An inline script in `index.html` applies the theme before first paint. Chart colors split into two classes: **data-mark colors** (categorical series, per-tool/per-family accents) stay identical between themes since they're already mid/high-saturation hues that read on both backgrounds; **canvas-dependent colors** (tooltip chrome, ring tracks, heatmap empty cells, node gradient fills, pastel text-on-fill) get real light-mode values via new CSS variables.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v3.4 (JS config), Vite, Vitest + Testing Library, D3 (chart math only, no rendering layer), react-i18next.

**Spec:** `docs/superpowers/specs/2026-08-27-dark-light-theme-design.md`

## Global Constraints

- Default theme is **Dark**; existing users see zero visual change unless they open Settings → Appearance.
- `:root` (dark) values in `index.css` must be byte-identical to the corresponding literal that's being replaced — no incidental recoloring of dark mode.
- No accent-color picker, no Electron native-chrome theming, no re-theming of Tailwind's semantic status colors (`emerald`/`red`/`amber`/`violet`/`blue`/`cyan`), no automated visual/screenshot regression tooling — all confirmed out of scope in the spec.
- Every new/edited source file (`.ts`/`.tsx`/`.js`/`.css`) needs the repo's mandatory header: `@author Son Nguyen <hoangson091104@gmail.com>` (verify with `bash .claude/skills/file-headers/scripts/check-headers.sh`).
- Every command in this plan assumes the working directory is `E:\Second_Cerveau\app\client` unless stated otherwise (`cd ..` for repo-root commands like the header check).
- After every task: `npx tsc -b`, the task's own test command, and `npx prettier --check <touched files>` must all be clean before committing.

---

## File Structure

**New files:**

- `client/src/lib/theme.ts` — preference singleton + effective-theme resolution + DOM application.
- `client/src/lib/__tests__/theme.test.ts` — unit tests.
- `client/src/lib/chartTheme.ts` — shared chart color constants (data-mark palette + canvas-dependent CSS-var references reused across files).
- `client/src/pages/__tests__/chartColors.no-hardcoded-hex.test.ts` — regression test asserting the 12 migrated chart files no longer contain their old canvas-dependent hex literals.

**Modified files:**

- `client/tailwind.config.js` — `gray` replaced (not extended); `surface`/`border`/`accent` switched to `var()`.
- `client/src/index.css` — `:root` + `[data-theme="light"]` variable blocks (base tokens + chart/DAG tokens).
- `client/index.html` — anti-FOUC inline script.
- `client/src/App.tsx` (or wherever the app root mounts — confirmed in Task 5) — calls `applyTheme()` on mount, subscribes to changes.
- `client/src/pages/Settings.tsx` — new "Appearance" section.
- `client/src/i18n/locales/{en,zh,vi,ko,es,fr}/settings.json` — Appearance strings.
- 12 chart files (see Tasks 8-19).
- `README.md`, `ARCHITECTURE.md` — feature docs.

---

### Task 1: Base CSS token layer

**Files:**

- Modify: `client/tailwind.config.js`
- Modify: `client/src/index.css`
- Test: `client/src/pages/__tests__/screens.snapshot.test.tsx` (existing — must stay green, proves no structural regression)

**Interfaces:**

- Produces: CSS custom properties `--surface-0..5`, `--border`, `--border-light`, `--accent`, `--accent-hover`, `--accent-muted`, `--gray-100..900` — consumed by every Tailwind `bg-surface-*`/`text-gray-*`/`border-border`/`text-accent`/etc. class in the app, with zero JSX changes required.

- [ ] **Step 1: Add the CSS variable blocks to `client/src/index.css`**

Open `client/src/index.css` and add this block immediately after the `@tailwind` directives at the top of the file (before any existing rules):

```css
:root {
  --surface-0: #06060a;
  --surface-1: #0c0c14;
  --surface-2: #13131e;
  --surface-3: #1a1a28;
  --surface-4: #222233;
  --surface-5: #2a2a3d;
  --border: #2a2a3d;
  --border-light: #363650;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-muted: rgba(99, 102, 241, 0.15);
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
}

[data-theme="light"] {
  --surface-0: #ffffff;
  --surface-1: #f8f9fb;
  --surface-2: #f1f2f5;
  --surface-3: #e7e9ee;
  --surface-4: #dde0e6;
  --surface-5: #d1d5db;
  --border: #e2e4e9;
  --border-light: #cbced6;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-muted: rgba(99, 102, 241, 0.12);
  --gray-100: #111827;
  --gray-200: #1f2937;
  --gray-300: #374151;
  --gray-400: #4b5563;
  --gray-500: #6b7280;
  --gray-600: #9ca3af;
  --gray-700: #d1d5db;
  --gray-800: #e5e7eb;
  --gray-900: #f3f4f6;
}
```

- [ ] **Step 2: Point `tailwind.config.js` at the variables**

In `client/tailwind.config.js`, replace the `colors` block inside `theme.extend`:

```js
      colors: {
        gray: {
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)",
        },
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
          5: "var(--surface-5)",
        },
        border: {
          DEFAULT: "var(--border)",
          light: "var(--border-light)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          muted: "var(--accent-muted)",
        },
      },
```

Note the top-level `gray` key sits directly under `colors` (a sibling of `surface`/`border`/`accent`), **not** nested under a `extend.colors.gray` that merges with Tailwind's stock scale — this is what makes it a full replacement of the built-in gray palette rather than an addition to it.

- [ ] **Step 3: Verify the build and every existing test still pass**

```bash
npx tsc -b
npx vitest run
```

Expected: `tsc -b` prints nothing (clean). Vitest: the same pass/fail counts as before this task (388/391, with the 3 known-unrelated clock-format snapshot failures) — if any _new_ test fails, stop and investigate before continuing; a color-token change should never alter rendered markup.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev` (from `client/`), open the dashboard in a browser, confirm it looks pixel-identical to before this task (dark mode is unchanged — this task only adds an unused `[data-theme="light"]` block and indirects existing colors through variables that currently resolve to the same values).

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/tailwind.config.js client/src/index.css
git commit -m "feat(theme): introduce CSS custom-property token layer for base UI colors"
```

---

### Task 2: Chart & DAG canvas-dependent CSS tokens + `chartTheme.ts`

**Files:**

- Modify: `client/src/index.css`
- Create: `client/src/lib/chartTheme.ts`

**Interfaces:**

- Consumes: nothing (pure constants).
- Produces: `CHART_SERIES: readonly string[]` (8 colors, identical both themes), `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC`, `CHART_TRACK`, `CHART_HEATMAP_EMPTY`, `CHART_OVERLAY_1`, `CHART_OVERLAY_2` — all `string` CSS `var(...)` references — consumed by Tasks 8-19.

- [ ] **Step 1: Add chart and DAG CSS variables to `client/src/index.css`**

Append to the `:root` block from Task 1:

```css
/* Chart/visualization tokens */
--chart-tooltip-bg: #12121f;
--chart-tooltip-border: #2a2a4a;
--chart-tooltip-title: #e2e8f0;
--chart-tooltip-label: #64748b;
--chart-tooltip-value: #cbd5e1;
--chart-tooltip-desc: #94a3b8;
--chart-track: #2a2a3d;
--chart-heatmap-empty: #161625;
--chart-overlay-1: rgba(255, 255, 255, 0.04);
--chart-overlay-2: rgba(255, 255, 255, 0.06);
/* OrchestrationDAG node fills/text (canvas-dependent; see Task 17) */
--dag-session-fill-from: #312e81;
--dag-session-fill-to: #4338ca;
--dag-main-fill-from: #1e3a5f;
--dag-main-fill-to: #1d4ed8;
--dag-subagent-fill-from: #052e16;
--dag-subagent-fill-to: #166534;
--dag-nested-fill-from: #134e4a;
--dag-nested-fill-to: #0f766e;
--dag-outcome-fill-from: #1e1b4b;
--dag-outcome-fill-to: #4338ca;
--dag-completed-fill: #052e16;
--dag-error-fill: #1f0808;
--dag-abandoned-fill: #1c1a04;
--dag-session-text: #a5b4fc;
--dag-main-text: #93c5fd;
--dag-subagent-text: #86efac;
--dag-nested-text: #5eead4;
--dag-outcome-text: #c4b5fd;
--dag-completed-text: #4ade80;
--dag-error-text: #f87171;
--dag-abandoned-text: #facc15;
```

Append to the `[data-theme="light"]` block:

```css
--chart-tooltip-bg: #ffffff;
--chart-tooltip-border: #e2e4e9;
--chart-tooltip-title: #111827;
--chart-tooltip-label: #6b7280;
--chart-tooltip-value: #374151;
--chart-tooltip-desc: #4b5563;
--chart-track: #e5e7eb;
--chart-heatmap-empty: #f3f4f6;
--chart-overlay-1: rgba(0, 0, 0, 0.04);
--chart-overlay-2: rgba(0, 0, 0, 0.06);
--dag-session-fill-from: #e0e7ff;
--dag-session-fill-to: #c7d2fe;
--dag-main-fill-from: #dbeafe;
--dag-main-fill-to: #bfdbfe;
--dag-subagent-fill-from: #dcfce7;
--dag-subagent-fill-to: #bbf7d0;
--dag-nested-fill-from: #ccfbf1;
--dag-nested-fill-to: #99f6e4;
--dag-outcome-fill-from: #e0e7ff;
--dag-outcome-fill-to: #c7d2fe;
--dag-completed-fill: #dcfce7;
--dag-error-fill: #fee2e2;
--dag-abandoned-fill: #fef9c3;
--dag-session-text: #4338ca;
--dag-main-text: #1d4ed8;
--dag-subagent-text: #16a34a;
--dag-nested-text: #0f766e;
--dag-outcome-text: #6d28d9;
--dag-completed-text: #15803d;
--dag-error-text: #b91c1c;
--dag-abandoned-text: #a16207;
```

- [ ] **Step 2: Create `client/src/lib/chartTheme.ts`**

```typescript
/**
 * @file chartTheme.ts
 * @description Shared color constants for chart/visualization components. Two
 * kinds: `CHART_SERIES` is a fixed categorical palette used identically in
 * dark and light mode (already mid/high-saturation hues that read on either
 * background, so no per-theme split is needed). The `CHART_*` string
 * constants below it are `var(...)` references into the canvas-dependent
 * tokens defined in `index.css` (tooltip chrome, ring/donut track, heatmap
 * empty-cell) that DO have distinct dark/light values.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

export const CHART_SERIES = [
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#f97316",
  "#6366f1",
] as const;

export const CHART_TOOLTIP_BG = "var(--chart-tooltip-bg)";
export const CHART_TOOLTIP_BORDER = "var(--chart-tooltip-border)";
export const CHART_TOOLTIP_TITLE = "var(--chart-tooltip-title)";
export const CHART_TOOLTIP_LABEL = "var(--chart-tooltip-label)";
export const CHART_TOOLTIP_VALUE = "var(--chart-tooltip-value)";
export const CHART_TOOLTIP_DESC = "var(--chart-tooltip-desc)";
export const CHART_TRACK = "var(--chart-track)";
export const CHART_HEATMAP_EMPTY = "var(--chart-heatmap-empty)";
export const CHART_OVERLAY_1 = "var(--chart-overlay-1)";
export const CHART_OVERLAY_2 = "var(--chart-overlay-2)";
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b
cd .. && bash .claude/skills/file-headers/scripts/check-headers.sh && cd client
```

Expected: both clean (the header script confirms `chartTheme.ts` carries the mandatory `@author` line).

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/index.css client/src/lib/chartTheme.ts
git commit -m "feat(theme): add chart/DAG canvas-dependent CSS tokens and chartTheme.ts"
```

---

### Task 3: `theme.ts` preference module

**Files:**

- Create: `client/src/lib/theme.ts`
- Create: `client/src/lib/__tests__/theme.test.ts`

**Interfaces:**

- Produces: `ThemeMode = "dark" | "light" | "system"`, `ThemePrefs = { mode: ThemeMode }`, `DEFAULT_THEME_PREFS: ThemePrefs`, `getThemePrefs(): ThemePrefs`, `setThemePrefs(patch: Partial<ThemePrefs>): ThemePrefs`, `subscribeToThemePrefs(handler: () => void): () => void`, `getEffectiveTheme(): "dark" | "light"`, `applyTheme(): void` — consumed by Task 5 (app root) and Task 7 (Settings UI).

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/theme.test.ts`:

```typescript
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
    const media = mockMatchMedia(true);
    const { getEffectiveTheme, setThemePrefs } = await freshModule();
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
    const media = mockMatchMedia(true);
    const { applyTheme, setThemePrefs } = await freshModule();
    setThemePrefs({ mode: "system" });
    applyTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    media.fireChange(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("stops reacting to OS changes once mode is no longer system", async () => {
    const media = mockMatchMedia(true);
    const { applyTheme, setThemePrefs } = await freshModule();
    setThemePrefs({ mode: "system" });
    applyTheme();
    setThemePrefs({ mode: "dark" });
    applyTheme();
    media.fireChange(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/theme.test.ts
```

Expected: FAIL — `Failed to resolve import "../theme"` (the module doesn't exist yet).

- [ ] **Step 3: Implement `client/src/lib/theme.ts`**

```typescript
/**
 * @file theme.ts
 * @description Owns the user's dark/light/system theme preference. "system"
 * follows the OS via `prefers-color-scheme` and stays live-reactive to OS
 * changes while selected. Persists to `localStorage` (dark by default,
 * matching today's unconditional dark styling) and follows the same
 * singleton + `CustomEvent` pattern as {@link ./sound.ts} and
 * {@link ./currency.ts}. Applying a theme means setting `data-theme` on
 * `<html>` — every other color in the app follows via the CSS custom
 * properties defined in `index.css`.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const THEME_KEY = "ccam-theme";
const PREFS_EVENT = "theme:prefs";
const VALID_MODES = ["dark", "light", "system"] as const;

export type ThemeMode = (typeof VALID_MODES)[number];

export interface ThemePrefs {
  mode: ThemeMode;
}

export const DEFAULT_THEME_PREFS: ThemePrefs = { mode: "dark" };

let cached: ThemePrefs | null = null;
let systemListenerAttached = false;

function isValidMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (VALID_MODES as readonly string[]).includes(value);
}

export function getThemePrefs(): ThemePrefs {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ThemePrefs>) : {};
    cached = { mode: isValidMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_PREFS.mode };
  } catch {
    cached = { ...DEFAULT_THEME_PREFS };
  }
  return cached;
}

export function setThemePrefs(patch: Partial<ThemePrefs>): ThemePrefs {
  const merged = { ...getThemePrefs(), ...patch };
  const next: ThemePrefs = {
    mode: isValidMode(merged.mode) ? merged.mode : DEFAULT_THEME_PREFS.mode,
  };
  cached = next;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures - preferences remain applied for this session.
  }
  try {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  } catch {
    // Non-DOM context: nothing to notify.
  }
  return next;
}

export function subscribeToThemePrefs(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(PREFS_EVENT, listener);
  return () => window.removeEventListener(PREFS_EVENT, listener);
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolves the current preference to a concrete "dark" | "light" theme. */
export function getEffectiveTheme(): "dark" | "light" {
  const { mode } = getThemePrefs();
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/**
 * Sets `data-theme` on `<html>` to the effective theme. Safe to call
 * repeatedly (e.g. after every `setThemePrefs`) - it's idempotent. Also
 * attaches (once) a `prefers-color-scheme` change listener that re-applies
 * whenever the OS preference flips while `mode === "system"`.
 */
export function applyTheme(): void {
  document.documentElement.setAttribute("data-theme", getEffectiveTheme());
  if (!systemListenerAttached) {
    systemListenerAttached = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getThemePrefs().mode === "system") applyTheme();
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/theme.test.ts
```

Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and header audit**

```bash
npx tsc -b
cd .. && bash .claude/skills/file-headers/scripts/check-headers.sh && cd client
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/lib/theme.ts client/src/lib/__tests__/theme.test.ts
git commit -m "feat(theme): add theme.ts preference module with dark/light/system resolution"
```

---

### Task 4: Anti-FOUC inline script

**Files:**

- Modify: `client/index.html`

**Interfaces:**

- Consumes: the `localStorage` key `ccam-theme` (same key `theme.ts` uses — kept in sync by inspection, not import, since this script runs before any bundle loads).
- Produces: `data-theme` set on `<html>` before first paint.

- [ ] **Step 1: Add the inline script**

Open `client/index.html`. Immediately after the opening `<head>` tag (before any `<link>`/`<meta>` that could trigger a render, and definitely before the app's `<script type="module">` entry), add:

```html
<script>
  (function () {
    try {
      var raw = localStorage.getItem("ccam-theme");
      var mode = raw ? JSON.parse(raw).mode : "dark";
      if (mode !== "dark" && mode !== "light" && mode !== "system") mode = "dark";
      var effective =
        mode === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : mode;
      document.documentElement.setAttribute("data-theme", effective);
    } catch (e) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  })();
</script>
```

This intentionally duplicates the tiny `mode` → effective-theme resolution from `theme.ts` rather than importing it, because it must run synchronously before the module graph loads. `theme.ts`'s own `applyTheme()` (wired in Task 5) re-runs the same resolution on mount and is idempotent, so any drift between the two is self-correcting within one React tick.

- [ ] **Step 2: Manual verification**

Run `npm run dev`. With `localStorage.ccam-theme` unset (fresh profile), confirm the page loads directly in dark mode with no flash. Then in the browser console run `localStorage.setItem("ccam-theme", JSON.stringify({mode:"light"}))` and reload — confirm the page loads directly in an unstyled-but-not-flashed state (light mode won't visually apply yet since Task 1/2's variables exist but nothing consumes `[data-theme="light"]` beyond what's already migrated — full light-mode correctness is verified at the end of Task 19). The check here is narrower: **no dark→light flash**, i.e. `document.documentElement.getAttribute("data-theme")` is already `"light"` by the time you can inspect it, not flipped moments after load.

- [ ] **Step 3: Commit**

```bash
cd ..
git add client/index.html
git commit -m "feat(theme): add anti-FOUC inline script to index.html"
```

---

### Task 5: Wire `theme.ts` into the app root

**Files:**

- Modify: `client/src/App.tsx` (confirm this is the actual root — if the app mounts theme-independent providers in a different top-level file, e.g. `main.tsx`, apply the wiring there instead; grep for where `<Sidebar>`/`<Outlet/>`/the router is composed to find it)
- Test: `client/src/pages/__tests__/screens.snapshot.test.tsx` (existing — must stay green)

**Interfaces:**

- Consumes: `applyTheme`, `subscribeToThemePrefs` from `../lib/theme`.

- [ ] **Step 1: Locate the app root**

```bash
grep -n "function App" src/App.tsx
```

Confirm `App.tsx` is a function component that mounts once per page load (not per-route). If the codebase instead mounts global singletons like `UpdateNotifier`/`Tabby` in a `Layout.tsx` (check `client/src/components/Layout.tsx` if it exists), use that file instead — the requirement is simply "runs once, on every route."

- [ ] **Step 2: Add the theme effect**

In the chosen root component, add:

```typescript
import { useEffect } from "react";
import { applyTheme, subscribeToThemePrefs } from "./lib/theme"; // adjust relative path to match the file's location
```

Inside the component body, alongside any other top-level `useEffect`s:

```typescript
useEffect(() => {
  applyTheme();
  return subscribeToThemePrefs(applyTheme);
}, []);
```

- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run
```

Expected: clean typecheck; same pass/fail counts as Task 1's baseline (388/391, 3 known-unrelated failures).

- [ ] **Step 4: Manual verification**

`npm run dev`, open the dashboard, open DevTools console, run:

```js
window.__ccamTestTheme = true; // no-op marker, just confirming console access
```

then directly exercise the module: since there's no UI yet (Task 7 adds it), verify via the console:

```js
localStorage.setItem("ccam-theme", JSON.stringify({ mode: "light" }));
```

then reload — `document.documentElement.dataset.theme` should read `"light"` immediately (Task 4's script) and stay `"light"` after React mounts (this task's effect). Reset with `localStorage.removeItem("ccam-theme")` before continuing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/App.tsx
git commit -m "feat(theme): apply and subscribe to theme preference from the app root"
```

---

### Task 6: i18n strings for the Appearance section

**Files:**

- Modify: `client/src/i18n/locales/en/settings.json`
- Modify: `client/src/i18n/locales/zh/settings.json`
- Modify: `client/src/i18n/locales/vi/settings.json`
- Modify: `client/src/i18n/locales/ko/settings.json`
- Modify: `client/src/i18n/locales/es/settings.json`
- Modify: `client/src/i18n/locales/fr/settings.json`

**Interfaces:**

- Produces: i18next keys under a new `appearance` namespace object in each `settings.json`, consumed by Task 7's JSX via `t("appearance.*")`.

- [ ] **Step 1: Add the English keys (canonical source)**

In `client/src/i18n/locales/en/settings.json`, find the `display` key's closing `},` (the same block Task 1 of the earlier currency-toggle work extended) and add a new top-level sibling key right after it:

```json
  "appearance": {
    "title": "Appearance",
    "description": "Choose how the dashboard looks. \u201cSystem\u201d follows your OS setting and updates live if it changes.",
    "dark": "Dark",
    "light": "Light",
    "system": "System"
  },
```

- [ ] **Step 2: Add the translated equivalents**

zh (`client/src/i18n/locales/zh/settings.json`):

```json
  "appearance": {
    "title": "外观",
    "description": "选择仪表盘的外观。\u201c跟随系统\u201d会使用操作系统的设置，并在其更改时实时更新。",
    "dark": "深色",
    "light": "浅色",
    "system": "跟随系统"
  },
```

vi (`client/src/i18n/locales/vi/settings.json`):

```json
  "appearance": {
    "title": "Giao diện",
    "description": "Chọn giao diện hiển thị của bảng điều khiển. \u201cHệ thống\u201d sẽ theo cài đặt của hệ điều hành và cập nhật ngay khi thay đổi.",
    "dark": "Tối",
    "light": "Sáng",
    "system": "Hệ thống"
  },
```

ko (`client/src/i18n/locales/ko/settings.json`):

```json
  "appearance": {
    "title": "화면 모드",
    "description": "대시보드의 화면 모드를 선택하세요. \u201c시스템\u201d은 OS 설정을 따르며 변경 시 즉시 반영됩니다.",
    "dark": "다크",
    "light": "라이트",
    "system": "시스템"
  },
```

es (`client/src/i18n/locales/es/settings.json`):

```json
  "appearance": {
    "title": "Apariencia",
    "description": "Elige el aspecto del panel. \u201cSistema\u201d sigue el ajuste del sistema operativo y se actualiza en vivo si cambia.",
    "dark": "Oscuro",
    "light": "Claro",
    "system": "Sistema"
  },
```

fr (`client/src/i18n/locales/fr/settings.json`):

```json
  "appearance": {
    "title": "Apparence",
    "description": "Choisis l'apparence du tableau de bord. \u00abSyst\u00e8me\u00bb suit le r\u00e9glage de l'OS et se met \u00e0 jour en direct s'il change.",
    "dark": "Sombre",
    "light": "Clair",
    "system": "Syst\u00e8me"
  },
```

- [ ] **Step 2: Validate JSON**

```bash
for lang in en zh vi ko es fr; do node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/$lang/settings.json','utf8')); console.log('$lang OK')"; done
```

Expected: `OK` printed 6 times.

- [ ] **Step 3: Commit**

```bash
cd ..
git add client/src/i18n/locales/*/settings.json
git commit -m "feat(theme): add Appearance section i18n strings across all 6 locales"
```

---

### Task 7: Settings UI — Appearance section

**Files:**

- Modify: `client/src/pages/Settings.tsx`
- Test: `client/src/pages/__tests__/Settings.appearance.test.tsx` (new)

**Interfaces:**

- Consumes: `getThemePrefs`, `setThemePrefs`, `subscribeToThemePrefs`, `ThemeMode` from `../lib/theme`.

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/__tests__/Settings.appearance.test.tsx`:

```typescript
/**
 * @file Settings.appearance.test.tsx
 * @description Render tests for the Appearance section's theme selector:
 * the three options render, clicking one persists the mode and updates
 * document.documentElement's data-theme attribute.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Settings } from "../Settings";
import { setThemePrefs, DEFAULT_THEME_PREFS } from "../../lib/theme";

describe("Settings Appearance section", () => {
  afterEach(() => {
    setThemePrefs(DEFAULT_THEME_PREFS);
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders all three theme options with the current mode selected", () => {
    setThemePrefs({ mode: "light" });
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>
    );

    const light = screen.getByRole("radio", { name: "Light" });
    expect(light).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
  });

  it("persists the mode and applies data-theme when a new option is clicked", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(JSON.parse(localStorage.getItem("ccam-theme") as string).mode).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/pages/__tests__/Settings.appearance.test.tsx
```

Expected: FAIL — no `role="radio"` named "Light"/"Dark"/"System" found (the section doesn't exist yet).

- [ ] **Step 3: Implement the Settings UI**

Import theme primitives and the icons. Find the existing `import { fmt, fmtCost, getCurrencyPrefs, ... } from "../lib/currency";`-style import block near the top of `client/src/pages/Settings.tsx` and add:

```typescript
import { getThemePrefs, setThemePrefs, subscribeToThemePrefs, type ThemeMode } from "../lib/theme";
```

Add `Moon`, `Sun`, `Monitor` to the existing `lucide-react` import list.

Inside the `Settings` component function, alongside the other `useState`/`useCallback`/`useEffect` preference hooks (the same area holding `currencyPrefs`), add:

```typescript
const [themePrefs, setThemePrefsState] = useState(getThemePrefs);
const updateThemePrefs = useCallback((mode: ThemeMode) => {
  setThemePrefsState(setThemePrefs({ mode }));
}, []);
useEffect(() => subscribeToThemePrefs(() => setThemePrefsState(getThemePrefs())), []);
```

Add a new section right before the `data-display` section (`<section id="data-display" ...>`) found earlier in the file:

```tsx
<section id="appearance" className="scroll-mt-24">
  <div className="mb-4">
    <h3 className="flex items-center gap-2 text-sm font-medium text-gray-300">
      <Sun className="h-4 w-4 text-gray-500" />
      {t("appearance.title")}
    </h3>
    <p className="mt-0.5 text-xs text-gray-500">{t("appearance.description")}</p>
  </div>
  <div className="card p-4">
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      role="radiogroup"
      aria-label={t("appearance.title")}
    >
      {(
        [
          { mode: "dark", label: t("appearance.dark"), Icon: Moon },
          { mode: "light", label: t("appearance.light"), Icon: Sun },
          { mode: "system", label: t("appearance.system"), Icon: Monitor },
        ] as const
      ).map(({ mode, label, Icon }) => {
        const selected = themePrefs.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            onClick={() => updateThemePrefs(mode)}
            className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
              selected
                ? "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(129,140,248,0.14)]"
                : "border-border bg-surface-2 hover:border-gray-600"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <span className="text-sm font-medium text-gray-200">{label}</span>
            {selected && <Check className="ml-auto h-4 w-4 flex-none text-accent" />}
          </button>
        );
      })}
    </div>
  </div>
</section>
```

`Check` is already imported in `Settings.tsx` (used by the provider-scope selector). Also add `"appearance"` to `SETTINGS_SECTIONS` (the TOC array from Task 1 of the earlier currency work) as its **first** entry, matching the section's position at the top of the page:

```typescript
{ id: "appearance", labelKey: "appearance.title", Icon: Sun },
```

(This must be the array's first element to satisfy `Settings.sections.test.ts`'s ordering check against the page body.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/pages/__tests__/Settings.appearance.test.tsx src/pages/__tests__/Settings.sections.test.ts
```

Expected: both files PASS.

- [ ] **Step 5: Run the full suite, typecheck, prettier, headers**

```bash
npx tsc -b
npx vitest run
npx prettier --check src/pages/Settings.tsx src/pages/__tests__/Settings.appearance.test.tsx
cd .. && bash .claude/skills/file-headers/scripts/check-headers.sh && cd client
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/pages/Settings.tsx client/src/pages/__tests__/Settings.appearance.test.tsx
git commit -m "feat(theme): add Appearance section with Dark/Light/System selector to Settings"
```

---

### Task 8: Migrate `client/src/pages/Analytics.tsx`

**Files:**

- Modify: `client/src/pages/Analytics.tsx`

**Interfaces:**

- Consumes: `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TRACK`, `CHART_HEATMAP_EMPTY`, `CHART_OVERLAY_1`, `CHART_OVERLAY_2` from `../lib/chartTheme`; `getEffectiveTheme` from `../lib/theme` (heatmap ramp only).

This file has the one genuinely JS-computed color in the whole migration: `cellColor()`'s heatmap RGB interpolation. Everything else is a direct literal-to-`var()` swap.

| Line | Current                                                    | Change to                                                                                  |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 90   | `className="... bg-[#12121f] border border-[#2a2a4a] ..."` | ``className={`... bg-[${CHART_TOOLTIP_BG}] border border-[${CHART_TOOLTIP_BORDER}] ...`}`` |
| 515  | `stroke="#1e1e2e"` (donut track)                           | `stroke={CHART_TRACK}`                                                                     |
| 268  | `border: "1px solid rgba(255,255,255,0.04)"`               | `` border: `1px solid ${CHART_OVERLAY_1}` ``                                               |
| 290  | `border: "1px solid rgba(255,255,255,0.06)"`               | `` border: `1px solid ${CHART_OVERLAY_2}` ``                                               |

Lines 305, 344, 827-890, 1236-1238, 1440 (`color = "#6366f1"`, `"#10b981"`, the token/cost-breakdown series, the 6-color donut array, the sparkline color) are **data-mark colors** — leave unchanged.

- [ ] **Step 1: Import the chart tokens**

Add near the top of `Analytics.tsx`, alongside the existing `import { fmt, fmtCost, ... } from "../lib/format";`:

```typescript
import {
  CHART_TOOLTIP_BG,
  CHART_TOOLTIP_BORDER,
  CHART_TRACK,
  CHART_HEATMAP_EMPTY,
  CHART_OVERLAY_1,
  CHART_OVERLAY_2,
} from "../lib/chartTheme";
import { getEffectiveTheme } from "../lib/theme";
```

- [ ] **Step 2: Apply the table above**

Make each of the 4 substitutions listed. For line 90's `className`, since it currently uses a plain string (not a template literal), convert it to a template literal so `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER` can be interpolated — keep every other class in that string unchanged, only wrap `bg-[#12121f]` → `bg-[${CHART_TOOLTIP_BG}]` and `border-[#2a2a4a]` → `border-[${CHART_TOOLTIP_BORDER}]`.

- [ ] **Step 3: Make `cellColor` theme-aware**

Replace the function at lines 128-149:

```typescript
function cellColor(count: number, max: number) {
  const isLight = getEffectiveTheme() === "light";
  if (count === 0) return CHART_HEATMAP_EMPTY;
  // Log scale + RGB interpolation across a wide color ramp for maximum perceptual range
  const t = Math.log(count + 1) / Math.log(Math.max(max, 1) + 1);
  type RGB = [number, number, number];
  // Dark: near-black indigo -> deep indigo -> bright indigo -> lavender.
  // Light: near-white lavender -> light lavender -> bright indigo -> deep indigo
  // (same four indigo landmarks, direction reversed so low counts stay pale
  // on a light canvas instead of near-black).
  const stops: RGB[] = isLight
    ? [
        [238, 238, 252],
        [199, 210, 254],
        [99, 102, 241],
        [49, 46, 129],
      ]
    : [
        [22, 20, 60],
        [55, 48, 163],
        [99, 102, 241],
        [199, 210, 254],
      ];
  const scaled = t * (stops.length - 1);
  const lo = Math.min(Math.floor(scaled), stops.length - 2);
  const frac = scaled - lo;
  const [r1, g1, b1]: RGB = stops[lo] as RGB;
  const [r2, g2, b2]: RGB = stops[lo + 1] as RGB;
  const r = Math.round(r1 + (r2 - r1) * frac);
  const g = Math.round(g1 + (g2 - g1) * frac);
  const b = Math.round(b1 + (b2 - b1) * frac);
  return `rgb(${r},${g},${b})`;
}
```

- [ ] **Step 4: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/pages/Analytics.tsx
```

- [ ] **Step 5: Manual browser check**

`npm run dev`, open `/analytics`, toggle Settings → Appearance → Light, confirm: the activity heatmap's empty cells and low-count cells are pale (not near-black-on-white), the donut chart's track ring is a light gray (not a barely-visible dark ring), and hovering any chart shows a white tooltip with dark text (not a dark tooltip that's nearly invisible against the light page). Toggle back to Dark and confirm it looks exactly as it did before this task.

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/pages/Analytics.tsx
git commit -m "feat(theme): migrate Analytics.tsx chart colors to theme tokens"
```

---

### Task 9: Migrate `client/src/pages/Workflows.tsx`

**Files:**

- Modify: `client/src/pages/Workflows.tsx`

| Line | Current                                                    | Change to                                                                      |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 495  | `className="... bg-[#12121f] border border-[#2a2a4a] ..."` | `bg-[${CHART_TOOLTIP_BG}] border-[${CHART_TOOLTIP_BORDER}]` (template literal) |
| 498  | `className="... border-b border-[#2a2a4a]"`                | `border-b border-[${CHART_TOOLTIP_BORDER}]`                                    |

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../lib/chartTheme`.
- [ ] **Step 2:** Apply the table above (convert both plain-string `className`s to template literals).
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/pages/Workflows.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/pages/Workflows.tsx
git commit -m "feat(theme): migrate Workflows.tsx tooltip chrome to theme tokens"
```

---

### Task 10: Migrate `client/src/components/workflows/AgentCollaborationNetwork.tsx`

**Files:**

- Modify: `client/src/components/workflows/AgentCollaborationNetwork.tsx`

| Line(s)                                                    | Current               | Change to                                                       |
| ---------------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| 127 (in `lbl.style.color`)                                 | `"#64748b"`           | `CHART_TOOLTIP_LABEL`                                           |
| 130 (`val.style.cssText` color)                            | `"#cbd5e1"`           | `CHART_TOOLTIP_VALUE`                                           |
| 139-140 (`p.style.cssText` color)                          | `"#94a3b8"`           | `CHART_TOOLTIP_DESC`                                            |
| 140 (same line, border-top)                                | `"1px solid #2a2a4a"` | `` `1px solid ${CHART_TOOLTIP_BORDER}` ``                       |
| 175 (`title.style.cssText` color)                          | `"#e2e8f0"`           | `CHART_TOOLTIP_TITLE`                                           |
| 181 (`subtitle.style.cssText` color)                       | `"#64748b"`           | `CHART_TOOLTIP_LABEL`                                           |
| 308 (arrow marker `.attr("fill", ...)`)                    | `"#64748b"`           | `"var(--gray-500)"`                                             |
| 341 (link `.attr("stroke", ...)`)                          | `"#64748b"`           | `"var(--gray-500)"`                                             |
| 353 (edge label `.attr("fill", ...)`)                      | `"#94a3b8"`           | `CHART_TOOLTIP_DESC`                                            |
| 380 (node text `.attr("fill", ...)`)                       | `"#cbd5e1"`           | `CHART_TOOLTIP_VALUE`                                           |
| 419 (`title.style.cssText` color, edge tooltip)            | `"#e2e8f0"`           | `CHART_TOOLTIP_TITLE`                                           |
| 424-425 (`subtitle.style.cssText` color)                   | `"#64748b"`           | `CHART_TOOLTIP_LABEL`                                           |
| 610 (tooltip `className`, `bg-[#12121f] border-[#2a2a4a]`) | literal classes       | template literal with `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER` |
| 626-627 (legend arrow `stroke`/`fill`)                     | `"#64748b"`           | `"var(--gray-500)"`                                             |

`PALETTE` (lines 92-103) and `STROKE_PALETTE` (lines 105-116) are **data-mark colors** — leave unchanged.

- [ ] **Step 1:** Import `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row of the table above. For the `.style.cssText` template-literal assignments (e.g. line 130, 139-140, 175, etc.), interpolate the imported constant into the existing template literal (they're already backtick strings, so this is a direct substitution, not a syntax change). For the `.attr(...)` D3 calls (lines 308, 341, 353, 380), pass the constant directly as the second argument. For line 610's `className`, convert to a template literal.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/AgentCollaborationNetwork.tsx
```

- [ ] **Step 4: Manual browser check**

`/workflows`, Agent Collaboration Network panel, toggle Light: confirm arrows/links/edge-labels/node-labels are legible dark-gray-on-white (not the old light-gray-on-dark values, which would nearly disappear on a white canvas), and the hover tooltip is a white card with dark text.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/components/workflows/AgentCollaborationNetwork.tsx
git commit -m "feat(theme): migrate AgentCollaborationNetwork.tsx chrome colors to theme tokens"
```

---

### Task 11: Migrate `client/src/components/workflows/SubagentEffectiveness.tsx`

**Files:**

- Modify: `client/src/components/workflows/SubagentEffectiveness.tsx`

| Line                              | Current                         | Change to                                                       |
| --------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| 120 (ring track `stroke`)         | `"#2a2a3d"`                     | `CHART_TRACK`                                                   |
| 142 (percentage label `fill`)     | `"#e4e4ed"`                     | `CHART_TOOLTIP_TITLE`                                           |
| 204 (empty-bar `backgroundColor`) | `"#2a2a3d"`                     | `CHART_TRACK`                                                   |
| 285 (tooltip `className`)         | `bg-[#12121f] border-[#2a2a4a]` | template literal with `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER` |

`COLORS` (lines 66-75) is a **data-mark color** array — leave unchanged.

- [ ] **Step 1:** Import `CHART_TRACK`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply the table (line 120 and 142 are SVG `stroke`/`fill` attributes — pass the constant directly; line 204 is a `style={{ backgroundColor: ... }}` object — pass the constant directly; line 285's `className` string becomes a template literal, same pattern as prior tasks).
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/SubagentEffectiveness.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/workflows/SubagentEffectiveness.tsx
git commit -m "feat(theme): migrate SubagentEffectiveness.tsx ring/tooltip colors to theme tokens"
```

---

### Task 12: Migrate `client/src/components/workflows/ModelDelegationFlow.tsx`

**Files:**

- Modify: `client/src/components/workflows/ModelDelegationFlow.tsx`

| Line(s)                                   | Current                             | Change to                                                        |
| ----------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| 189, 199, 295, 307 (`.attr("fill", ...)`) | `"#6b7280"`                         | `"var(--gray-500)"`                                              |
| 223 (`.attr("stroke", ...)`)              | `"#2a2a3d"`                         | `"var(--surface-5)"`                                             |
| 443 (`background`)                        | `"#12121f"`                         | `CHART_TOOLTIP_BG`                                               |
| 444 (`border`)                            | `"1px solid #2a2a4a"`               | `` `1px solid ${CHART_TOOLTIP_BORDER}` ``                        |
| 445 (`color`)                             | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 493 (`title.style.cssText` color)         | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 508 (`lbl.style.color`)                   | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 511 (`val.style.cssText` color)           | `"#cbd5e1"`                         | `CHART_TOOLTIP_VALUE`                                            |
| 527 (`.cssText` color + border-top)       | `"#94a3b8"` / `"1px solid #2a2a4a"` | `CHART_TOOLTIP_DESC` / `` `1px solid ${CHART_TOOLTIP_BORDER}` `` |
| 532 (`hint.style.cssText` color)          | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |

`FAMILY_COLORS` (lines 89-111) is **data-mark** — leave unchanged.

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row of the table.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/ModelDelegationFlow.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/workflows/ModelDelegationFlow.tsx
git commit -m "feat(theme): migrate ModelDelegationFlow.tsx axis/tooltip colors to theme tokens"
```

---

### Task 13: Migrate `client/src/components/workflows/ConcurrencyTimeline.tsx`

**Files:**

- Modify: `client/src/components/workflows/ConcurrencyTimeline.tsx`

| Line                              | Current                             | Change to                                                        | Note                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 150                               | `"var(--color-gray-400)"`           | `"var(--gray-400)"`                                              | **Bug fix**: `--color-gray-400` was never defined anywhere in the codebase (confirmed by repo-wide grep) — this `var()` was silently falling back to the inherited text color. `--gray-400` is the real token Task 1 defines. |
| 182 (`title.style.cssText` color) | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 190 (`subtitle` color)            | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 199 (`lbl.style.color`)           | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 202 (`val.style.cssText` color)   | `"#cbd5e1"`                         | `CHART_TOOLTIP_VALUE`                                            |
| 215 (desc color + border-top)     | `"#94a3b8"` / `"1px solid #2a2a4a"` | `CHART_TOOLTIP_DESC` / `` `1px solid ${CHART_TOOLTIP_BORDER}` `` |
| 220 (`hint.style.cssText` color)  | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 355 (`background`)                | `"#12121f"`                         | `CHART_TOOLTIP_BG`                                               |
| 356 (`border`)                    | `"1px solid #2a2a4a"`               | `` `1px solid ${CHART_TOOLTIP_BORDER}` ``                        |
| 357 (`color`)                     | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |

`MAIN_COLOR` and `SUBAGENT_PALETTE` (lines 73-83) are **data-mark** — leave unchanged.

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row, including the line 150 bug fix.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/ConcurrencyTimeline.tsx
```

- [ ] **Step 4: Manual verification of the bug fix**

`/workflows`, Concurrency Timeline panel, find a bar with a low percentage (label rendered outside the bar, using the fixed branch). Confirm the count label is now visibly gray (matching other muted labels on the page) rather than whatever the previously-undefined variable happened to inherit.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/components/workflows/ConcurrencyTimeline.tsx
git commit -m "fix(theme): migrate ConcurrencyTimeline.tsx tooltip colors and fix undefined --color-gray-400 var"
```

---

### Task 14: Migrate `client/src/components/workflows/ErrorPropagationMap.tsx`

**Files:**

- Modify: `client/src/components/workflows/ErrorPropagationMap.tsx`

| Line | Current     | Change to           |
| ---- | ----------- | ------------------- |
| 184  | `"#9ca3af"` | `"var(--gray-400)"` |

`DEPTH_COLORS` (line 65) is **data-mark** — leave unchanged. The two SVG icon strokes (`"#10b981"` line 102, `"#f59e0b"` line 250) match the existing Tailwind `emerald`/`amber` semantic colors used immediately alongside them (`bg-emerald-500/10`, `bg-amber-500/10`) — per the spec's Non-Goal on semantic colors, leave these unchanged too.

- [ ] **Step 1:** Apply the one substitution (no new import needed — `var(--gray-400)` is a plain string, already a token from Task 1).
- [ ] **Step 2: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/ErrorPropagationMap.tsx
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add client/src/components/workflows/ErrorPropagationMap.tsx
git commit -m "feat(theme): migrate ErrorPropagationMap.tsx muted text color to theme token"
```

---

### Task 15: Migrate `client/src/components/workflows/SessionComplexityScatter.tsx`

**Files:**

- Modify: `client/src/components/workflows/SessionComplexityScatter.tsx`

| Line(s)                                      | Current                         | Change to                                                   |
| -------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| 125 (tooltip `className`)                    | `bg-[#12121f] border-[#2a2a4a]` | template literal, `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER` |
| 154 (`border-t border-[#2a2a4a]`)            | literal class                   | template literal, `CHART_TOOLTIP_BORDER`                    |
| 272 (`gridColor`)                            | `"#2a2a3d"`                     | `"var(--surface-5)"`                                        |
| 313-314 (`.domain`/`.tick line` stroke)      | `"#363650"`                     | `"var(--border-light)"`                                     |
| 315 (`.tick text` fill)                      | `"#6b7280"`                     | `"var(--gray-500)"`                                         |
| 323 (axis label `.attr("fill", ...)`)        | `"#6b7280"`                     | `"var(--gray-500)"`                                         |
| 331-332 (second axis `.domain`/`.tick line`) | `"#363650"`                     | `"var(--border-light)"`                                     |
| 333 (second axis `.tick text` fill)          | `"#6b7280"`                     | `"var(--gray-500)"`                                         |
| 342 (second axis label fill)                 | `"#6b7280"`                     | `"var(--gray-500)"`                                         |

`STATUS_COLOR` (lines 75-78, duplicate of `Analytics.tsx`'s) is **data-mark** — leave unchanged in both files.

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../../lib/chartTheme` (the axis colors reuse Task 1's base tokens directly as plain strings — no chart-specific import needed for those).
- [ ] **Step 2:** Apply every row of the table.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/SessionComplexityScatter.tsx
```

- [ ] **Step 4: Manual browser check**

`/workflows`, Session Complexity Scatter panel, toggle Light: confirm both axes (their tick lines, tick labels, and axis titles) are visible dark-on-light rather than invisible dark-gray-on-white (the old `#363650`/`#6b7280` values were tuned for a near-black canvas and would be very low-contrast against white without this token swap).

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/components/workflows/SessionComplexityScatter.tsx
git commit -m "feat(theme): migrate SessionComplexityScatter.tsx axis/tooltip colors to theme tokens"
```

---

### Task 16: Migrate `client/src/components/workflows/CompactionImpact.tsx`

**Files:**

- Modify: `client/src/components/workflows/CompactionImpact.tsx`

| Line                                 | Current                         | Change to                                                   |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------------- |
| 161 (`.attr("stroke", ...)`)         | `"#2a2a3d"`                     | `"var(--surface-5)"`                                        |
| 176, 195, 206 (`.attr("fill", ...)`) | `"#6b7280"`                     | `"var(--gray-500)"`                                         |
| 186 (`.attr("fill", ...)`)           | `"#9ca3af"`                     | `"var(--gray-400)"`                                         |
| 252 (bar reset `.attr("fill", ...)`) | `"#2a2a3d"`                     | `"var(--surface-5)"`                                        |
| 417 (tooltip `className`)            | `border-[#2a2a4a] bg-[#12121f]` | template literal, `CHART_TOOLTIP_BORDER`/`CHART_TOOLTIP_BG` |

Lines 132/136 (gradient stops `"#818cf8"`/`"#3730a3"`) and lines 239/264 (`"#a5b4fc"` highlighted-bar fill) are **data-mark** — leave unchanged.

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row of the table.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/CompactionImpact.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/workflows/CompactionImpact.tsx
git commit -m "feat(theme): migrate CompactionImpact.tsx grid/tooltip colors to theme tokens"
```

---

### Task 17: Migrate `client/src/components/workflows/OrchestrationDAG.tsx`

**Files:**

- Modify: `client/src/components/workflows/OrchestrationDAG.tsx`

This is the largest single file. Its colors split three ways:

**A. Canvas-dependent, get real light values (the `--dag-*` tokens from Task 2):**

| Current constant                                            | Replace with                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `OUTCOME_COLORS.completed.fill` (`"#052e16"`)               | `"var(--dag-completed-fill)"`                                                                                                |
| `OUTCOME_COLORS.completed.text` (`"#4ade80"`)               | `"var(--dag-completed-text)"`                                                                                                |
| `OUTCOME_COLORS.error.fill` (`"#1f0808"`)                   | `"var(--dag-error-fill)"`                                                                                                    |
| `OUTCOME_COLORS.error.text` (`"#f87171"`)                   | `"var(--dag-error-text)"`                                                                                                    |
| `OUTCOME_COLORS.abandoned.fill` (`"#1c1a04"`)               | `"var(--dag-abandoned-fill)"`                                                                                                |
| `OUTCOME_COLORS.abandoned.text` (`"#facc15"`)               | `"var(--dag-abandoned-text)"`                                                                                                |
| `KIND_GRADIENTS.session` stops (`"#312e81"` / `"#4338ca"`)  | `"var(--dag-session-fill-from)"` / `"var(--dag-session-fill-to)"`                                                            |
| `KIND_GRADIENTS.main` stops (`"#1e3a5f"` / `"#1d4ed8"`)     | `"var(--dag-main-fill-from)"` / `"var(--dag-main-fill-to)"`                                                                  |
| `KIND_GRADIENTS.subagent` stops (`"#052e16"` / `"#166534"`) | `"var(--dag-subagent-fill-from)"` / `"var(--dag-subagent-fill-to)"`                                                          |
| `KIND_GRADIENTS.nested` stops (`"#134e4a"` / `"#0f766e"`)   | `"var(--dag-nested-fill-from)"` / `"var(--dag-nested-fill-to)"`                                                              |
| `KIND_GRADIENTS.outcome` stops (`"#1e1b4b"` / `"#4338ca"`)  | `"var(--dag-outcome-fill-from)"` / `"var(--dag-outcome-fill-to)"`                                                            |
| `textColorForKind("session")` (`"#a5b4fc"`)                 | `"var(--dag-session-text)"`                                                                                                  |
| `textColorForKind("main")` (`"#93c5fd"`)                    | `"var(--dag-main-text)"`                                                                                                     |
| `textColorForKind("subagent")` (`"#86efac"`)                | `"var(--dag-subagent-text)"`                                                                                                 |
| `textColorForKind("nested")` (`"#5eead4"`)                  | `"var(--dag-nested-text)"`                                                                                                   |
| `textColorForKind("outcome")` (`"#c4b5fd"`)                 | `"var(--dag-outcome-text)"`                                                                                                  |
| `LEGEND_ITEMS[0]` "Sessions" `.color` (`"#312e81"`)         | `"var(--dag-session-fill-from)"`                                                                                             |
| `LEGEND_ITEMS[1]` "Main Agent" `.color` (`"#1e3a5f"`)       | `"var(--dag-main-fill-from)"`                                                                                                |
| `LEGEND_ITEMS[2]` "Subagent Types" `.color` (`"#052e16"`)   | `"var(--dag-subagent-fill-from)"`                                                                                            |
| `LEGEND_ITEMS[3]` "Compactions" `.color` (`"#134e4a"`)      | `"var(--dag-nested-fill-from)"`                                                                                              |
| `LEGEND_ITEMS[4]` "Completed" `.color` (`"#052e16"`)        | `"var(--dag-completed-fill)"`                                                                                                |
| `LEGEND_ITEMS[5]` "Error" `.color` (`"#1f0808"`)            | `"var(--dag-error-fill)"`                                                                                                    |
| `LEGEND_ITEMS[6]` "Abandoned" `.color` (`"#1c1a04"`)        | `"var(--dag-abandoned-fill)"`                                                                                                |
| line 850 gradient (`"#312e81, #4f46e5"`)                    | `` `linear-gradient(to right, var(--dag-session-fill-from), #4f46e5)` `` (keep the accent end-stop literal — it's data-mark) |

**B. Exact matches to existing base tokens — reuse, no new token:**

| Line                                            | Current     | Change to               |
| ----------------------------------------------- | ----------- | ----------------------- |
| 178 (`outcomeColorSet` default fallback `fill`) | `"#1a1a28"` | `"var(--surface-4)"`    |
| 178 (default fallback `stroke`)                 | `"#363650"` | `"var(--border-light)"` |
| 178 (default fallback `text`)                   | `"#9ca3af"` | `"var(--gray-400)"`     |
| 597 (`.attr("fill", ...)`)                      | `"#6b7280"` | `"var(--gray-500)"`     |
| 661 (zero-weight branch of the stroke ternary)  | `"#2a2a3d"` | `"var(--surface-5)"`    |

**C. Tooltip chrome (the by-now-familiar pattern):**

| Line                             | Current                             | Change to                                                        |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| 861 (`className`)                | `bg-[#12121f] border-[#2a2a4a]`     | template literal, `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER`      |
| 930 (`lbl.style.color`)          | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 933 (`val.style.cssText` color)  | `"#cbd5e1"`                         | `CHART_TOOLTIP_VALUE`                                            |
| 943 (desc color + border-top)    | `"#94a3b8"` / `"1px solid #2a2a4a"` | `CHART_TOOLTIP_DESC` / `` `1px solid ${CHART_TOOLTIP_BORDER}` `` |
| 948 (`hint.style.cssText` color) | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |

**Left unchanged (data-mark):** `borderColorForKind` (lines 1020-1033), `badgeBgForKind`'s `rgba(...,0.25)` returns (lines 1050-1066) and its `outcomeColorSet(status).stroke + "33"` composition (line 1052 — the base `.stroke` it reads is `OUTCOME_COLORS[status].stroke`, which was never in the fill/text tables above since `stroke` values like `"#16a34a"`/`"#dc2626"`/`"#ca8a04"` are vivid accent colors, data-mark, unchanged), lines 615's `"#1f1f30"` (a minor selection-highlight stroke close to but distinct from `--surface-4`; leave as its own literal — it's a subtle dark-mode-only affordance, not user-facing text/background, low risk to leave for this phase), lines 651/708/727's `"#6366f1"` (selected-node accent, data-mark), `LEGEND_ITEMS[*].border` (all data-mark accent hues, matching `OUTCOME_COLORS[*].stroke`/`borderColorForKind`).

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row of tables A, B, and C. Work top-to-bottom through the file so line numbers in later edits aren't thrown off by earlier ones — re-run the grep below after each block to confirm you haven't missed one:

```bash
grep -n '#[0-9a-fA-F]\{3,8\}\|rgba(' src/components/workflows/OrchestrationDAG.tsx
```

Cross-check the remaining hits against the "left unchanged" list above — every remaining hex/rgba literal after this task should be one of those, or a data-mark color from tables A/B/C's un-listed siblings (e.g. `OUTCOME_COLORS[*].stroke`).

- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/OrchestrationDAG.tsx
```

- [ ] **Step 4: Manual browser check**

`/workflows`, Orchestration DAG panel (this is the app's most visually complex chart — worth extra scrutiny), toggle Light: confirm every node type (session/main/subagent/nested/outcome, plus completed/error/abandoned outcome nodes) renders as a pale, same-hue-family tinted box with readably-dark text of the same hue, not a near-black box (illegible on white) or invisible near-white text. Confirm the legend swatches match their corresponding node colors. Toggle back to Dark and confirm pixel-identical to before this task.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/components/workflows/OrchestrationDAG.tsx
git commit -m "feat(theme): migrate OrchestrationDAG.tsx node/tooltip colors to theme tokens"
```

---

### Task 18: Migrate `client/src/components/workflows/ToolExecutionFlow.tsx`

**Files:**

- Modify: `client/src/components/workflows/ToolExecutionFlow.tsx`

| Line                                   | Current                             | Change to                                                        |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| 482 (`.style("fill", ...)`)            | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 489 (`.style("fill", ...)`)            | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 535 (`background`)                     | `"#12121f"`                         | `CHART_TOOLTIP_BG`                                               |
| 536 (`border`)                         | `"1px solid #2a2a4a"`               | `` `1px solid ${CHART_TOOLTIP_BORDER}` ``                        |
| 537 (`color`)                          | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 560 (`lbl.style.color`)                | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 563 (`val.style.cssText` color)        | `"#cbd5e1"`                         | `CHART_TOOLTIP_VALUE`                                            |
| 584, 610 (`title.style.cssText` color) | `"#e2e8f0"`                         | `CHART_TOOLTIP_TITLE`                                            |
| 590, 621 (subtitle color)              | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |
| 599, 639 (desc color + border-top)     | `"#94a3b8"` / `"1px solid #2a2a4a"` | `CHART_TOOLTIP_DESC` / `` `1px solid ${CHART_TOOLTIP_BORDER}` `` |
| 612 (`tspanArrow.style.color`)         | `"#64748b"`                         | `CHART_TOOLTIP_LABEL`                                            |

`TOOL_COLORS` (lines 71-78) and `COLOR_DEFAULT`/`LEGEND_ITEMS` colors (lines 80, 647-654) are **data-mark** — leave unchanged.

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TOOLTIP_TITLE`, `CHART_TOOLTIP_LABEL`, `CHART_TOOLTIP_VALUE`, `CHART_TOOLTIP_DESC` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply every row of the table.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/ToolExecutionFlow.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/workflows/ToolExecutionFlow.tsx
git commit -m "feat(theme): migrate ToolExecutionFlow.tsx donut/tooltip colors to theme tokens"
```

---

### Task 19: Migrate `client/src/components/workflows/WorkflowStats.tsx`

**Files:**

- Modify: `client/src/components/workflows/WorkflowStats.tsx`

| Line                              | Current                         | Change to                                                   |
| --------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| 240 (`className`)                 | `bg-[#12121f] border-[#2a2a4a]` | template literal, `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER` |
| 243 (`border-b border-[#2a2a4a]`) | literal class                   | template literal, `CHART_TOOLTIP_BORDER`                    |

- [ ] **Step 1:** Import `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER` from `../../lib/chartTheme`.
- [ ] **Step 2:** Apply both rows.
- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
npx prettier --check src/components/workflows/WorkflowStats.tsx
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/workflows/WorkflowStats.tsx
git commit -m "feat(theme): migrate WorkflowStats.tsx tooltip chrome to theme tokens"
```

**Note:** `client/src/components/workflows/WorkflowPatterns.tsx` was confirmed during planning to contain zero hex/rgba color literals (Tailwind utility classes only) — it needs no migration task.

---

### Task 20: Regression test — no leftover hardcoded canvas-dependent hex

**Files:**

- Create: `client/src/pages/__tests__/chartColors.no-hardcoded-hex.test.ts`

**Interfaces:**

- Consumes: raw source of the 12 migrated files via Vite's `?raw` import (same technique as the existing `Settings.sections.test.ts`).

- [ ] **Step 1: Write the test**

```typescript
/**
 * @file chartColors.no-hardcoded-hex.test.ts
 * @description Guards the theme migration (Tasks 8-19): asserts the 12
 * chart/visualization files no longer contain the specific canvas-dependent
 * hex/rgba literals that were replaced with CSS-variable references. Reads
 * raw source via Vite's `?raw` import (same technique as
 * Settings.sections.test.ts) rather than importing the modules, since these
 * are React components with heavy runtime dependencies unsuited to a plain
 * unit test - this is a structural source check, not a rendering test
 * (deliberate: there is no automated visual-regression tooling in this repo,
 * per the design spec).
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect } from "vitest";
import analytics from "../Analytics.tsx?raw";
import workflows from "../Workflows.tsx?raw";
import agentCollaborationNetwork from "../../components/workflows/AgentCollaborationNetwork.tsx?raw";
import subagentEffectiveness from "../../components/workflows/SubagentEffectiveness.tsx?raw";
import modelDelegationFlow from "../../components/workflows/ModelDelegationFlow.tsx?raw";
import concurrencyTimeline from "../../components/workflows/ConcurrencyTimeline.tsx?raw";
import errorPropagationMap from "../../components/workflows/ErrorPropagationMap.tsx?raw";
import sessionComplexityScatter from "../../components/workflows/SessionComplexityScatter.tsx?raw";
import compactionImpact from "../../components/workflows/CompactionImpact.tsx?raw";
import orchestrationDAG from "../../components/workflows/OrchestrationDAG.tsx?raw";
import toolExecutionFlow from "../../components/workflows/ToolExecutionFlow.tsx?raw";
import workflowStats from "../../components/workflows/WorkflowStats.tsx?raw";

const CASES: Array<{ name: string; source: string; forbidden: string[] }> = [
  { name: "Analytics.tsx", source: analytics, forbidden: ["#1e1e2e", "#161625", "bg-[#12121f]"] },
  { name: "Workflows.tsx", source: workflows, forbidden: ["bg-[#12121f]", "border-[#2a2a4a]"] },
  {
    name: "AgentCollaborationNetwork.tsx",
    source: agentCollaborationNetwork,
    forbidden: ["bg-[#12121f]", "#94a3b8", "#cbd5e1"],
  },
  {
    name: "SubagentEffectiveness.tsx",
    source: subagentEffectiveness,
    forbidden: ["#2a2a3d", "#e4e4ed", "bg-[#12121f]"],
  },
  {
    name: "ModelDelegationFlow.tsx",
    source: modelDelegationFlow,
    forbidden: ['"#12121f"', "#e2e8f0"],
  },
  {
    name: "ConcurrencyTimeline.tsx",
    source: concurrencyTimeline,
    forbidden: ["--color-gray-400", '"#12121f"'],
  },
  { name: "ErrorPropagationMap.tsx", source: errorPropagationMap, forbidden: ['"#9ca3af"'] },
  {
    name: "SessionComplexityScatter.tsx",
    source: sessionComplexityScatter,
    forbidden: ["bg-[#12121f]", "#363650"],
  },
  {
    name: "CompactionImpact.tsx",
    source: compactionImpact,
    forbidden: ["bg-[#12121f]", '"#2a2a3d"'],
  },
  {
    name: "OrchestrationDAG.tsx",
    source: orchestrationDAG,
    forbidden: ["#052e16", "#1f0808", "#1c1a04", "bg-[#12121f]"],
  },
  {
    name: "ToolExecutionFlow.tsx",
    source: toolExecutionFlow,
    forbidden: ['"#e2e8f0"', '"#12121f"'],
  },
  { name: "WorkflowStats.tsx", source: workflowStats, forbidden: ["bg-[#12121f]"] },
];

describe("chart color migration", () => {
  for (const { name, source, forbidden } of CASES) {
    it(`${name} no longer hardcodes its old canvas-dependent colors`, () => {
      for (const literal of forbidden) {
        expect(source, `${name} should no longer contain ${literal}`).not.toContain(literal);
      }
    });
  }
});
```

- [ ] **Step 2: Run to verify it passes**

```bash
npx vitest run src/pages/__tests__/chartColors.no-hardcoded-hex.test.ts
```

Expected: PASS for all 12 cases (Tasks 8-19 already removed every listed literal). If any case fails here, it means a migration task missed a spot — go back and fix that file before continuing.

- [ ] **Step 3: Typecheck and header audit**

```bash
npx tsc -b
cd .. && bash .claude/skills/file-headers/scripts/check-headers.sh && cd client
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/pages/__tests__/chartColors.no-hardcoded-hex.test.ts
git commit -m "test(theme): add regression guard against reintroducing hardcoded chart colors"
```

---

### Task 21: Documentation

**Files:**

- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

Per the design spec, English-only (no VN/CN/KO/wiki propagation for this personal-fork feature).

- [ ] **Step 1: README.md**

Find the **UI Localization** feature row (documents the language switcher) and add a new adjacent row to the same feature table:

```markdown
| **Theme** | Settings → Appearance offers Dark, Light, and System (follows the OS `prefers-color-scheme`, live-reactive to OS changes). Dark is the default — existing behavior is unchanged unless you open this setting. Covers the full UI including every chart and visualization. |
```

- [ ] **Step 2: ARCHITECTURE.md**

Add a new subsection near the "Display Currency (Client)" section added by the earlier currency-toggle work (search for that heading to place this consistently):

```markdown
### Theme (Client)

`client/src/lib/theme.ts` owns a `dark | light | system` preference (`localStorage` key `ccam-theme`), following the same singleton + `CustomEvent` pattern as `sound.ts`/`currency.ts`. `"system"` resolves via `prefers-color-scheme` and stays live-reactive to OS changes. `applyTheme()` sets `data-theme` on `<html>`; every other color in the app follows automatically through CSS custom properties defined in `client/src/index.css` (`:root` for dark, `[data-theme="light"]` for light) that `tailwind.config.js`'s `gray`/`surface`/`border`/`accent` colors resolve through. An inline script in `index.html` applies the theme before first paint to avoid a flash of the wrong theme.

Chart/visualization colors (`client/src/lib/chartTheme.ts` plus 12 files under `client/src/pages/` and `client/src/components/workflows/`) split into **data-mark colors** (categorical series/per-tool/per-family accent hues — identical in both themes, already readable on either background) and **canvas-dependent colors** (tooltip chrome, ring/donut tracks, heatmap empty cells, `OrchestrationDAG`'s node gradient fills — real distinct light-mode values via dedicated CSS variables).
```

- [ ] **Step 3: Verify**

```bash
npx prettier --check ../README.md ../ARCHITECTURE.md
```

(run from `client/`; adjust paths if run from repo root instead: `npx prettier --check README.md ARCHITECTURE.md`)

- [ ] **Step 4: Commit**

```bash
cd ..
git add README.md ARCHITECTURE.md
git commit -m "docs: document the dark/light theme feature in README and ARCHITECTURE"
```

---

## Final Verification

After all 21 tasks:

```bash
cd client
npx tsc -b
npx vitest run
cd ..
bash .claude/skills/file-headers/scripts/check-headers.sh
```

Expected: clean typecheck, the same 388/391 test pass rate as the baseline established in Task 1 (the 3 pre-existing clock-format snapshot failures are unrelated to this feature and were already present before this plan started), clean header audit. Then a final manual pass: cycle Dark → Light → System on `/`, `/analytics`, `/workflows`, `/sessions`, `/settings`, confirming no illegible text, no invisible borders, and no dark-canvas-shaped artifacts (near-black boxes, near-white-on-white text) anywhere in light mode.
