/**
 * @file XanaOS.tsx
 * @description Assistants page: lists the XanaOS assistants discovered under
 * `OS/assistantes` by `GET /api/xanaos/assistants` (`server/routes/xanaos.js`),
 * with each assistant's verified live status (up/busy/offline/never deployed)
 * and Remote Control availability. Deliberately its own visual language
 * (initial badge, status dot, per-assistant accent) rather than the generic
 * agent/session badges elsewhere in the app: an assistant is a standing XanaOS
 * identity, not a transient dashboard-launched agent run. Sessions and
 * transcripts stay out of this page — see
 * docs/superpowers/specs/2026-09-07-cockpit-assistants-design.md for that
 * larger, not-yet-built surface.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, FolderX, Sparkles, Satellite } from "lucide-react";
import { api } from "../lib/api";
import type { XanaosAssistant, XanaosAssistantsResponse } from "../lib/types";
import { XanaosAssistantDetail } from "../components/XanaosAssistantDetail";

/** Deterministic accent color per assistant, so the same identity always
 *  reads the same way across refreshes rather than shuffling with array order. */
const AVATAR_PALETTE = [
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-cyan-500/15 text-cyan-300",
];

function avatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!;
}

type AssistantStatus = "up-busy" | "up-idle" | "offline" | "never-deployed";

function statusOf(assistant: XanaosAssistant): AssistantStatus {
  if (!assistant.deployed) return "never-deployed";
  if (!assistant.up) return "offline";
  return assistant.busy ? "up-busy" : "up-idle";
}

const STATUS_STYLE: Record<AssistantStatus, { dot: string; badge: string; labelKey: string }> = {
  "up-idle": {
    dot: "bg-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    labelKey: "statusUp",
  },
  "up-busy": {
    dot: "bg-amber-400 animate-pulse-dot",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    labelKey: "statusBusy",
  },
  offline: {
    dot: "bg-gray-500",
    badge: "border-border bg-surface-3 text-gray-400",
    labelKey: "statusOffline",
  },
  "never-deployed": {
    dot: "bg-gray-700",
    badge: "border-border bg-surface-2 text-gray-600",
    labelKey: "statusNeverDeployed",
  },
};

export function XanaOS() {
  const { t } = useTranslation("xanaos");
  const [data, setData] = useState<XanaosAssistantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailFirstName, setDetailFirstName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.xanaos
        .assistants()
        .then((res) => {
          if (!cancelled) setData(res);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        });
    load();
    const interval = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} totals={data?.totals ?? null} />

      {error && (
        <div className="card border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && data && !data.assistants_dir_exists && (
        <EmptyState icon={FolderX} message={t("emptyDirMissing")} />
      )}

      {!error && data && data.assistants_dir_exists && data.assistants.length === 0 && (
        <EmptyState icon={FolderX} message={t("emptyNoAssistants", { dir: data.assistants_dir })} />
      )}

      {data && data.assistants.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.assistants.map((assistant) => (
            <AssistantCard
              key={assistant.dir_name}
              assistant={assistant}
              onSeeMore={() => setDetailFirstName(assistant.first_name)}
            />
          ))}
        </div>
      )}

      <XanaosAssistantDetail firstName={detailFirstName} onClose={() => setDetailFirstName(null)} />
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  totals,
}: {
  title: string;
  subtitle: string;
  totals: { discovered: number; up: number; remote_control: number } | null;
}) {
  const { t } = useTranslation("xanaos");
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-50">
          <Users className="h-5 w-5 text-accent" aria-hidden />
          {title}
        </h1>
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      </div>
      {totals && (
        <div className="flex items-center gap-2">
          <span className="badge border-border bg-surface-3 text-gray-300">
            {t("discoveredCount", { count: totals.discovered })}
          </span>
          <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {t("upCount", { count: totals.up })}
          </span>
          {totals.remote_control > 0 && (
            <span className="badge border-accent/30 bg-accent/10 text-accent">
              <Satellite className="h-3 w-3" aria-hidden />
              {t("remoteControlCount", { count: totals.remote_control })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof FolderX; message: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-16">
      <Icon className="h-10 w-10 text-gray-600" aria-hidden />
      <p className="max-w-md text-center text-sm text-gray-400">{message}</p>
    </div>
  );
}

function AssistantCard({
  assistant,
  onSeeMore,
}: {
  assistant: XanaosAssistant;
  onSeeMore: () => void;
}) {
  const { t } = useTranslation("xanaos");
  const status = statusOf(assistant);
  const style = STATUS_STYLE[status];

  return (
    <div className="card relative flex flex-col gap-3 overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${style.dot}`} aria-hidden />

      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarClass(assistant.first_name)}`}
          aria-hidden
        >
          {assistant.first_name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-gray-100">{assistant.first_name}</h2>
            {assistant.remote_control && (
              <Satellite
                className="h-3.5 w-3.5 flex-shrink-0 text-accent"
                aria-label={t("remoteControl")}
              />
            )}
          </div>
          <p className="truncate text-xs text-gray-500">{assistant.role}</p>
        </div>
        <span className={`badge flex-shrink-0 ${style.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
          {t(style.labelKey)}
        </span>
      </div>

      <p className="min-h-[2.5rem] text-xs leading-relaxed text-gray-400">
        {assistant.description ?? t("noDescription")}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-gray-500">
        <span>{t("subAgentsCount", { count: assistant.sub_agents.length })}</span>
        <span className="flex items-center gap-1">
          {assistant.has_runtime && assistant.distilled_at ? (
            <>
              <Sparkles className="h-3 w-3 text-accent" aria-hidden />
              {t("runtimeDistilled", {
                date: new Date(assistant.distilled_at).toLocaleDateString(),
              })}
            </>
          ) : (
            t("runtimeNotDistilled")
          )}
        </span>
        <button
          type="button"
          onClick={onSeeMore}
          className="ml-auto text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          {t("seeMore")}
        </button>
      </div>
    </div>
  );
}
