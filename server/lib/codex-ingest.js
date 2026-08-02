/**
 * @file Incrementally ingests Codex rollout JSONL transcripts into dashboard
 * sessions, events, and cost buckets. The byte cursor and cumulative counter
 * snapshot make watcher and hook notifications idempotent and real-time safe.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const path = require("path");
const { db, stmts } = require("../db");
const { getCodexSessionsDir } = require("./codex-home");

const MAX_EVENT_SUMMARY = 500;
const CONTEXT_SHORT_LIMIT = 272000;
const EVENT_TYPES = new Set([
  "user_message",
  "task_started",
  "task_complete",
  "exec_command_end",
  "mcp_tool_call_end",
  "web_search_end",
  "turn_aborted",
  "context_compacted",
]);

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function sessionIdFromPath(transcriptPath) {
  const match = path.basename(transcriptPath).match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i);
  return match ? match[1] : null;
}

function isCodexTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath.endsWith(".jsonl")) return false;
  const root = path.resolve(getCodexSessionsDir());
  const candidate = path.resolve(transcriptPath);
  return candidate.startsWith(`${root}${path.sep}`);
}

function findCodexTranscripts(root = getCodexSessionsDir()) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (
        entry.isFile() &&
        entry.name.startsWith("rollout-") &&
        entry.name.endsWith(".jsonl")
      ) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function extractText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function truncate(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_EVENT_SUMMARY ? `${text.slice(0, MAX_EVENT_SUMMARY - 1)}…` : text;
}

function eventDetails(record) {
  const payload = record.payload || {};
  switch (payload.type) {
    case "user_message":
      return { summary: truncate(payload.message), tool: null };
    case "exec_command_end":
      return {
        summary: truncate(payload.command || payload.output || "Command completed"),
        tool: "Bash",
      };
    case "mcp_tool_call_end":
      return { summary: truncate(payload.name || "MCP tool completed"), tool: "MCP" };
    case "web_search_end":
      return { summary: truncate(payload.query || "Web search completed"), tool: "WebSearch" };
    default:
      return { summary: truncate(payload.message || payload.type || "Codex event"), tool: null };
  }
}

function eventSpeed(record) {
  const tier =
    record?.payload?.service_tier ||
    record?.payload?.serviceTier ||
    record?.payload?.thread_settings?.service_tier ||
    record?.payload?.thread_settings?.serviceTier;
  return tier === "fast" || tier === "priority" ? "fast" : "standard";
}

function persistEvent(sessionId, agentId, record) {
  if (record.type !== "event_msg" || !EVENT_TYPES.has(record.payload?.type)) return null;
  const { summary, tool } = eventDetails(record);
  const info = stmts.insertEvent.run(
    sessionId,
    agentId,
    `codex_${record.payload.type}`,
    tool,
    summary,
    JSON.stringify({ provider: "codex", event: record.payload.type, timestamp: record.timestamp })
  );
  return db.prepare("SELECT * FROM events WHERE id = ?").get(info.lastInsertRowid);
}

function createCodexSession(meta, transcriptPath) {
  const sessionId = meta?.id || sessionIdFromPath(transcriptPath);
  if (!sessionId) return null;
  let session = stmts.getSession.get(sessionId);
  if (session) return session;

  const startedAt = meta?.timestamp || new Date().toISOString();
  const cwd = meta?.cwd || null;
  const metadata = JSON.stringify({
    provider: "codex",
    transcript_path: transcriptPath,
    cli_version: meta?.cli_version || null,
    model_provider: meta?.model_provider || "openai",
    git: meta?.git || null,
  });
  stmts.insertCodexSession.run(
    sessionId,
    "Codex session",
    "active",
    cwd,
    "unknown",
    "local",
    startedAt,
    startedAt,
    metadata
  );
  // Keep the canonical transcript pointer on the session row too. The session
  // detail/transcript APIs, retention tools, and live-status checks all read
  // this column rather than provider-specific metadata.
  stmts.setSessionTranscriptPath.run(transcriptPath, sessionId);
  const agentId = `codex:${sessionId}`;
  stmts.insertAgent.run(agentId, sessionId, "Codex", "main", null, "working", null, null, metadata);
  session = stmts.getSession.get(sessionId);
  return session;
}

function applyTokenSnapshot(sessionId, model, speed, tokenInfo, previous) {
  const total = tokenInfo.total_token_usage;
  if (!total) return previous;
  const current = {
    input_tokens: asNumber(total.input_tokens),
    cached_input_tokens: asNumber(total.cached_input_tokens),
    cache_write_input_tokens: asNumber(total.cache_write_input_tokens),
    output_tokens: asNumber(total.output_tokens),
    reasoning_output_tokens: asNumber(total.reasoning_output_tokens),
  };
  const fields = Object.keys(current);
  const hasRegression = fields.some((field) => current[field] < asNumber(previous[field]));
  const delta = Object.fromEntries(
    fields.map((field) => [
      field,
      hasRegression ? 0 : Math.max(0, current[field] - asNumber(previous[field])),
    ])
  );
  const output = delta.output_tokens + delta.reasoning_output_tokens;
  const freshInput = Math.max(
    0,
    delta.input_tokens - delta.cached_input_tokens - delta.cache_write_input_tokens
  );
  if (freshInput || delta.cached_input_tokens || delta.cache_write_input_tokens || output) {
    const contextSize = delta.input_tokens > CONTEXT_SHORT_LIMIT ? "long" : "short";
    stmts.upsertCodexTokenDelta.run(
      sessionId,
      model || "unknown",
      speed,
      contextSize,
      freshInput,
      output,
      delta.cached_input_tokens,
      delta.cache_write_input_tokens
    );
  }
  return current;
}

/**
 * Ingest one append-only rollout file. Calling it repeatedly without appended
 * bytes produces no writes and no broadcasts, even when hooks and fs.watch
 * report the same change.
 */
