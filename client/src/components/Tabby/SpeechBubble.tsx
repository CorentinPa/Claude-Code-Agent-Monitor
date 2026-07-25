/**
 * @file SpeechBubble.tsx
 * @description Transient speech bubble rendered above the Tabby cat mascot.
 * Pure presentation — visibility timing and quip selection live in
 * {@link useTabbyBrain}; this component only paints the bubble and handles
 * user dismissal.
 *
 * ## Accessibility
 * Uses `role="status"` with `aria-live="polite"` so screen readers announce
 * new quips without interrupting current speech. Click anywhere on the bubble
 * to dismiss early.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

/** Props for {@link SpeechBubble}. */
interface SpeechBubbleProps {
  /** Quip text to display inside the bubble. */
  text: string;
  /** Called when the user clicks to dismiss. */
  onDismiss: () => void;
}

/**
 * Animated speech bubble above Tabby.
 * @param props See {@link SpeechBubbleProps}.
 */
export function SpeechBubble({ text, onDismiss }: SpeechBubbleProps) {
  return (
    <div
      className="tabby-bubble tabby-bubble-enter"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      title="Dismiss"
    >
      {text}
    </div>
  );
}
