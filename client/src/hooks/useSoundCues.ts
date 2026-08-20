/**
 * @file useSoundCues.ts
 * @description React hook that turns dashboard activity into subtle audio cues.
 * Subscribes to the in-memory `eventBus` (WebSocket fan-out) and the socket's
 * connection state, mapping each interesting message to a synthesized cue from
 * `lib/sound`. Also installs a single delegated pointer listener that plays a
 * near-silent tick when the user activates a button, link, or tab - one
 * listener at the root instead of an `onClick` in every component. Mount once
 * at the app root; all gating, throttling, and preference reads live in
 * `lib/sound`, so toggling a Settings switch takes effect immediately.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect } from "react";
import { eventBus } from "../lib/eventBus";
import { installSoundUnlock, playCue } from "../lib/sound";
import type { WSMessage, Session, Agent, DashboardEvent } from "../lib/types";

/** Selector for elements whose activation earns an interaction tick. Limited to
 *  genuine controls so that plain text clicks and drags stay silent. */
const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], [role="tab"], [role="switch"], summary, input[type="checkbox"], input[type="radio"]';

/**
 * Wires dashboard events to audio cues for the lifetime of the component.
 * Takes no props and returns nothing - mount it once, next to
 * {@link useNotifications}, in the app root.
 */
export function useSoundCues() {
  useEffect(() => {
    const removeUnlock = installSoundUnlock();

    // Delegated interaction tick. Uses `pointerdown` on the capture phase so
    // the cue lands with the press rather than after a handler runs (and still
    // fires for controls that stop propagation).
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const control = target.closest(INTERACTIVE_SELECTOR);
      if (!control) return;
      if (control.hasAttribute("disabled") || control.getAttribute("aria-disabled") === "true") {
        return;
      }
      playCue("click");
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });

    const unsubscribeConnection = eventBus.onConnection((connected) => {
      playCue(connected ? "connected" : "disconnected");
    });

    const unsubscribeMessages = eventBus.subscribe((msg: WSMessage) => {
      switch (msg.type) {
        case "session_created":
          playCue("sessionStart");
          break;
        case "session_updated": {
          const session = msg.data as Session;
          if (session.status === "error") playCue("sessionError");
          break;
        }
        case "agent_created": {
          const agent = msg.data as Agent;
          if (agent.type === "subagent") playCue("subagentSpawn");
          break;
        }
        case "new_event": {
          const event = msg.data as DashboardEvent;
          if (event.event_type === "Stop" || event.event_type === "SessionEnd") {
            playCue("sessionComplete");
          } else if (event.event_type === "Notification") {
            playCue("notification");
          }
          break;
        }
      }
    });

    return () => {
      removeUnlock();
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      unsubscribeConnection();
      unsubscribeMessages();
    };
  }, []);
}
