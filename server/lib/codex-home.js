/**
 * @file Resolves and safely updates the local Codex state directory and its
 * append-only rollout transcripts. A Settings change persists a dashboard-only
 * override and notifies the live synchronizer without changing the Codex CLI.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeEnvFile } = require("./claude-home");

// The live synchronizer subscribes here instead of the settings route owning a
// second scanner. This keeps a runtime home change immediate while preserving
// the single, idempotent ingest path used by hooks and the background watcher.
const homeChangeListeners = new Set();

function getCodexHome() {
  return path.resolve(
    process.env.DASHBOARD_CODEX_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex")
  );
}

function getCodexSessionsDir() {
  return path.join(getCodexHome(), "sessions");
}

function getCodexHooksPath() {
  return path.join(getCodexHome(), "hooks.json");
}

/** Subscribe to a successful runtime Codex-home change. */
function onCodexHomeChanged(listener) {
  homeChangeListeners.add(listener);
  return () => homeChangeListeners.delete(listener);
}

/**
 * Update the Codex state root without a server restart. `DASHBOARD_CODEX_HOME`
 * deliberately wins over `CODEX_HOME`: it is the dashboard-specific override
 * users configure from Settings and avoids mutating their broader CLI setup.
 */
function setCodexHome(newPath) {
  const expanded = newPath.replace(/^~(?=\/)/, os.homedir());
  if (!path.isAbsolute(expanded)) {
    throw new Error("Codex home must be an absolute path");
  }
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }

  process.env.DASHBOARD_CODEX_HOME = resolved;
  writeEnvFile("DASHBOARD_CODEX_HOME", resolved);
  for (const listener of homeChangeListeners) {
    try {
      listener(resolved);
    } catch {
      // A listener failure must never make a valid path update fail.
    }
  }
  return resolved;
}

module.exports = {
  getCodexHome,
  getCodexSessionsDir,
  getCodexHooksPath,
  onCodexHomeChanged,
  setCodexHome,
};
