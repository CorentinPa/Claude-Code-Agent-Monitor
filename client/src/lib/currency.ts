/**
 * @file currency.ts
 * @description Owns the user's USD/EUR display-currency preference: whether
 * costs render in euros instead of dollars, and the manually-entered
 * EUR-per-USD rate to convert with. Preferences persist to `localStorage`
 * (disabled/USD by default) and follow the same singleton + `CustomEvent`
 * pattern as {@link ../lib/sound.ts} so the Settings page and every cost
 * formatter stay in sync without prop drilling. Conversion is display-only:
 * stored data and exports remain in USD: only {@link convertCost},
 * {@link currencySymbol}, and {@link currencyCode} read this preference.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

/** `localStorage` key holding the serialized {@link CurrencyPrefs}. */
const CURRENCY_KEY = "ccam-currency-prefs";
/** `window` event dispatched whenever preferences change, so the Settings page
 *  and every cost formatter stay in sync without prop drilling. */
const PREFS_EVENT = "currency:prefs";

/** User's display-currency preference. */
export interface CurrencyPrefs {
  /** When true, costs render converted to EUR. Defaults to false (USD, unchanged behavior). */
  enabled: boolean;
  /** Manually-entered EUR-per-USD rate applied when `enabled` is true. Must be a finite, positive number. */
  eurPerUsd: number;
}

/** Shipping defaults: USD display (unchanged from today), rate pre-filled at the current EUR/USD level. */
export const DEFAULT_CURRENCY_PREFS: CurrencyPrefs = {
  enabled: false,
  eurPerUsd: 0.86,
};

let cached: CurrencyPrefs | null = null;

/**
 * Reads preferences from `localStorage`, merging over {@link DEFAULT_CURRENCY_PREFS}
 * so a partial or older saved object still yields a complete, valid result.
 * The result is memoized; {@link setCurrencyPrefs} invalidates the cache.
 */
export function getCurrencyPrefs(): CurrencyPrefs {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(CURRENCY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CurrencyPrefs>) : {};
    cached = { ...DEFAULT_CURRENCY_PREFS, ...parsed };
  } catch {
    cached = { ...DEFAULT_CURRENCY_PREFS };
  }
  cached.eurPerUsd = sanitizeRate(cached.eurPerUsd);
  return cached;
}

/**
 * Merges `patch` into the stored preferences, persists the result, and notifies
 * subscribers. Storage failures (private mode, quota) are swallowed - prefs are
 * best-effort and the in-memory cache still reflects the change for this tab.
 * @param patch Partial preferences to apply over the current values.
 * @returns The full, updated preference object.
 */
export function setCurrencyPrefs(patch: Partial<CurrencyPrefs>): CurrencyPrefs {
  const next: CurrencyPrefs = { ...getCurrencyPrefs(), ...patch };
  next.eurPerUsd = sanitizeRate(next.eurPerUsd);
  cached = next;
  try {
    localStorage.setItem(CURRENCY_KEY, JSON.stringify(next));
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

/**
 * Subscribes to preference changes made anywhere in this tab.
 * @param handler Invoked (with no arguments) after every {@link setCurrencyPrefs}.
 * @returns An unsubscribe function.
 */
export function subscribeToCurrencyPrefs(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(PREFS_EVENT, listener);
  return () => window.removeEventListener(PREFS_EVENT, listener);
}

/**
 * Converts a USD amount to the active display currency per current prefs.
 * @param usd A dollar amount.
 * @returns `usd` unchanged when EUR display is off; `usd * eurPerUsd` when on.
 */
export function convertCost(usd: number): number {
  const prefs = getCurrencyPrefs();
  return prefs.enabled ? usd * prefs.eurPerUsd : usd;
}

/** The symbol for the active display currency: `"$"` or `"€"`. */
export function currencySymbol(): string {
  return getCurrencyPrefs().enabled ? "€" : "$";
}

/** The ISO 4217 code for the active display currency, for `Intl.NumberFormat`. */
export function currencyCode(): string {
  return getCurrencyPrefs().enabled ? "EUR" : "USD";
}

/** A stored/patched rate must be finite and positive; otherwise fall back to the default. */
function sanitizeRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CURRENCY_PREFS.eurPerUsd;
  return value;
}
