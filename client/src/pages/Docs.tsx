/**
 * @file Docs.tsx
 * @description Documentation page: renders the repository's Markdown manual
 * (`docs/*.md`, served read-only by `server/routes/manual.js`) inside the
 * dashboard, so the reference material lives in the app instead of behind a
 * link to a separate static site. A table of contents lists the documents; the
 * selected one is rendered with the app's own typography, its Mermaid blocks
 * become diagrams, and its cross-document links switch documents in place.
 *
 * The manual is the repository's English source; only the page's own chrome is
 * translated. Links pointing outside the manual are rendered as inert paths
 * rather than as links that would resolve to nothing.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, BookOpen, FileText } from "lucide-react";
import { api } from "../lib/api";
import type { ManualDocument, ManualDocumentSummary } from "../lib/types";
import { MermaidDiagram } from "../components/MermaidDiagram";

/** Heading text -> anchor id, so in-document `#links` resolve. */
function slugifyHeading(children: React.ReactNode): string {
  return String(children)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** `./HOOKS.md#anchor` -> `{ slug: "hooks", hash: "anchor" }`; null when the
 *  target is not a document of this manual. */
function manualTarget(href: string, known: Set<string>): { slug: string; hash: string } | null {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("//")) return null;
  const [pathPart = "", hash = ""] = href.split("#");
  if (!pathPart.endsWith(".md")) return null;
  const fileName = pathPart.split("/").pop() ?? "";
  const slug = fileName.slice(0, -3).toLowerCase();
  return known.has(slug) ? { slug, hash } : null;
}

export function Docs() {
  const { t } = useTranslation("docs");
  const [documents, setDocuments] = useState<ManualDocumentSummary[]>([]);
  const [current, setCurrent] = useState<ManualDocument | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.manual
      .list()
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.documents);
        setActiveSlug((previous) => previous ?? res.documents[0]?.slug ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    setError(null);
    api.manual
      .get(activeSlug)
      .then((doc) => {
        if (cancelled) return;
        setCurrent(doc);
        // A document switch starts at the top; an in-page anchor is handled by
        // the browser once the new content is mounted.
        window.scrollTo({ top: 0 });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const knownSlugs = useMemo(() => new Set(documents.map((doc) => doc.slug)), [documents]);

  const openDocument = useCallback((slug: string, hash: string) => {
    setActiveSlug(slug);
    if (!hash) return;
    // The target document renders on the next tick; scroll once it exists.
    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const components = useMemo(
    () => ({
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1
          id={slugifyHeading(children)}
          className="mt-8 scroll-mt-24 text-xl font-semibold tracking-tight text-gray-50 first:mt-0"
        >
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2
          id={slugifyHeading(children)}
          className="mt-8 scroll-mt-24 border-b border-border pb-1.5 text-base font-semibold text-gray-100"
        >
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3
          id={slugifyHeading(children)}
          className="mt-6 scroll-mt-24 text-sm font-semibold text-gray-100"
        >
          {children}
        </h3>
      ),
      p: ({ children }: { children?: React.ReactNode }) => (
        <p className="mt-3 text-sm leading-relaxed text-gray-300">{children}</p>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-300">{children}</ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-300">{children}</ol>
      ),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-sm text-gray-400">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-6 border-border" />,
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">{children}</table>
        </div>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold text-gray-200">
          {children}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="border-b border-border/60 px-3 py-2 align-top text-gray-300">{children}</td>
      ),
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const target = href ? manualTarget(href, knownSlugs) : null;
        if (target) {
          return (
            <button
              type="button"
              onClick={() => openDocument(target.slug, target.hash)}
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              {children}
            </button>
          );
        }
        if (href && (/^https?:/i.test(href) || href.startsWith("#"))) {
          return (
            <a
              href={href}
              target={href.startsWith("#") ? undefined : "_blank"}
              rel={href.startsWith("#") ? undefined : "noopener noreferrer"}
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              {children}
            </a>
          );
        }
        // Repository paths outside the manual: showing them as links would
        // promise a destination this page cannot serve.
        return (
          <span title={href} className="text-gray-400 underline decoration-dotted">
            {children}
          </span>
        );
      },
      code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
        const source = String(children ?? "").replace(/\n$/, "");
        if (className === "language-mermaid") return <MermaidDiagram source={source} />;
        if (!className) {
          return (
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em] text-gray-200">
              {children}
            </code>
          );
        }
        return (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3">
            <code className="font-mono text-xs text-gray-200">{source}</code>
          </pre>
        );
      },
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    }),
    [knownSlugs, openDocument]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="card h-96 animate-pulse bg-surface-2" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="card flex flex-col items-center justify-center gap-3 py-16">
          <BookOpen className="h-10 w-10 text-gray-600" />
          <p className="text-sm text-gray-400">{t("empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t("contents")} className="card h-fit p-2 lg:sticky lg:top-4">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {t("contents")}
          </p>
          {documents.map((doc) => {
            const active = doc.slug === activeSlug;
            return (
              <button
                key={doc.slug}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveSlug(doc.slug)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "border border-accent/20 bg-accent/10 text-accent"
                    : "border border-transparent text-gray-400 hover:bg-surface-3 hover:text-gray-200"
                }`}
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{doc.title}</span>
              </button>
            );
          })}
        </nav>

        <article className="card min-w-0 p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
          {current && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {current.markdown}
            </ReactMarkdown>
          )}
        </article>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-50">
        <BookOpen className="h-5 w-5 text-accent" aria-hidden />
        {title}
      </h1>
      <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}