function ingestCodexTranscript(transcriptPath, options = {}) {
  if (!isCodexTranscript(transcriptPath)) return { changed: false, events: [] };
  let stat;
  try {
    stat = fs.statSync(transcriptPath);
  } catch {
    return { changed: false, events: [] };
  }
  const state = stmts.getCodexIngestState.get(transcriptPath);
  const offset = !state || stat.size < state.byte_offset ? 0 : state.byte_offset;
  let body;
  try {
    const length = stat.size - offset;
    if (length <= 0) return { changed: false, events: [] };
    const fd = fs.openSync(transcriptPath, "r");
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, offset);
    fs.closeSync(fd);
    body = buffer.toString("utf8");
  } catch {
    return { changed: false, events: [] };
  }

  const lastNewline = body.lastIndexOf("\n");
  if (lastNewline < 0) return { changed: false, events: [] };
  const complete = body.slice(0, lastNewline + 1);
  const remainder = body.slice(lastNewline + 1);
  const nextOffset = offset + Buffer.byteLength(complete);
  const records = complete
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  if (!records.length) return { changed: false, events: [] };

  let meta = records.find((record) => record.type === "session_meta")?.payload;
  const resolvedSessionId = state?.session_id || meta?.id || sessionIdFromPath(transcriptPath);
  const knownSession = resolvedSessionId ? stmts.getSession.get(resolvedSessionId) : null;
  const created = !knownSession;
  let session = knownSession || createCodexSession(meta, transcriptPath);
  if (!session && meta?.id) session = createCodexSession(meta, transcriptPath);
  if (!session) return { changed: false, events: [] };
  // Backfill sessions created by an older dashboard build that stored the path
  // only in metadata. The prepared statement is intentionally one-shot.
  stmts.setSessionTranscriptPath.run(transcriptPath, session.id);

  const agentId = `codex:${session.id}`;
  let model = session.model || "unknown";
  let speed = "standard";
  let counters = {
    input_tokens: asNumber(state?.input_tokens),
    cached_input_tokens: asNumber(state?.cached_input_tokens),
    cache_write_input_tokens: asNumber(state?.cache_write_input_tokens),
    output_tokens: asNumber(state?.output_tokens),
    reasoning_output_tokens: asNumber(state?.reasoning_output_tokens),
  };
  const events = [];

  for (const record of records) {
    if (record.type === "session_meta") {
      meta = record.payload;
      continue;
    }
    if (record.type === "turn_context") {
      model = record.payload?.model || model;
      speed = eventSpeed(record);
      if (model && model !== session.model) stmts.updateSessionModel.run(model, session.id, model);
      continue;
    }
    if (record.type === "event_msg" && record.payload?.type === "thread_settings_applied") {
      model = record.payload?.thread_settings?.model || model;
      speed = eventSpeed(record);
      if (model && model !== session.model) stmts.updateSessionModel.run(model, session.id, model);
      continue;
    }
    if (record.type === "event_msg" && record.payload?.type === "token_count") {
      counters = applyTokenSnapshot(session.id, model, speed, record.payload.info || {}, counters);
    }
    if (record.type === "event_msg" && record.payload?.type === "user_message") {
      const title = truncate(record.payload.message);
      if (title && (!session.name || session.name === "Codex session")) {
        stmts.updateSessionName.run(title, session.id, title);
      }
    }
    const event = persistEvent(session.id, agentId, record);
    if (event) events.push(event);
  }

  stmts.upsertCodexIngestState.run(
    transcriptPath,
    session.id,
    nextOffset,
    remainder,
    counters.input_tokens,
    counters.cached_input_tokens,
    counters.cache_write_input_tokens,
    counters.output_tokens,
    counters.reasoning_output_tokens
  );
  stmts.touchSession.run(session.id);
  session = stmts.getSession.get(session.id);
  return {
    changed: true,
    created,
    session,
    agent: stmts.getAgent.get(agentId),
    events,
  };
}

