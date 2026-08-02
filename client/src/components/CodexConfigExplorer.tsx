/**
 * @file Codex configuration workspace with a parity navigation model, live
 * overview metrics, redacted previews, and backup-backed editing for Codex's
 * user-maintained config, hooks, rules, skills, and instruction files.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  FolderTree,
  KeyRound,
  Pencil,
  PlugZap,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { CodexConfigEditableFile, CodexConfigFile, CodexConfigOverview } from "../lib/api";
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

type SummaryTab = Exclude<Tab, "overview" | "settings">;

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

interface PreviewState {
  file: CodexConfigFile;
  editable: boolean;
}

export function CodexConfigExplorer() {
  const { t } = useTranslation("ccConfig");
  const [data, setData] = useState<CodexConfigOverview | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewer, setViewer] = useState<PreviewState | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [editor, setEditor] = useState<CodexConfigEditableFile | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [openingEditor, setOpeningEditor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.codexConfig.overview());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("codex.fileError", "Unable to read Codex configuration")
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

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

  const openFile = useCallback(async (file: string, editable = false) => {
    setViewer(null);
    setViewerError(null);
    try {
      setViewer({ file: await api.codexConfig.file(file), editable });
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : "Unable to open file");
    }
  }, []);

  const openEditor = useCallback(async (file: string) => {
    setEditor(null);
    setEditorError(null);
    setOpeningEditor(file);
    try {
      setEditor(await api.codexConfig.editFile(file));
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Unable to open file for editing");
    } finally {
      setOpeningEditor(null);
    }
  }, []);

  const saveEditor = useCallback(async () => {
    if (!editor || saving) return;
    setSaving(true);
    setEditorError(null);
    try {
      const result = await api.codexConfig.writeFile({ path: editor.path, content: editor.text });
      setEditor(null);
      setNotice(
        result.backupPath
          ? t("codex.savedBackup", "Saved. A timestamped backup was created before the update.")
          : t("codex.saved", "Saved.")
      );
      await refresh();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Unable to save file");
    } finally {
      setSaving(false);
    }
  }, [editor, refresh, saving, t]);

  const counts = data?.counts || {};
  const overviewCards = useMemo<Array<[SummaryTab, number | undefined]>>(
    () => [
      ["models", counts.models],
      ["profiles", counts.profiles],
      ["mcp", counts.mcp],
      ["projects", counts.projects],
      ["skills", counts.skills],
      ["hooks", counts.hooks],
      ["rules", counts.rules],
      ["plugins", counts.plugins],
      ["instructions", counts.instructions],
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
            {t("codex.description", "Local settings, models, tools, and instructions.")}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-surface-3 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("refreshing", "Refreshing…") : t("refresh", "Refresh")}
        </button>
      </div>

      {error && <StatusNotice kind="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <StatusNotice kind="success" message={notice} onDismiss={() => setNotice(null)} />}

      <CodexTabs current={tab} onSelect={setTab} counts={counts} t={t} />
      <div className="rounded-xl border border-border bg-surface-1">
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
                onEditFile={openEditor}
                openingEditor={openingEditor}
                t={t}
              />
            )
          )}
        </div>
      </div>

      {(viewer || viewerError) && (
        <PreviewModal
          state={viewer}
          error={viewerError}
          onClose={() => {
            setViewer(null);
            setViewerError(null);
          }}
          onEdit={
            viewer?.editable
              ? () => {
                  setViewer(null);
                  void openEditor(viewer.file.path);
                }
              : undefined
          }
          t={t}
        />
      )}
      {(editor || editorError) && (
        <EditorModal
          state={editor}
          error={editorError}
          saving={saving}
          onChange={(text) => setEditor((current) => (current ? { ...current, text } : current))}
          onClose={() => {
            if (saving) return;
            setEditor(null);
            setEditorError(null);
          }}
          onSave={() => void saveEditor()}
          t={t}
        />
      )}
    </section>
  );
}

function CodexTabs({
  current,
  onSelect,
  counts,
  t,
}: {
  current: Tab;
  onSelect: (tab: Tab) => void;
  counts: Record<string, number>;
  t: TFunction;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateAffordances = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 1);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateAffordances();
    const element = scrollRef.current;
    if (!element) return;
    element.addEventListener("scroll", updateAffordances, { passive: true });
    const observer = new ResizeObserver(updateAffordances);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", updateAffordances);
      observer.disconnect();
    };
  }, [updateAffordances]);

  useEffect(() => {
    const element = scrollRef.current;
    const active = element?.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!element || !active) return;
    const bounds = element.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    if (activeBounds.left < bounds.left + 8) {
      element.scrollBy({ left: activeBounds.left - bounds.left - 16, behavior: "smooth" });
    } else if (activeBounds.right > bounds.right - 8) {
      element.scrollBy({ left: activeBounds.right - bounds.right + 16, behavior: "smooth" });
    }
  }, [current]);

  const move = (direction: 1 | -1) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(200, element.clientWidth * 0.6),
      behavior: "smooth",
    });
  };

  return (
    <div className="relative rounded-xl border border-border bg-surface-1">
      <div
        className={`pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-12 rounded-l-xl bg-gradient-to-r from-surface-1 to-transparent transition-opacity ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
      />
      {canScrollLeft && (
        <button
          onClick={() => move(-1)}
          aria-label={t("codex.scrollLeft", "Scroll configuration tabs left")}
          className="absolute left-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface-2 text-gray-300 hover:bg-surface-3 hover:text-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scroll-smooth p-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map(({ id, icon: Icon }) => {
          const active = current === id;
          const count = id === "overview" || id === "settings" ? null : counts[id];
          return (
            <button
              key={id}
              data-tab-active={active ? "true" : undefined}
              onClick={() => onSelect(id)}
              className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-accent/30 bg-accent/15 text-accent"
                  : "border-transparent text-gray-400 hover:bg-surface-3 hover:text-gray-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t(`codex.tabs.${id}`, id)}</span>
              {count !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    active ? "bg-accent/20 text-accent" : "bg-surface-3 text-gray-400"
                  }`}
                >
                  {count || 0}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className={`pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-12 rounded-r-xl bg-gradient-to-l from-surface-1 to-transparent transition-opacity ${canScrollRight ? "opacity-100" : "opacity-0"}`}
      />
      {canScrollRight && (
        <button
          onClick={() => move(1)}
          aria-label={t("codex.scrollRight", "Scroll configuration tabs right")}
          className="absolute right-1 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface-2 text-gray-300 hover:bg-surface-3 hover:text-gray-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function CodexTab({
  data,
  tab,
  cards,
  onTab,
  onOpenFile,
  onEditFile,
  openingEditor,
  t,
}: {
  data: CodexConfigOverview;
  tab: Tab;
  cards: Array<[SummaryTab, number | undefined]>;
  onTab: (tab: Tab) => void;
  onOpenFile: (path: string, editable?: boolean) => void;
  onEditFile: (path: string) => void;
  openingEditor: string | null;
  t: TFunction;
}) {
  if (tab === "overview") {
    return (
      <div className="space-y-5">
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t("codex.overviewTitle", "Configuration overview")}
          </h2>
          <div className="grid gap-2 xl:grid-cols-5">
            <CodexRootCard home={data.home} t={t} />
            <CodexDefaultStat
              icon={Code2}
              tone="violet"
              label={t("codex.defaultModel", "Model")}
              value={data.defaults.model}
            />
            <CodexDefaultStat
              icon={Wrench}
              tone="amber"
              label={t("codex.defaultEffort", "Reasoning")}
              value={data.defaults.reasoningEffort}
            />
            <CodexDefaultStat
              icon={KeyRound}
              tone="teal"
              label={t("codex.personality", "Personality")}
              value={data.defaults.personality}
            />
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {t("overview.summary", "Quick summary")}
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {cards.map(([id, count]) => {
              const Icon = TABS.find((entry) => entry.id === id)?.icon || Box;
              return (
                <CodexSummaryStat
                  key={id}
                  icon={Icon}
                  tone={CODEX_SUMMARY_TONES[id]}
                  label={t(`codex.tabs.${id}`, id)}
                  value={count || 0}
                  onClick={() => onTab(id)}
                />
              );
            })}
          </div>
        </section>
      </div>
    );
  }
  if (tab === "settings") {
    return (
      <FileRow
        label="config.toml"
        path={data.config.path}
        preview={data.config.text.slice(0, 700)}
        editable
        onOpenFile={onOpenFile}
        onEditFile={onEditFile}
        openingEditor={openingEditor === data.config.path}
        t={t}
      />
    );
  }
  if (tab === "models") {
    if (!data.models.items.length) return <EmptyState t={t} />;
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {data.models.items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-gray-100">{item.name}</p>
                <p className="mt-1 text-xs text-gray-500">{item.description || item.id}</p>
              </div>
              {!item.visible && (
                <span className="text-[10px] text-gray-500">{t("codex.hidden", "Hidden")}</span>
              )}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              {item.efforts.join(" · ") || "—"}
              {item.contextWindow ? ` · ${(item.contextWindow / 1000).toLocaleString()}K` : ""}
            </p>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "profiles") {
    return (
      <Rows
        rows={data.profiles.map((item) => ({
          label: pathName(item.path),
          path: item.path,
          preview: `${item.size.toLocaleString()} bytes`,
        }))}
        onOpenFile={onOpenFile}
        onEditFile={onEditFile}
        openingEditor={openingEditor}
        t={t}
      />
    );
  }
  if (tab === "mcp") {
    if (!data.mcp.length) return <EmptyState t={t} />;
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {data.mcp.map((item) => (
          <div key={item.name} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <b className="font-mono text-sm text-gray-100">{item.name}</b>
              <span className={item.enabled ? "text-xs text-emerald-400" : "text-xs text-gray-500"}>
                {item.enabled ? t("codex.enabled", "Enabled") : t("codex.disabled", "Disabled")}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-gray-500">
              {item.url || item.command || "—"}
            </p>
            {item.envNames.length > 0 && (
              <p className="mt-2 text-[11px] text-gray-500">
                {t("codex.envNames", "Environment names")}: {item.envNames.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (tab === "projects") {
    if (!data.projects.length) return <EmptyState t={t} />;
    return (
      <div className="space-y-2">
        {data.projects.map((item) => (
          <div key={item.path} className="rounded-xl border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-sm font-medium text-gray-100">{item.name}</p>
            <p className="mt-1 break-all font-mono text-[11px] text-gray-500">{item.path}</p>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "skills") {
    return (
      <Rows
        rows={data.skills.map((item) => ({
          label: item.name,
          path: item.file,
          preview: item.preview,
        }))}
        editable
        onOpenFile={onOpenFile}
        onEditFile={onEditFile}
        openingEditor={openingEditor}
        t={t}
      />
    );
  }
  if (tab === "hooks") {
    return (
      <FileRow
        label="hooks.json"
        path={data.hooks.file}
        preview={data.hooks.items.map((item) => `${item.event} · ${item.groups}`).join("\n")}
        editable
        onOpenFile={onOpenFile}
        onEditFile={onEditFile}
        openingEditor={openingEditor === data.hooks.file}
        t={t}
      />
    );
  }
  if (tab === "rules") {
    return (
      <Rows
        rows={data.rules.map((item) => ({
          label: item.name,
          path: item.file,
          preview: item.preview,
        }))}
        editable
        onOpenFile={onOpenFile}
        onEditFile={onEditFile}
        openingEditor={openingEditor}
        t={t}
      />
    );
  }
  if (tab === "plugins") {
    if (!data.plugins.length) return <EmptyState t={t} />;
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {data.plugins.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{item.displayName}</p>
                <p className="mt-1 text-[11px] text-gray-500">{item.marketplaceLabel}</p>
              </div>
              <span
                className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                  item.enabled
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-500/25 bg-gray-500/10 text-gray-400"
                }`}
              >
                {item.enabled ? t("codex.enabled", "Enabled") : t("codex.disabled", "Disabled")}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">
              {item.description || t("codex.noDescription", "No description provided.")}
            </p>
            {item.version && (
              <p className="mt-3 font-mono text-[11px] text-gray-500">v{item.version}</p>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <Rows
      rows={data.instructions.map((item) => ({
        label: item.name,
        path: item.path,
        preview: item.preview,
      }))}
      editable
      onOpenFile={onOpenFile}
      onEditFile={onEditFile}
      openingEditor={openingEditor}
      t={t}
    />
  );
}

type CodexTone =
  | "violet"
  | "sky"
  | "amber"
  | "teal"
  | "fuchsia"
  | "orange"
  | "rose"
  | "emerald"
  | "indigo";

const CODEX_TONES: Record<
  CodexTone,
  { iconBg: string; iconText: string; bar: string; hoverBorder: string }
> = {
  violet: {
    iconBg: "bg-violet-500/10",
    iconText: "text-violet-300",
    bar: "bg-violet-500/40",
    hoverBorder: "hover:border-violet-500/35",
  },
  sky: {
    iconBg: "bg-sky-500/10",
    iconText: "text-sky-300",
    bar: "bg-sky-500/40",
    hoverBorder: "hover:border-sky-500/35",
  },
  amber: {
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-300",
    bar: "bg-amber-500/40",
    hoverBorder: "hover:border-amber-500/35",
  },
  teal: {
    iconBg: "bg-teal-500/10",
    iconText: "text-teal-300",
    bar: "bg-teal-500/40",
    hoverBorder: "hover:border-teal-500/35",
  },
  fuchsia: {
    iconBg: "bg-fuchsia-500/10",
    iconText: "text-fuchsia-300",
    bar: "bg-fuchsia-500/40",
    hoverBorder: "hover:border-fuchsia-500/35",
  },
  orange: {
    iconBg: "bg-orange-500/10",
    iconText: "text-orange-300",
    bar: "bg-orange-500/40",
    hoverBorder: "hover:border-orange-500/35",
  },
  rose: {
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-300",
    bar: "bg-rose-500/40",
    hoverBorder: "hover:border-rose-500/35",
  },
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-300",
    bar: "bg-emerald-500/40",
    hoverBorder: "hover:border-emerald-500/35",
  },
  indigo: {
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-300",
    bar: "bg-indigo-500/40",
    hoverBorder: "hover:border-indigo-500/35",
  },
};

const CODEX_SUMMARY_TONES: Record<SummaryTab, CodexTone> = {
  models: "violet",
  profiles: "amber",
  mcp: "indigo",
  projects: "sky",
  skills: "fuchsia",
  hooks: "orange",
  rules: "rose",
  plugins: "emerald",
  instructions: "teal",
};

function CodexRootCard({ home, t }: { home: string; t: TFunction }) {
  const tone = CODEX_TONES.sky;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface-2 xl:col-span-2">
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${tone.bar}`} aria-hidden />
      <div className="flex min-h-[84px] items-center gap-3 px-4 py-3 pl-5">
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${tone.iconBg}`}
        >
          <FolderTree className={`h-4 w-4 ${tone.iconText}`} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {t("codex.home", "Codex home")}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-gray-100" title={home}>
            {home}
          </p>
        </div>
      </div>
    </div>
  );
}

function CodexDefaultStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Box;
  tone: CodexTone;
  label: string;
  value: string | null;
}) {
  const palette = CODEX_TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${palette.bar}`} aria-hidden />
      <div className="min-h-[84px] px-3 py-2.5 pl-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${palette.iconBg}`}
          >
            <Icon className={`h-3.5 w-3.5 ${palette.iconText}`} />
          </span>
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {label}
          </span>
        </div>
        <p
          className="mt-2 truncate font-mono text-sm font-semibold text-gray-100"
          title={value || "—"}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function CodexSummaryStat({
  icon: Icon,
  tone,
  label,
  value,
  onClick,
}: {
  icon: typeof Box;
  tone: CodexTone;
  label: string;
  value: number;
  onClick: () => void;
}) {
  const palette = CODEX_TONES[tone];
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border border-border bg-surface-2 text-left transition-colors hover:bg-surface-3 ${palette.hoverBorder}`}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${palette.bar}`} aria-hidden />
      <div className="px-3 py-2.5 pl-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${palette.iconBg}`}
          >
            <Icon className={`h-3.5 w-3.5 ${palette.iconText}`} />
          </span>
          <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {label}
          </span>
        </div>
        <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-100">{value}</p>
      </div>
    </button>
  );
}

function Rows({
  rows,
  editable = false,
  onOpenFile,
  onEditFile,
  openingEditor,
  t,
}: {
  rows: Array<{ label: string; path: string; preview: string }>;
  editable?: boolean;
  onOpenFile: (path: string, editable?: boolean) => void;
  onEditFile: (path: string) => void;
  openingEditor: string | null;
  t: TFunction;
}) {
  if (!rows.length) return <EmptyState t={t} />;
  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <FileRow
          key={item.path}
          {...item}
          editable={editable}
          onOpenFile={onOpenFile}
          onEditFile={onEditFile}
          openingEditor={openingEditor === item.path}
          t={t}
        />
      ))}
    </div>
  );
}

function FileRow({
  label,
  path,
  preview,
  editable = false,
  onOpenFile,
  onEditFile,
  openingEditor,
  t,
}: {
  label: string;
  path: string;
  preview: string;
  editable?: boolean;
  onOpenFile: (path: string, editable?: boolean) => void;
  onEditFile: (path: string) => void;
  openingEditor: boolean;
  t: TFunction;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => onOpenFile(path, editable)}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <p className="truncate text-sm font-medium text-gray-100">{label}</p>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
            {preview || path}
          </p>
        </button>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={() => onOpenFile(path, editable)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
          >
            {t("codex.viewFile", "View")}
          </button>
          {editable && (
            <button
              onClick={() => onEditFile(path)}
              disabled={openingEditor}
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
            >
              <Pencil className="h-3 w-3" />
              {openingEditor ? t("loading", "Loading…") : t("codex.editFile", "Edit")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: TFunction }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-gray-500">
      {t("codex.empty", "Nothing configured here yet.")}
    </p>
  );
}

function PreviewModal({
  state,
  error,
  onClose,
  onEdit,
  t,
}: {
  state: PreviewState | null;
  error: string | null;
  onClose: () => void;
  onEdit?: () => void;
  t: TFunction;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-gray-200">
              {state?.file.path || t("codex.fileError", "Unable to open configuration file")}
            </p>
            {state && (
              <p className="mt-0.5 text-[11px] text-gray-500">
                {t("codex.redactedPreview", "Preview values are redacted where needed.")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
              >
                <Pencil className="h-3 w-3" />
                {t("codex.editFile", "Edit")}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t("common.close", "Close")}
              className="rounded p-1 text-gray-400 hover:bg-surface-2 hover:text-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error ? (
          <p className="p-4 text-sm text-red-300">{error}</p>
        ) : (
          <pre className="overflow-auto p-4 text-xs leading-5 text-gray-300">
            {state?.file.text}
          </pre>
        )}
      </div>
    </div>
  );
}

function EditorModal({
  state,
  error,
  saving,
  onChange,
  onClose,
  onSave,
  t,
}: {
  state: CodexConfigEditableFile | null;
  error: string | null;
  saving: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
  t: TFunction;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-100">
              {t("codex.editTitle", "Edit configuration file")}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500">
              {state?.path || t("codex.fileError", "Unable to open configuration file")}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label={t("common.close", "Close")}
            className="rounded p-1 text-gray-400 hover:bg-surface-2 hover:text-gray-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            <p>
              {t(
                "codex.syntaxWarning",
                "Codex reads this file directly. The dashboard cannot validate TOML, JSON, hook, rule, skill, or instruction syntax—review every edit carefully before saving. A timestamped backup is created first."
              )}
            </p>
          </div>
        </div>
        {error && (
          <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {state && (
          <textarea
            value={state.text}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            className="min-h-[28rem] flex-1 resize-none bg-surface-0 p-4 font-mono text-xs leading-5 text-gray-200 outline-none placeholder:text-gray-600 focus:bg-surface-1"
          />
        )}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-surface-3 disabled:opacity-60"
          >
            {t("codex.cancel", "Cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={!state || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? t("codex.saving", "Saving…") : t("codex.save", "Save changes")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusNotice({
  kind,
  message,
  onDismiss,
}: {
  kind: "error" | "success";
  message: string;
  onDismiss: () => void;
}) {
  const success = kind === "success";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${success ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-red-500/40 bg-red-500/10 text-red-200"}`}
    >
      {success ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      )}
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function pathName(value: string) {
  return value.split("/").pop() || value;
}
