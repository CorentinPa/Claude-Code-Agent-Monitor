/**
 * @file EmptyState.tsx
 * @description Centered empty-state panel used whenever a page or section has
 * nothing to render yet — no sessions, no events, no search hits, or a feature
 * that has not been configured. Keeps the UI from looking broken by giving the
 * user a clear icon, title, explanation, and an optional call-to-action slot.
 *
 * ## When to use
 * Prefer this over ad-hoc "No data" paragraphs so every list/table page shares
 * the same vertical rhythm, typography, and card chrome. The optional `action`
 * slot accepts any React node (usually a `<Link>` or `<button>`) without this
 * component needing to know about routing.
 *
 * ## Accessibility
 * The icon is decorative (no separate `aria-label`); meaning comes from the
 * visible `title` (`<h3>`) and `description` (`<p>`). Callers should pass
 * translated strings via `useTranslation`.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import type { LucideIcon } from "lucide-react";

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  /** Lucide icon shown inside the rounded square above the title. */
  icon: LucideIcon;
  /** Primary heading — keep short (one line). */
  title: string;
  /** Supporting copy; wrapped at `max-w-md` for comfortable line length. */
  description: string;
  /** Optional CTA rendered below the description (button, link, or form). */
  action?: React.ReactNode;
}

/**
 * Renders a vertically centered empty state inside the main content column.
 * @param props See {@link EmptyStateProps}.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-4 flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-gray-500" />
      </div>
      <h3 className="text-base font-medium text-gray-300 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-md mb-6">{description}</p>
      {action}
    </div>
  );
}
