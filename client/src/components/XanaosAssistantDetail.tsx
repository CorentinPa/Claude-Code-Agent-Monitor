/**
 * @file XanaosAssistantDetail.tsx
 * @description "See more" detail modal for one XanaOS assistant, opened from
 * a card on the Assistants page (`client/src/pages/XanaOS.tsx`). Fetches
 * `GET /api/xanaos/assistants/:firstName` on open and shows what a "see
 * more" view needs to pilot and analyze the assistant: its full sub-agent
 * list, its config dir, its recent sessions (each linking to the existing
 * Session Detail page for the transcript itself, per the design decision to
 * reuse that rendering rather than duplicate it), and its most recent
 * recorded events.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { X, FolderOpen, Activity, History } from "lucide-react";
import { api } from "../lib/api";
import type { XanaosAssistantDetail as AssistantDetail } from "../lib/types";

export interface XanaosAssistantDetailProps {
  /** The assistant's first name; null closes the modal. */
  firstName: string | null;
  onClose: () => void;
}

export function XanaosAssistantDetail({ firstName, onClose }: XanaosAssistantDetailProps) {
  const { t } = useTranslation("xanaos");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<AssistantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firstName) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    api.xanaos
      .assistant(firstName)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [firstName]);

  useEffect(() => {
    if (!firstName) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [firstName, onClose]);

  if (!firstName) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-2xl rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-gray-100">
            {firstName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 p-1 text-gray-500 hover:text-gray-300"
            aria-label={t("common:close", { defaultValue: "Close" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {error && <p className="text-sm text-red-300">{error}</p>}

          {!error && !detail && (
            <p className="text-sm text-gray-500">
              {t("common:loading", { defaultValue: "Loading..." })}
            </p>
          )}

          {detail && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-gray-500">{detail.role}</p>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  {detail.description ?? t("noDescription")}
                </p>
              </div>

              {detail.deployed && detail.config_dir && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                  <span className="truncate font-mono">{detail.config_dir}</span>
                </div>
              )}

              {detail.sub_agents.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t("subAgentsCount", { count: detail.sub_agents.length })}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detail.sub_agents.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-border bg-surface-3 px-2 py-0.5 text-[11px] text-gray-300"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  {t("recentSessions")}
                </h3>
                {detail.recent_sessions.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">{t("noSessions")}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {detail.recent_sessions.map((session) => (
                      <li
                        key={session.session_id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-gray-200">
                            {session.name ?? session.session_id}
                          </p>
                          <p className="text-gray-500">
                            {new Date(session.modified_at).toLocaleString()}
                            {session.status ? ` · ${session.status}` : ""}
                          </p>
                        </div>
                        {session.known ? (
                          <Link
                            to={`/sessions/${session.session_id}`}
                            onClick={onClose}
                            className="flex-shrink-0 text-accent underline underline-offset-2 hover:text-accent-hover"
                          >
                            {t("viewConversation")}
                          </Link>
                        ) : (
                          <span className="flex-shrink-0 text-gray-600">{t("notIndexed")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <Activity className="h-3.5 w-3.5" aria-hidden />
                  {t("recentActivity")}
                </h3>
                {detail.recent_events.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">{t("noActivity")}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {detail.recent_events.map((event, index) => (
                      <li
                        key={`${event.session_id}-${index}`}
                        className="flex items-baseline gap-2 text-xs text-gray-400"
                      >
                        <span className="flex-shrink-0 text-gray-600">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                        <span className="min-w-0 truncate">
                          {event.tool_name ?? event.event_type}
                          {event.summary ? ` — ${event.summary}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
