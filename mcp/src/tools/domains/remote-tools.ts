/**
 * @file remote-tools.ts
 * @description MCP tools for Remote Data Sources — list configured SSH sources
 * and trigger on-demand syncs so agents can operate remotes without the UI/CLI.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { z } from "zod";
import { createToolRegistrar } from "../../core/tool-registry.js";
import { assertMutationsEnabled } from "../../policy/tool-guards.js";
import type { ToolContext } from "../../types/tool-context.js";

/**
 * Registers remote-source tools against `/api/remote-sources/*`.
 * List is read-only; sync tools require the mutations policy gate.
 */
export function registerRemoteTools(context: ToolContext): void {
  const { api, logger, server, config } = context;
  const register = createToolRegistrar(server, logger);

  register(
    "dashboard_list_remote_sources",
    "List configured Remote Data Sources (SSH machines) with status and last sync.",
    {},
    async () => api.get("/api/remote-sources")
  );

  register(
    "dashboard_sync_remote_source",
    "Trigger an immediate SSH pull+import for one Remote Data Source by id.",
    {
      source_id: z.string().min(1).describe("Remote source id (src_…)"),
    },
    async (args) => {
      assertMutationsEnabled(config);
      const id = encodeURIComponent(args.source_id as string);
      return api.post(`/api/remote-sources/${id}/sync`);
    }
  );

  register(
    "dashboard_sync_all_remote_sources",
    "Trigger an immediate SSH pull+import for every enabled Remote Data Source.",
    {},
    async () => {
      assertMutationsEnabled(config);
      return api.post("/api/remote-sources/sync-all");
    }
  );
}
