/**
 * @file Layout.tsx
 * @description Application shell that frames every authenticated route: persistent
 * sidebar, main content column, update notifier, and the Tabby assistant overlay.
 * The layout is the single parent route in {@link App} — child pages render inside
 * React Router's `<Outlet />` so navigation never remounts chrome.
 *
 * ## Sidebar persistence
 * Collapsed state is read once from `localStorage` via {@link loadCollapsed} and
 * written back on every toggle. Failures to access storage are swallowed so a
 * private-browsing quota error never breaks the UI.
 *
 * ## Sticky descendants
 * The inner content wrapper uses `overflow-x-clip` (not `hidden`) so horizontal
 * overflow is clipped without creating a scroll container. That keeps `position:
 * sticky` elements — e.g. the Settings page table-of-contents — pinned to the
 * viewport rather than a nested scroll box.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SIDEBAR_STORAGE_KEY, loadCollapsed } from "./Sidebar";
import { UpdateNotifier } from "./UpdateNotifier";
import { Tabby } from "./Tabby/Tabby";

/** Props for {@link Layout}. */
interface LayoutProps {
  /** Live WebSocket status forwarded to the sidebar connection indicator. */
  wsConnected: boolean;
}

/**
 * Root layout wrapping all dashboard routes.
 * @param props See {@link LayoutProps}.
 */
export function Layout({ wsConnected }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-surface-0">
      <UpdateNotifier />
      <Tabby />
      <Sidebar wsConnected={wsConnected} collapsed={collapsed} onToggle={toggle} />
      <main
        className="min-h-screen min-w-0 transition-[margin-left,width] duration-200"
        style={{
          marginLeft: collapsed ? "4.25rem" : "15rem",
          width: collapsed ? "calc(100% - 4.25rem)" : "calc(100% - 15rem)",
        }}
      >
        {/* overflow-x-clip (not -hidden) clips horizontal overflow without
            creating a scroll container, so descendant `position: sticky`
            elements (e.g. the Settings page TOC) still pin to the window. */}
        <div className="p-5 lg:p-6 max-w-full overflow-x-clip">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
