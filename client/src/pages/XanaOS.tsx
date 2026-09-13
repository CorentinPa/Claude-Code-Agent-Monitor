/**
 * @file XanaOS.tsx
 * @description Assistants page: lists the XanaOS assistants discovered under
 * `OS/assistantes` by `GET /api/xanaos/assistants` (`server/routes/xanaos.js`).
 * Read-only directory view — identity, description, sub-agent count, and
 * whether a distilled runtime exists. No live process state, no sessions, no
 * transcripts: see docs/superpowers/specs/2026-09-07-cockpit-assistants-design.md
 * for that larger surface, not built by this page.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, FolderX, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import type { XanaosAssistant, XanaosAssistantsResponse } from "../lib/types";

export function XanaOS() {
  const { t } = useTranslation("xanaos");
  const [data, setData] = useState<XanaosAssistantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.xanaos
      .assistants()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        count={data?.assistants.length ?? null}
      />

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
            <AssistantCard key={assistant.dir_name} assistant={assistant} />
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count: number | null;
}) {
  const { t } = useTranslation("xanaos");
  return (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-50">
        <Users className="h-5 w-5 text-accent" aria-hidden />
        {title}
      </h1>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      {count !== null && (
        <p className="mt-1 text-xs text-gray-400">{t("discoveredCount", { count })}</p>
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

function AssistantCard({ assistant }: { assistant: XanaosAssistant }) {
  const { t } = useTranslation("xanaos");
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-100">{assistant.first_name}</h2>
        <p className="text-xs text-gray-500">{assistant.role}</p>
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
      </div>
    </div>
  );
}