function applyCodexHookLifecycle(result, hookType) {
  if (!result?.session || !hookType) return result;
  const normalized = String(hookType)
    .replace(/[_\s-]/g, "")
    .toLowerCase();
  const sessionId = result.session.id;
  const agentId = `codex:${sessionId}`;
  let changed = false;
  if (normalized === "sessionend") {
    const endedAt = new Date().toISOString();
    changed = stmts.updateSession.run(null, "completed", endedAt, null, sessionId).changes > 0;
    changed =
      stmts.updateAgent.run(null, "completed", null, null, endedAt, null, agentId).changes > 0 ||
      changed;
  } else if (
    ["sessionstart", "userpromptsubmit", "pretooluse", "posttooluse", "stop"].includes(normalized)
  ) {
    changed = stmts.reactivateSession.run(sessionId).changes > 0;
    changed = stmts.reactivateAgent.run(agentId).changes > 0 || changed;
  }
  return {
    ...result,
    changed: Boolean(result.changed || changed),
    session: stmts.getSession.get(sessionId),
    agent: stmts.getAgent.get(agentId),
  };
}

/**
 * Apply a lifecycle notification even when the rollout did not gain a complete
 * JSONL line yet. This matters most for SessionEnd: a hook can arrive before
 * Codex flushes its final event, but the dashboard should still stop showing a
 * stale active session immediately.
 */
function ingestCodexHook(transcriptPath, hookType) {
  const result = ingestCodexTranscript(transcriptPath);
  if (result.session) return applyCodexHookLifecycle(result, hookType);
  if (!isCodexTranscript(transcriptPath)) return result;
  const state = stmts.getCodexIngestState.get(transcriptPath);
  const sessionId = state?.session_id || sessionIdFromPath(transcriptPath);
  const session = sessionId && stmts.getSession.get(sessionId);
  if (!session) return result;
  return applyCodexHookLifecycle(
    { ...result, session, agent: stmts.getAgent.get(`codex:${session.id}`) },
    hookType
  );
}

module.exports = {
  CONTEXT_SHORT_LIMIT,
  findCodexTranscripts,
  ingestCodexTranscript,
  ingestCodexHook,
  applyCodexHookLifecycle,
  isCodexTranscript,
};
