/**
 * @file MermaidDiagram.tsx
 * @description Renders one Mermaid source block as an SVG inside the
 * Documentation page. Mermaid is a large dependency, so it is imported
 * dynamically on first use: the main bundle never pays for it, and a user who
 * never opens the manual never downloads it. The diagram re-renders when the
 * effective theme flips, so a light-theme reader does not get dark-on-dark
 * diagrams. A source block that Mermaid cannot parse degrades to the raw text
 * rather than blanking the page.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useEffect, useRef, useState } from "react";
import { getEffectiveTheme, subscribeToThemePrefs } from "../lib/theme";

/** Module-level promise so the ~3 MB bundle is fetched and initialized once. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(theme: "dark" | "light") {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidPromise.then((mermaid) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "default",
      fontFamily: "inherit",
    });
    return mermaid;
  });
}

let diagramSeq = 0;

export function MermaidDiagram({ source }: { source: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState(getEffectiveTheme);
  const idRef = useRef(`mermaid-${(diagramSeq += 1)}`);

  useEffect(() => {
    const sync = () => setTheme(getEffectiveTheme());
    const unsubscribe = subscribeToThemePrefs(sync);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", sync);
    return () => {
      unsubscribe();
      media?.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadMermaid(theme)
      .then((mermaid) => mermaid.render(idRef.current, source))
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs text-gray-400">
        <code>{source}</code>
      </pre>
    );
  }

  if (svg === null) {
    return <div className="h-24 animate-pulse rounded-lg border border-border bg-surface-2" />;
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid output is generated from the repository's own documentation and
      // rendered with securityLevel "strict", which strips scripts and inline
      // handlers from the source before it becomes SVG.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
