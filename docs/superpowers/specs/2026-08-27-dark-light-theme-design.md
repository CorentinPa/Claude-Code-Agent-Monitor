# Design: Dark/Light Theme (Phase 1 of Theming)

- **Date**: 2026-08-27
- **Author**: Corentin + Claude (brainstorming collaboration)
- **Status**: Design Approved, pending spec review before implementation plan

## Background

The dashboard is 100% dark-themed with no theming infrastructure: `client/tailwind.config.js` defines `surface`/`border`/`accent` as literal hex values under `theme.extend.colors` (not CSS custom properties), and every component reaches for Tailwind's **stock** `gray-*` scale directly for text (`text-gray-300`, `text-gray-400`, etc. — not a custom token). There is no `:root` CSS variable block, no second color set, no `ThemeProvider`, no `dark:`/`light:` variant usage, and no theme-preference module (confirmed by full-repo exploration: zero matches for `theme`, `prefers-color-scheme`, `data-theme` outside `index.html`'s inert `<meta name="color-scheme">`).

Chart/data-visualization components (`client/src/pages/Analytics.tsx` and 11 files under `client/src/components/workflows/`) render raw SVG/HTML with **~233 hardcoded hex/rgba color literals**, spread across ~6 independent local palette constants (`COLORS`, `STATUS_COLOR`, `FAMILY_COLORS`, `DEPTH_COLORS`, `SUBAGENT_PALETTE`, `MAIN_COLOR`) with no shared module. Several elements assume a dark canvas explicitly (tooltip chrome hardcoded near-black in 4 files, a donut track at `Analytics.tsx:517` (`#1e1e2e`), d3 axis/grid colors in `SessionComplexityScatter.tsx`, literal `"white"` text on a colored bar in `ConcurrencyTimeline.tsx:150`).

This is a from-scratch build, not "expose an existing toggle."

## Goals

- A Settings control offering **Dark / Light / System** (default: **Dark**, preserving current behavior for every existing user with zero visual change until they open this setting).
- Full light-mode coverage of base UI (surfaces, borders, text) **and** every chart/visualization — not a partial pass.
- No flash of the wrong theme on load (anti-FOUC inline script).
- Live reaction to OS theme changes while "System" is selected.
- Follows this codebase's existing preference-module convention (`sound.ts`, `currency.ts`): `localStorage`-backed singleton + `CustomEvent` subscription, no new state-management library.

## Non-Goals (this phase)

- **Accent-color picker** — explicitly deferred to Phase 2 (its own spec/plan, after this phase ships and is merged). This phase does not add a color picker UI or make `accent` swappable beyond whatever falls out naturally from the CSS-variable migration.
- Electron native chrome (title bar / window background color) — only the web content adapts; the desktop shell's native theming is untouched.
- Re-theming Tailwind's semantic/status colors (`emerald`, `red`, `amber`, `violet`, `blue`, `cyan` used for success/error/warning/info) — they stay as literal Tailwind classes. They already have workable contrast on both very dark and very light backgrounds in the common case; only fixed during implementation if a specific instance is visually broken.
- Automated visual regression testing — none exists in this repo (no Percy/Chromatic equivalent) and this phase does not introduce one. Light-mode correctness is verified by manual browser check during implementation, not by an automated screenshot diff.

## Architecture

### 1. Token layer

