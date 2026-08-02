/**
 * @file Resolves the local Codex state directory and its append-only rollout
 * transcripts. The override keeps development and tests isolated from a user's
 * real Codex history while the default follows the Codex CLI convention.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const os = require("os");
const path = require("path");

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

module.exports = { getCodexHome, getCodexSessionsDir, getCodexHooksPath };
