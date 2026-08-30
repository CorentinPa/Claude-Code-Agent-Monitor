/**
 * @file docs.ts
 * @description Owns the "show the Documentation entry in the sidebar"
 * preference. The Documentation page renders the repository's `docs/*.md`
 * manual inside the dashboard; its navigation entry is opt-in and off by
 * default, so the sidebar keeps its current shape until the user turns it on in
 * Settings. Persists to `localStorage` and follows the same singleton +
 * `CustomEvent` pattern as {@link ./currency.ts} so the Settings toggle and the
 * sidebar stay in sync without prop drilling.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

/** `localStorage` key holding the serialized boolean preference. */
const DOCS_KEY = "ccam-docs-link";
/** `window` event dispatched whenever the preference changes. */
const PREFS_EVENT = "docs:prefs";

/** Client route the sidebar entry points at. */
export const DOCS_ROUTE = "/docs";

/** Off by default: the sidebar keeps its current shape until the user opts in. */
export const DEFAULT_DOCS_LINK_ENABLED = false;

/** Whether the sidebar should render the Documentation entry. */
export function getDocsLinkEnabled(): boolean {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (raw === null) return DEFAULT_DOCS_LINK_ENABLED;
    return raw === "true";
  } catch {
    // Private mode / disabled storage: fall back to the shipping default.
    return DEFAULT_DOCS_LINK_ENABLED;
  }
}

/**
 * Persists the preference and notifies subscribers. Storage failures are
 * swallowed - the preference is best-effort, and listeners still update.
 */
export function setDocsLinkEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DOCS_KEY, String(enabled));
  } catch {
    // Ignore storage failures - the change still applies for this session.
  }
  try {
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  } catch {
    // Non-DOM context: nothing to notify.
  }
}

/**
 * Subscribes to preference changes made in this tab or another one.
 * @param handler Invoked (with no arguments) after every change.
 * @returns An unsubscribe function.
 */
export function subscribeToDocsLink(handler: () => void): () => void {
  const listener = () => handler();
  window.addEventListener(PREFS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(PREFS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