`client/tailwind.config.js` currently `extend`s `theme.colors` with `surface`/`border`/`accent` (leaving Tailwind's stock `gray` untouched). This changes to:

- `theme.colors.gray` is **replaced** (not extended) with `{ 100: 'var(--gray-100)', 200: 'var(--gray-200)', ..., 900: 'var(--gray-900)' }`, so every existing `text-gray-300`-style class becomes theme-reactive with **zero changes to the ~1000+ call sites** that already use it.
- `surface`, `border`, `accent` under `theme.extend.colors` switch from literal hex to the same `var(--token)` pattern.

`client/src/index.css` gains a `:root` block (dark values, i.e. today's exact literals — no visual change) and a `[data-theme="light"]` block (new light values):

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
  /* gray scale inverted: lower numbers stay "more prominent," which now means
     darker-on-light instead of lighter-on-dark. */
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

These are starting values for the implementation to work from; exact shades get a manual-browser contrast pass per the Testing section, not treated as final on write.

### 2. `client/src/lib/theme.ts` (new)

Mirrors `sound.ts`/`currency.ts` exactly:

- `localStorage` key `ccam-theme`, shape `{ mode: "dark" | "light" | "system" }`, default `{ mode: "dark" }`.
- `getThemePrefs()` / `setThemePrefs(patch)` / `subscribeToThemePrefs(handler)` — same memoized-singleton + `CustomEvent` pattern.
- `getEffectiveTheme(): "dark" | "light"` — resolves `mode`; for `"system"`, reads `window.matchMedia("(prefers-color-scheme: dark)").matches`.
- `applyTheme()` — sets `document.documentElement.dataset.theme` to the effective theme. Called on init, on every `setThemePrefs`, and from a `matchMedia` `"change"` listener that's only active while `mode === "system"`.

### 3. Anti-FOUC script

A small inline `<script>` in `client/index.html`, before any stylesheet/bundle loads, synchronously reads `localStorage["ccam-theme"]`, resolves the effective theme (duplicating the tiny `system` → `matchMedia` check inline since it can't import `theme.ts`), and sets `data-theme` on `<html>` before first paint. `theme.ts`'s `applyTheme()` is idempotent so React mounting and re-running it is harmless.

### 4. Settings UI

New "Appearance" section, placed near the top of the Settings page (before or right after "Dashboard Data"). A 3-option `role="radiogroup"` control — Sombre/Clair/Système with `Moon`/`Sun`/`Monitor` icons — reusing the exact visual/interaction pattern already used for the Claude/Codex/Both provider-scope selector (`Settings.tsx`'s `data-display` section).

### 5. Chart/visualization migration

New `client/src/lib/chartTheme.ts` exports the shared pieces every chart currently duplicates:

- A categorical series palette: `CHART_SERIES: string[]` = `["var(--chart-series-1)", ..., "var(--chart-series-8)"]`.
- Chrome tokens: `CHART_AXIS_GRID`, `CHART_AXIS_TICK`, `CHART_AXIS_TEXT`, `CHART_TOOLTIP_BG`, `CHART_TOOLTIP_BORDER`, `CHART_TRACK` (donut empty ring) — each a `"var(--chart-x)"` string.

Corresponding `--chart-*` variables are added to the same `:root` / `[data-theme="light"]` blocks in `index.css`. Because SVG `fill`/`stroke` attributes accept `var(--x)` natively, no JS-side color computation is needed — components just swap a hex literal for the matching exported constant.

Affected files (13, all under `client/src/pages/` or `client/src/components/workflows/`): `Analytics.tsx`, `Workflows.tsx`, `AgentCollaborationNetwork.tsx`, `CompactionImpact.tsx`, `ConcurrencyTimeline.tsx`, `ErrorPropagationMap.tsx`, `ModelDelegationFlow.tsx`, `OrchestrationDAG.tsx`, `SessionComplexityScatter.tsx`, `SubagentEffectiveness.tsx`, `ToolExecutionFlow.tsx`, `WorkflowPatterns.tsx`, `WorkflowStats.tsx`.

- Component-local semantic groupings (`FAMILY_COLORS` mapping model families, `DEPTH_COLORS` mapping error-propagation depth) stay as local constants in their own files — only their hex _values_ change to reference the shared `chartTheme.ts` exports, since they encode a domain mapping specific to that component, not a generic palette.
- The dark-canvas-specific spots found in exploration get their own dedicated tokens rather than reusing the data-series palette: the 4-file duplicated tooltip chrome → `CHART_TOOLTIP_BG`/`CHART_TOOLTIP_BORDER`; `Analytics.tsx:517`'s donut track → `CHART_TRACK`; `SessionComplexityScatter.tsx`'s d3 axis/grid → `CHART_AXIS_GRID`/`CHART_AXIS_TICK`/`CHART_AXIS_TEXT`; `ConcurrencyTimeline.tsx:150`'s literal `"white"` bar text → resolved case-by-case during implementation (needs a value that stays legible against a _saturated_ bar fill in both themes, which may not need to change at all — confirmed by the manual pass, not assumed here).

## Testing

- `theme.ts`: unit tests mirroring `currency.test.ts` — defaults, `localStorage` persistence, corrupt-storage fallback, subscriber notify/unsubscribe.
- `getEffectiveTheme()`: `mode="dark"` → `"dark"`, `mode="light"` → `"light"`, `mode="system"` with `matchMedia` mocked both ways, plus reacting to a simulated OS-preference `"change"` event while `mode="system"`.
- Settings UI: render test for the 3-option control, clicking each option persists the right `mode` and updates `document.documentElement.dataset.theme`.
- **No automated visual coverage.** `screens.snapshot.test.tsx` validates DOM structure, not computed colors, so it needs no light-mode variant and won't catch a contrast/legibility regression. Light-mode correctness (base UI **and** every chart) is verified manually in a browser across Dashboard, Analytics, Workflows, Sessions, and Settings before this phase is called done — this is a stated limitation, not an oversight.

## Documentation

Same policy as the EUR-display toggle (this session, precedent): English-only, `README.md` + `ARCHITECTURE.md`. No VN/CN/KO/wiki propagation — disproportionate for a personal-fork feature.

## Follow-ups (explicitly out of scope here)

- **Phase 2 — accent-color picker**: a curated preset palette (not a free hex/RGB picker, per prior decision), built on top of the `--accent`/`--accent-hover`/`--accent-muted` variables this phase introduces. Gets its own brainstorming session once Phase 1 has shipped.
