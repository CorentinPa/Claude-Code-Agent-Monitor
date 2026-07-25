/**
 * @file Checkbox.tsx
 * @description Accessible custom checkbox built on a `<button role="checkbox">`
 * instead of a native `<input type="checkbox">` so the control matches the
 * dashboard's dark theme (accent fill, rounded square, Lucide check mark).
 *
 * ## Keyboard & ARIA
 * Space and Enter toggle via the native button behavior. `aria-checked` mirrors
 * the `checked` prop for screen readers.
 *
 * ## Usage
 * Pass `label` for inline text, or omit it and wrap with an external `<label>`
 * when the clickable area should include more than the box itself.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import type { ReactNode } from "react";
import { Check } from "lucide-react";

/** Props for {@link Checkbox}. */
export interface CheckboxProps {
  /** Controlled checked state. */
  checked: boolean;
  /** Called with the toggled value when the user activates the control. */
  onChange: (v: boolean) => void;
  /** Optional label rendered to the right of the box. */
  label?: ReactNode;
  /** Extra classes on the outer `<button>`. */
  className?: string;
  /** Classes applied to the label `<span>` when `label` is set. */
  labelClassName?: string;
}

/**
 * Themed checkbox control.
 * @param props See {@link CheckboxProps}.
 */
export function Checkbox({ checked, onChange, label, className, labelClassName }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`group inline-flex items-center gap-2 text-left ${className ?? ""}`}
    >
      <span
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
          checked
            ? "bg-accent border-accent"
            : "bg-surface-2 border-border group-hover:border-border-light"
        }`}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      {label != null && (
        <span className={labelClassName ?? "text-xs text-gray-400 group-hover:text-gray-300"}>
          {label}
        </span>
      )}
    </button>
  );
}
