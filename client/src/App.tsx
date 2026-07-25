/**
 * @file App.tsx
 * @description Top-level React tree for the Claude Code Agent Monitor dashboard.
 * Wires together routing, real-time WebSocket ingestion, browser notifications,
 * and the splash screen shown on cold load.
 *
 * ## Data flow
 * 1. {@link useWebSocket} connects to the server's `/ws` endpoint.
 * 2. Each inbound {@link WSMessage} is published on the in-memory
 *    {@link eventBus} so any page can subscribe without prop drilling.
 * 3. {@link useNotifications} listens for alert-worthy events and surfaces OS
 *    notifications when permitted.
 *
 * ## Routing
 * All feature pages nest under {@link Layout}, which owns the sidebar and
 * passes `wsConnected` for the connection badge. Unknown paths fall through to
 * {@link NotFound}.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useCallback } from "react";
import { Layout } from "./components/Layout";
import { SplashScreen } from "./components/SplashScreen";
import { Dashboard } from "./pages/Dashboard";
import { KanbanBoard } from "./pages/KanbanBoard";
import { Sessions } from "./pages/Sessions";
import { SessionDetail } from "./pages/SessionDetail";
import { ActivityFeed } from "./pages/ActivityFeed";
import { Analytics } from "./pages/Analytics";
import { Workflows } from "./pages/Workflows";
import { Settings } from "./pages/Settings";
import { CcConfig } from "./pages/CcConfig";
import { Run } from "./pages/Run";
import { NotFound } from "./pages/NotFound";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { eventBus } from "./lib/eventBus";
import type { WSMessage } from "./lib/types";

/**
 * Application root component mounted by {@link main.tsx}.
 * @returns Routed dashboard UI inside `BrowserRouter`.
 */
export default function App() {
  const onMessage = useCallback((msg: WSMessage) => {
    eventBus.publish(msg);
  }, []);

  const { connected } = useWebSocket(onMessage);
  useNotifications();

  return (
    <>
      <SplashScreen />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout wsConnected={connected} />}>
            <Route index element={<Dashboard />} />
            <Route path="kanban" element={<KanbanBoard />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
            <Route path="activity" element={<ActivityFeed />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="workflows" element={<Workflows />} />
            <Route path="cc-config" element={<CcConfig />} />
            <Route path="run" element={<Run />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}
