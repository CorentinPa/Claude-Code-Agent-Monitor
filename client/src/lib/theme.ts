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
