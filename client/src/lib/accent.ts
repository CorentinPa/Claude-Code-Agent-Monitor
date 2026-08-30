/**
 * @file accent.ts
 * @description Owns the user's accent-color overrides for the `--accent`,
 * `--accent-hover` and `--accent-muted` design tokens. Each token is stored as
 * a hex string, or `null` to keep whatever `index.css` defines for the active
 * theme. Persists to `localStorage` and follows the same singleton +
 * `CustomEvent` pattern as {@link ./theme.ts}, {@link ./sound.ts} and
 * {@link ./currency.ts}. Applying an override means writing an inline custom
 * property on `<html>`, which outranks the stylesheet; clearing one removes the
 * inline property so the stylesheet wins again.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const ACCENT_KEY = "ccam-accent";
const PREFS_EVENT = "accent:prefs";

/** The tokens a user may override, in the order the Settings UI lists them. */
export const ACCENT_TOKENS = ["accent", "accentHover", "accentMuted"] as const;

export type AccentToken = (typeof ACCENT_TOKENS)[number];

/** Hex override per token; `null` means "use the stylesheet value". */
export type AccentPrefs = Record<AccentToken, string | null>;

export const DEFAULT_ACCENT_PREFS: AccentPrefs = {
  accent: null,
  accentHover: null,
  accentMuted: null,
};

/**
 * The values `index.css` ships, shown in the pickers when a token is not
 * overridden. `--accent-muted` is a translucent fill in the stylesheet, so only
 * its hue is exposed here; the alpha is re-applied on write (see MUTED_ALPHA).
 */
export const STYLESHEET_ACCENTS: Record<AccentToken, string> = {
  accent: "#6366f1",
  accentHover: "#818cf8",
  accentMuted: "#6366f1",
};

/** Alpha `index.css` uses for `--accent-muted`, per effective theme. */
const MUTED_ALPHA: Record<"dark" | "light", number> = { dark: 0.15, light: 0.12 };

/** The CSS custom property each token maps to. */
const CSS_VARIABLE: Record<AccentToken, string> = {
  accent: "--accent",
  accentHover: "--accent-hover",
  accentMuted: "--accent-muted",
};

let cached: AccentPrefs | null = null;

/** Accepts `#rgb` and `#rrggbb`, case-insensitive. */
export function isValidHex(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/** Expands `#rgb` to `#rrggbb` and lowercases, so stored values compare equal. */
export function normalizeHex(hex: string): string {
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return `#${full.toLowerCase()}`;
}

/** `#rrggbb` -> `[r, g, b]`. Assumes an already-validated hex. */
export function hexToRgb(hex: string): [number, number, number] {
  const full = normalizeHex(hex).slice(1);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function getAccentPrefs(): AccentPrefs {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AccentPrefs>) : {};
    cached = sanitize(parsed);
  } catch {
    cached = { ...DEFAULT_ACCENT_PREFS };
  }
  return cached;
}

function sanitize(patch: Partial<AccentPrefs>): AccentPrefs {
  const next = { ...DEFAULT_ACCENT_PREFS };
  for (const token of ACCENT_TOKENS) {
    const value = patch[token];
    if (isValidHex(value)) next[token] = normalizeHex(value);
  }
  return next;
}

export function setAccentPrefs(patch: Partial<AccentPrefs>): AccentPrefs {
  // An explicit null clears one token, so merge before sanitizing rather than
  // letting sanitize() treat the missing key and the null the same way.
  const merged: Partial<AccentPrefs> = { ...getAccentPrefs(), ...patch };
  const next = sanitize(merged);
  cached = next;
  try {
    localStorage.setItem(ACCENT_KEY, JSON.stringify(next));
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

/** Clears every override, restoring the stylesheet's accent palette. */
export function resetAccentPrefs(): AccentPrefs {
  return setAccentPrefs({ ...DEFAULT_ACCENT_PREFS });
}

export function subscribeToAccentPrefs(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(PREFS_EVENT, listener);
  return () => window.removeEventListener(PREFS_EVENT, listener);
}

/**
 * Writes the overrides onto `<html>` as inline custom properties, and removes
 * the inline value for any token the user has not overridden so `index.css`
 * takes over again.
 *
 * `--accent` and `--accent-hover` are RGB channel triples (see the comment at
 * the top of index.css) because Tailwind's opacity modifiers inject alpha into
 * them; `--accent-muted` is a complete color, so it is written with the alpha
 * the active theme uses.
 *
 * Safe to call repeatedly - it is idempotent, and it must be re-run after a
 * theme switch so the muted alpha follows the new theme.
 */
export function applyAccent(effectiveTheme: "dark" | "light" = "dark"): void {
  const prefs = getAccentPrefs();
  const style = document.documentElement.style;
  for (const token of ACCENT_TOKENS) {
    const hex = prefs[token];
    const variable = CSS_VARIABLE[token];
    if (!hex) {
      style.removeProperty(variable);
      continue;
    }
    const [r, g, b] = hexToRgb(hex);
    style.setProperty(
      variable,
      token === "accentMuted"
        ? `rgba(${r}, ${g}, ${b}, ${MUTED_ALPHA[effectiveTheme]})`
        : `${r} ${g} ${b}`
    );
  }
}
