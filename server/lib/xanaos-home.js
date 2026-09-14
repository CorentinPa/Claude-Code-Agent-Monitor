/**
 * @file Resolves the XanaOS assistants directory the dashboard discovers
 * assistants from, and the root under which each assistant's Claude config dir
 * lives. Auto-detection keeps the setting empty in the common case: the
 * dashboard is checked out as a sibling of `OS/assistantes` inside the vault.
 * The config-dir root is derived rather than configured, because
 * `OS/README.md` fixes it by convention; a second setting would only be one
 * more thing to keep in step with the first.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeEnvFile } = require("./claude-home");

/** The dashboard checkout root: server/lib -> server -> app. */
const REPO_ROOT = path.resolve(__dirname, "..", "..");
/** Conventional location: the vault's OS/assistantes, next to the checkout. */
const AUTO_DETECT_CANDIDATE = path.resolve(REPO_ROOT, "..", "OS", "assistantes");

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The active assistants directory and where the value came from.
 * `configured` = an operator set it from Settings; `auto` = the conventional
 * sibling was found; `none` = neither resolved, and the UI sends the operator
 * to Settings instead of rendering an empty list that looks like a bug.
 * The optional `candidate` parameter allows tests to exercise auto-detection
 * deterministically; production callers pass nothing.
 */
function resolveAssistantsDir({ candidate = AUTO_DETECT_CANDIDATE } = {}) {
  const configured = process.env.XANAOS_ASSISTANTS_DIR;
  if (configured && configured.trim() !== "") {
    const resolved = path.resolve(configured.trim());
    return { dir: resolved, source: "configured", exists: isDirectory(resolved) };
  }
  if (isDirectory(candidate)) {
    return { dir: candidate, source: "auto", exists: true };
  }
  return { dir: null, source: "none", exists: false };
}

/**
 * Persist an operator override. An empty value clears it and returns to
 * auto-detection, which is what makes the setting something you fill in only if
 * your assistants move.
 */
function setAssistantsDir(newPath) {
  if (typeof newPath !== "string") {
    throw new Error("Assistants directory must be a string");
  }
  const trimmed = newPath.trim();
  if (trimmed === "") {
    delete process.env.XANAOS_ASSISTANTS_DIR;
    writeEnvFile("XANAOS_ASSISTANTS_DIR", "");
    return resolveAssistantsDir();
  }
  const expanded = trimmed.replace(/^~(?=\/)/, os.homedir());
  if (!path.isAbsolute(expanded)) {
    throw new Error("Assistants directory must be an absolute path");
  }
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  process.env.XANAOS_ASSISTANTS_DIR = resolved;
  writeEnvFile("XANAOS_ASSISTANTS_DIR", resolved);
  return resolveAssistantsDir();
}

/** Root of the per-assistant Claude config dirs, per OS/README.md. */
function getConfigRoot() {
  const override = process.env.XANAOS_CONFIG_ROOT;
  if (override && override.trim() !== "") return path.resolve(override.trim());
  return path.join(os.homedir(), ".Xanaos");
}

module.exports = {
  resolveAssistantsDir,
  setAssistantsDir,
  getConfigRoot,
  isDirectory,
  AUTO_DETECT_CANDIDATE,
};
