/**
 * @file Tracks interactive Codex TUI processes before Codex creates a durable
 * session identity. The resulting session and agent cards live only in memory,
 * never enter SQLite, and disappear when the process exits or a durable Codex
 * session in the same working directory takes their place.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { isInsideContainer } = require("../../scripts/install-hooks");

const NON_INTERACTIVE_COMMANDS = new Set([
  "e",
  "exec",
  "review",
  "login",
  "logout",
  "mcp",
  "plugin",
  "mcp-server",
  "app-server",
  "remote-control",
  "app",
  "completion",
  "update",
  "doctor",
  "sandbox",
  "debug",
  "apply",
  "archive",
  "delete",
  "unarchive",
  "cloud",
  "exec-server",
  "features",
  "help",
]);
const VALUE_FLAGS = new Set([
  "-c",
  "--config",
  "--enable",
  "--disable",
  "--remote",
  "--remote-auth-token-env",
  "-i",
  "--image",
  "-m",
  "--model",
  "--local-provider",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-C",
  "--cd",
  "--add-dir",
  "-a",
  "--ask-for-approval",
]);

let sessionsById = new Map();
let monitorStarted = false;

function commandTokens(args) {
  return typeof args === "string" ? args.trim().split(/\s+/).filter(Boolean) : [];
}

function codexBinaryIndex(tokens) {
  if (path.basename(tokens[0] || "") === "codex") return 0;
  const interpreter = path.basename(tokens[0] || "");
  if (
    (interpreter === "node" || interpreter === "bun") &&
    path.basename(tokens[1] || "") === "codex"
  ) {
    return 1;
  }
  return -1;
}

function isInteractiveCodexCommand(args) {
  const tokens = commandTokens(args);
  const binaryIndex = codexBinaryIndex(tokens);
  if (binaryIndex < 0) return false;

  let command = null;
  for (let index = binaryIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") return true;
    if (token === "-h" || token === "--help" || token === "-V" || token === "--version") {
      return false;
    }
    if (VALUE_FLAGS.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    command = token;
    break;
  }
  return (
    command === null ||
    command === "resume" ||
    command === "fork" ||
    !NON_INTERACTIVE_COMMANDS.has(command)
  );
}

function probeDisabled() {
  const raw = String(process.env.DASHBOARD_LIVENESS_PROBE || "")
    .trim()
    .toLowerCase();
  return (
    raw === "0" ||
    raw === "false" ||
    raw === "no" ||
    raw === "off" ||
    process.platform === "win32" ||
    isInsideContainer()
  );
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout) => {
      if (error) {
        error.stdout = stdout;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function probeInteractiveCodexProcesses() {
  if (probeDisabled()) return { available: false, processes: [] };

  let psOutput;
  try {
    psOutput = await run("ps", ["-Ao", "pid=,args="], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return { available: false, processes: [] };
  }

  const argsByPid = new Map();
  for (const line of psOutput.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match || !isInteractiveCodexCommand(match[2])) continue;
    argsByPid.set(Number(match[1]), match[2]);
  }
  if (argsByPid.size === 0) return { available: true, processes: [] };

  const processes = [];
  if (process.platform === "linux") {
    for (const pid of argsByPid.keys()) {
      try {
        processes.push({ pid, cwd: path.resolve(fs.readlinkSync(`/proc/${pid}/cwd`)) });
      } catch {
        // The process exited between ps and readlink.
      }
    }
    return { available: true, processes };
  }

  let lsofOutput;
  try {
    lsofOutput = await run(
      "lsof",
      ["-a", "-p", [...argsByPid.keys()].join(","), "-d", "cwd", "-Fn"],
      {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
  } catch (error) {
    lsofOutput = error && typeof error.stdout === "string" && error.stdout ? error.stdout : null;
    if (lsofOutput === null) return { available: false, processes: [] };
  }

  let currentPid = null;
  for (const line of lsofOutput.split("\n")) {
    if (line.startsWith("p")) {
      const pid = Number(line.slice(1));
      currentPid = argsByPid.has(pid) ? pid : null;
    } else if (line.startsWith("n") && currentPid) {
      processes.push({ pid: currentPid, cwd: path.resolve(line.slice(1)) });
      currentPid = null;
    }
  }
  return { available: true, processes };
}

function overlaySessionId(processInfo) {
  const cwdHash = crypto.createHash("sha256").update(processInfo.cwd).digest("hex").slice(0, 12);
  return `codex-process:${processInfo.pid}:${cwdHash}`;
}

function buildSession(processInfo, startedAt) {
  const metadata = JSON.stringify({
    transient: true,
    pre_identity_process: true,
    process_pid: processInfo.pid,
  });
  return {
    id: overlaySessionId(processInfo),
    name: "Codex session",
    status: "active",
    cwd: processInfo.cwd,
    model: null,
    started_at: startedAt,
    ended_at: null,
    metadata,
    agent_count: 1,
    last_activity: startedAt,
    cost: 0,
    awaiting_input_since: startedAt,
    awaiting_reason: "session_start",
    source: "local",
    provider: "codex",
  };
}

function reconcileCodexProcessOverlay(processes, durableSessions, now = new Date().toISOString()) {
  const liveByCwd = new Map();
  for (const processInfo of processes || []) {
    if (
      !Number.isInteger(processInfo?.pid) ||
      processInfo.pid <= 0 ||
      !path.isAbsolute(processInfo?.cwd || "")
    ) {
      continue;
    }
    const cwd = path.resolve(processInfo.cwd);
    const entries = liveByCwd.get(cwd) || [];
    if (!entries.some((entry) => entry.pid === processInfo.pid)) {
      entries.push({ pid: processInfo.pid, cwd });
    }
    liveByCwd.set(cwd, entries);
  }

  const durableCountByCwd = new Map();
  for (const session of durableSessions || []) {
    if (!path.isAbsolute(session?.cwd || "")) continue;
    const cwd = path.resolve(session.cwd);
    durableCountByCwd.set(cwd, (durableCountByCwd.get(cwd) || 0) + 1);
  }

  const desired = new Map();
  for (const [cwd, entries] of liveByCwd) {
    entries.sort((left, right) => left.pid - right.pid);
    const count = Math.max(0, entries.length - (durableCountByCwd.get(cwd) || 0));
    for (const processInfo of entries.slice(0, count)) {
      const id = overlaySessionId(processInfo);
      desired.set(id, buildSession(processInfo, sessionsById.get(id)?.started_at || now));
    }
  }

  const added = [...desired.values()].filter((session) => !sessionsById.has(session.id));
  const removed = [...sessionsById.values()]
    .filter((session) => !desired.has(session.id))
    .map((session) => ({
      ...session,
      status: "abandoned",
      ended_at: now,
      awaiting_input_since: null,
      awaiting_reason: null,
    }));
  sessionsById = desired;
  return { added, removed };
}

async function refreshCodexProcessOverlay(options = {}) {
  const probe = options.probe || (await probeInteractiveCodexProcesses());
  if (!probe?.available || !Array.isArray(probe.processes)) return { added: [], removed: [] };

  let durableSessions = options.durableSessions;
  if (!durableSessions) {
    try {
      const { db } = require("../db");
      durableSessions = db
        .prepare(
          `SELECT id, cwd FROM sessions
           WHERE provider = 'codex' AND status = 'active'
             AND (source = 'local' OR source IS NULL)`
        )
        .all();
    } catch {
      return { added: [], removed: [] };
    }
  }
  return reconcileCodexProcessOverlay(probe.processes, durableSessions, options.now);
}

function visibleCodexProcessSessions(durableSessions = []) {
  const durableCountByCwd = new Map();
  for (const session of durableSessions) {
    if (!path.isAbsolute(session?.cwd || "")) continue;
    const cwd = path.resolve(session.cwd);
    durableCountByCwd.set(cwd, (durableCountByCwd.get(cwd) || 0) + 1);
  }

  const transientByCwd = new Map();
  for (const session of sessionsById.values()) {
    const cwd = path.resolve(session.cwd);
    const entries = transientByCwd.get(cwd) || [];
    entries.push(session);
    transientByCwd.set(cwd, entries);
  }

  const visible = [];
  for (const [cwd, entries] of transientByCwd) {
    entries.sort((left, right) => left.id.localeCompare(right.id));
    const count = Math.max(0, entries.length - (durableCountByCwd.get(cwd) || 0));
    visible.push(...entries.slice(0, count));
  }
  return visible;
}

function getCodexProcessSessions(durableSessions = []) {
  return visibleCodexProcessSessions(durableSessions).map((session) => ({ ...session }));
}

function getCodexProcessAgents(durableSessions = []) {
  return getCodexProcessSessions(durableSessions).map((session) => ({
    id: `codex:${session.id}`,
    session_id: session.id,
    name: "Codex",
    type: "main",
    subagent_type: null,
    status: "waiting",
    task: null,
    current_tool: null,
    started_at: session.started_at,
    ended_at: null,
    updated_at: session.started_at,
    last_activity: session.started_at,
    parent_agent_id: null,
    metadata: session.metadata,
    awaiting_input_since: session.awaiting_input_since,
    awaiting_reason: session.awaiting_reason,
    cost: 0,
  }));
}

function startCodexProcessOverlay({ broadcast, intervalMs = 1_000 } = {}) {
  if (monitorStarted || typeof broadcast !== "function") return;
  monitorStarted = true;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const changes = await refreshCodexProcessOverlay();
      for (const session of [...changes.added, ...changes.removed]) {
        broadcast("session_updated", session);
      }
    } catch {
      // This optional pre-identity signal must never affect durable ingestion.
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void tick(), 50);
  if (initial.unref) initial.unref();
  const timer = setInterval(() => void tick(), intervalMs);
  if (timer.unref) timer.unref();
}

function resetCodexProcessOverlayForTests() {
  sessionsById = new Map();
}

module.exports = {
  getCodexProcessAgents,
  getCodexProcessSessions,
  isInteractiveCodexCommand,
  probeInteractiveCodexProcesses,
  reconcileCodexProcessOverlay,
  refreshCodexProcessOverlay,
  resetCodexProcessOverlayForTests,
  startCodexProcessOverlay,
};
