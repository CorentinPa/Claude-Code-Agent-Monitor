/**
 * @file Select.tsx
 * @description Generic styled dropdown that replaces native `<select>` elements
 * for consistent cross-platform rendering. Native macOS/Chromium selects reserve
 * checkmark space inconsistently; this control aligns labels, supports arrow-key
 * navigation, flips above the trigger when viewport space is tight, and marks
 * the active option with accent color plus a Lucide check.
 *
 * ## Consumers
 * Used on the Run Claude page and webhook settings form wherever a compact
 * enum picker is needed.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/** Single option in a {@link Select} list. */
export interface SelectOption<T extends string> {
  /** Stored value emitted via `onChange`. */
  value: T;
  /** Primary label shown in the trigger and list. */
  label: string;
  /** Optional secondary line (smaller gray text). */
  hint?: string;
}

/** Props for {@link Select}. */
export interface SelectProps<T extends string> {
  /** Currently selected value. */
  value: T;
  /** Called when the user picks a new option. */
  onChange: (v: T) => void;
  /** All choices; must be non-empty for sensible rendering. */
  options: SelectOption<T>[];
  /** Disables opening the list. */
  disabled?: boolean;
}

/**
 * Accessible custom select control.
 * @typeParam T - string union of allowed option values.
 */
export function Select<T extends string>({ value, onChange, options, disabled }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
  );
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // When opening, decide whether to render the popover above the trigger if
  // the viewport doesn't have room below (common when this select sits at
  // the bottom of a form). 288 px = `max-h-72`.
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    setOpenUp(below < 288 && above > below);
  }, [open]);

  // Sync active highlight with current value when reopening
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActive(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const choose = (opt: SelectOption<T>) => {
    onChange(opt.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      !open &&
      (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[active];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
        className="w-full flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-md px-3 py-1.5 text-[11px] text-gray-100 focus:outline-none focus:border-accent/50 hover:bg-surface-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="truncate">{current?.label ?? "-"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      </button>
      {open && (
        <div
          className={`absolute z-30 left-0 right-0 rounded-md border border-border bg-surface-1 shadow-lg shadow-black/40 max-h-72 overflow-auto py-1 ${
            openUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === active;
            return (
              <button
                key={opt.value || "__default__"}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(opt)}
                onMouseEnter={() => setActive(idx)}
                className={`w-full text-left px-3 py-1.5 transition-colors ${
                  isActive ? "bg-accent/15" : isSelected ? "bg-surface-3" : "hover:bg-surface-3"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] flex-1 truncate ${
                      isSelected ? "text-accent font-medium" : "text-gray-200"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {isSelected && <Check className="w-3 h-3 text-accent flex-shrink-0" />}
                </div>
                {opt.hint && (
                  <div className="text-[10px] text-gray-500 truncate mt-0.5">{opt.hint}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
