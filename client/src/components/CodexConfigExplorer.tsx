/**
 * @file Read-only Codex configuration explorer for local models, profiles,
 * MCP servers, projects, skills, hooks, rules, plugins, and instructions.
 * Configuration files are viewed through server-side secret redaction.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  BookOpen,
  Box,
  Code2,
  FileText,
  KeyRound,
  PlugZap,
  RefreshCw,
  Server,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { CodexConfigFile, CodexConfigOverview } from "../lib/api";
import { eventBus } from "../lib/eventBus";

type Tab =
  | "overview"
  | "settings"
  | "models"
  | "profiles"
  | "mcp"
  | "projects"
  | "skills"
  | "hooks"
  | "rules"
  | "plugins"
  | "instructions";

const TABS: Array<{ id: Tab; icon: typeof Box }> = [
  { id: "overview", icon: Box },
  { id: "settings", icon: FileText },
  { id: "models", icon: Code2 },
  { id: "profiles", icon: KeyRound },
  { id: "mcp", icon: Server },
  { id: "projects", icon: BookOpen },
  { id: "skills", icon: Wrench },
  { id: "hooks", icon: ShieldCheck },
  { id: "rules", icon: FileText },
  { id: "plugins", icon: PlugZap },
  { id: "instructions", icon: BookOpen },
];

export function CodexConfigExplorer() {
  const { t } = useTranslation("ccConfig");
  const [data, setData] = useState<CodexConfigOverview | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<CodexConfigFile | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.codexConfig.overview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read Codex configuration");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(
    () =>
      eventBus.subscribe((message) => {
        if (message.type === "codex_config_changed") void refresh();
      }),
    [refresh]
  );
  const openFile = useCallback(async (file: string) => {
    setViewer(null);
    setViewerError(null);
    try {
      setViewer(await api.codexConfig.file(file));
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : "Unable to open file");
    }
  }, []);

  const counts = data?.counts || {};
  const overviewCards = useMemo<Array<[string, number | undefined]>>(
    () => [
      ["models", counts.models],
      ["profiles", counts.profiles],
      ["mcp", counts.mcp],
      ["projects", counts.projects],
      ["skills", counts.skills],
      ["hooks", counts.hooks],
      ["rules", counts.rules],
      ["plugins", counts.plugins],
    ],
    [counts]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-100">
            {t("codex.title", "Codex configuration")}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {t("codex.readOnly", "Read-only, with secrets redacted before display.")}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-surface-3 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-1">
        <div className="flex min-w-max gap-1 border-b border-border p-2">
          {TABS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${tab === id ? "bg-accent/15 text-accent" : "text-gray-400 hover:bg-surface-2 hover:text-gray-200"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`codex.tabs.${id}`, id)}
            </button>
          ))}
        </div>
        <div className="p-4">
          {!data && loading ? (
            <p className="text-sm text-gray-500">{t("loading", "Loading…")}</p>
          ) : (
            data && (
              <CodexTab
                data={data}
                tab={tab}
                cards={overviewCards}
                onTab={setTab}
                onOpenFile={openFile}
                t={t}
              />
            )
          )}
        </div>
      </div>
      {(viewer || viewerError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="truncate font-mono text-xs text-gray-200">
                {viewer?.path || t("codex.fileError", "Unable to open configuration file")}
              </p>
              <button
                onClick={() => {
                  setViewer(null);
                  setViewerError(null);
                }}
                className="rounded p-1 text-gray-400 hover:bg-surface-2 hover:text-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {viewerError ? (
              <p className="p-4 text-sm text-red-300">{viewerError}</p>
            ) : (
              <pre className="overflow-auto p-4 text-xs leading-5 text-gray-300">
                {viewer?.text}
              </pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CodexTab({
  data,
  tab,
  cards,
  onTab,
  onOpenFile,
  t,
}: {
  data: CodexConfigOverview;
  tab: Tab;
  cards: Array<[string, number | undefined]>;
  onTab: (tab: Tab) => void;
  onOpenFile: (path: string) => void;
  t: TFunction;
}) {
  if (tab === "overview")
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            {t("codex.home", "Codex home")}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-gray-200">{data.home}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
            <span>
              {t("codex.defaultModel", "Model")}:{" "}
              <b className="text-gray-200">{data.defaults.model || "—"}</b>
            </span>
            <span>
              {t("codex.defaultEffort", "Reasoning")}:{" "}
              <b className="text-gray-200">{data.defaults.reasoningEffort || "—"}</b>
            </span>
            <span>
              {t("codex.personality", "Personality")}:{" "}
              <b className="text-gray-200">{data.defaults.personality || "—"}</b>
            </span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([id, count]) => (
            <button
              key={id}
              onClick={() => onTab(id as Tab)}
              className="rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-accent/40 hover:bg-surface-3"
            >
              <p className="text-xl font-semibold text-gray-100">{count || 0}</p>
              <p className="text-xs text-gray-500">{t(`codex.tabs.${id}`, id)}</p>
            </button>
          ))}
        </div>
      </div>
    );
  if (tab === "settings")
    return (
      <FileRow
        label="config.toml"
        path={data.config.path}
        preview={data.config.text.slice(0, 700)}
        onOpenFile={onOpenFile}
        t={t}
      />
    );
  if (tab === "models")
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {data.models.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="font-mono text-sm text-gray-100">{item.name}</p>
            <p className="mt-1 text-xs text-gray-500">{item.description || item.id}</p>
            <p className="mt-2 text-[11px] text-gray-400">
              {item.efforts.join(" · ") || "—"}
              {item.contextWindow ? ` · ${(item.contextWindow / 1000).toLocaleString()}K` : ""}
            </p>
          </div>
        ))}
      </div>
    );
  if (tab === "profiles")
    return (
      <Rows
        rows={data.profiles.map((item) => ({
          label: pathName(item.path),
          path: item.path,
          preview: `${item.size.toLocaleString()} bytes`,
        }))}
        onOpenFile={onOpenFile}
        t={t}
      />
    );
  if (tab === "mcp")
    return (
      <div className="space-y-2">
        {data.mcp.map((item) => (
          <div key={item.name} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex justify-between gap-3">
              <b className="font-mono text-sm text-gray-100">{item.name}</b>
              <span className={item.enabled ? "text-xs text-emerald-400" : "text-xs text-gray-500"}>
                {item.enabled ? t("codex.enabled", "Enabled") : t("codex.disabled", "Disabled")}
              </span>
            </div>
            <p className="mt-1 break-all text-xs text-gray-500">
              {item.url || item.command || "—"}
            </p>
            {item.envNames.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                {t("codex.envNames", "Environment names")}: {item.envNames.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  if (tab === "projects")
    return (
      <div className="space-y-1">
        {data.projects.map((item) => (
          <div key={item.path} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <p className="text-sm text-gray-100">{item.name}</p>
            <p className="break-all font-mono text-[11px] text-gray-500">{item.path}</p>
          </div>
        ))}
      </div>
    );
  if (tab === "skills")
    return (
      <Rows
        rows={data.skills.map((item) => ({
          label: item.name,
          path: item.file,
          preview: item.preview,
        }))}
        onOpenFile={onOpenFile}
        t={t}
      />
    );
  if (tab === "hooks")
    return (
      <div className="space-y-2">
        <FileRow
          label="hooks.json"
          path={data.hooks.file}
          preview={data.hooks.items.map((item) => `${item.event} · ${item.groups}`).join("\n")}
          onOpenFile={onOpenFile}
          t={t}
        />
      </div>
    );
  if (tab === "rules")
    return (
      <Rows
        rows={data.rules.map((item) => ({
          label: item.name,
          path: item.file,
          preview: item.preview,
        }))}
        onOpenFile={onOpenFile}
        t={t}
      />
    );
  if (tab === "plugins")
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {data.plugins.map((item) => (
          <div key={item.path} className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm text-gray-100">{item.name}</p>
            <p className="break-all font-mono text-[11px] text-gray-500">{item.path}</p>
          </div>
        ))}
      </div>
    );
  return (
    <Rows
      rows={data.instructions.map((item) => ({
        label: item.name,
        path: item.path,
        preview: item.preview,
      }))}
      onOpenFile={onOpenFile}
      t={t}
    />
  );
}
function Rows({
  rows,
  onOpenFile,
  t,
}: {
  rows: Array<{ label: string; path: string; preview: string }>;
  onOpenFile: (path: string) => void;
  t: TFunction;
}) {
  if (!rows.length)
    return (
      <p className="text-sm text-gray-500">{t("codex.empty", "Nothing configured here yet.")}</p>
    );
  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <FileRow key={item.path} {...item} onOpenFile={onOpenFile} t={t} />
      ))}
    </div>
  );
}
function FileRow({
  label,
  path,
  preview,
  onOpenFile,
  t,
}: {
  label: string;
  path: string;
  preview: string;
  onOpenFile: (path: string) => void;
  t: TFunction;
}) {
  return (
    <button
      onClick={() => void onOpenFile(path)}
      className="w-full rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-accent/40 hover:bg-surface-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-gray-100">{label}</p>
        <span className="text-xs text-accent">{t("codex.viewFile", "View file")}</span>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-gray-500">
        {preview || path}
      </p>
    </button>
  );
}
function pathName(value: string) {
  return value.split("/").pop() || value;
}
