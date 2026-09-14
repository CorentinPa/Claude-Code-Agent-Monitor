/**
 * @file Discovers XanaOS assistants from the repository's spec layer under
 * `OS/assistantes`. Everything here reads the filesystem and nothing here
 * touches the database, a config dir, or the network, so the cockpit's view
 * of an assistant stays derived from what actually exists in the spec layer,
 * not from a record the dashboard maintains in parallel.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const path = require("path");

/**
 * `<FirstName>-IA-<Role>` is the current convention; `<FirstName>-AssistanteIA-<Role>`
 * is the earlier one still documented in OS/README.md. The longer separator is
 * listed first so the alternation does not match `IA` inside `AssistanteIA`.
 * The first group is lazy so a compound first name still yields the whole name.
 */
const NAME_PATTERN = /^(.+?)-(?:AssistanteIA|IA)-(.+)$/;

const DESCRIPTION_MAX = 240;

function parseAssistantDirName(dirName) {
  const match = NAME_PATTERN.exec(dirName);
  if (!match) return null;
  return { firstName: match[1], role: match[2].replace(/-/g, " ") };
}

/**
 * Strips a leading YAML frontmatter block (`---` ... `---`), required by the
 * vault's note convention (title/type/tags/created/updated). Left in place, it
 * reads as the description itself instead of the note's metadata.
 */
function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

/**
 * The first paragraph of the README that is neither a heading nor a blockquote,
 * flattened to one line and truncated. Frontmatter, callouts, and titles are
 * skipped because they describe the document, not the assistant.
 */
function readDescription(readmePath) {
  let text;
  try {
    text = stripFrontmatter(fs.readFileSync(readmePath, "utf8"));
  } catch {
    return null;
  }
  for (const block of text.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue;
    const flat = trimmed.replace(/\s+/g, " ");
    return flat.length > DESCRIPTION_MAX
      ? `${flat.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
      : flat;
  }
  return null;
}

function listSubAgents(assistantRoot) {
  try {
    return fs
      .readdirSync(path.join(assistantRoot, "subAgents"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.basename(name, ".md"))
      .sort();
  } catch {
    return [];
  }
}

/** Mtime of the distilled brain, which dates the last distillation. */
function readDistilledAt(assistantRoot) {
  try {
    return fs.statSync(path.join(assistantRoot, "runtime", "CLAUDE.md")).mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * One entry per conforming sub-directory. A directory that does not match the
 * naming convention is skipped silently: the assistants directory also holds
 * a README and other files, and a stray entry is not an error condition.
 */
function discoverAssistants(assistantsDir) {
  if (!assistantsDir) return [];
  let entries;
  try {
    entries = fs.readdirSync(assistantsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const parsed = parseAssistantDirName(entry.name);
    if (!parsed) continue;
    const root = path.join(assistantsDir, entry.name);
    const distilledAt = readDistilledAt(root);
    found.push({
      first_name: parsed.firstName,
      role: parsed.role,
      dir_name: entry.name,
      path: root,
      description: readDescription(path.join(root, "README.md")),
      sub_agents: listSubAgents(root),
      has_runtime: distilledAt !== null,
      distilled_at: distilledAt,
    });
  }
  return found.sort((left, right) => left.first_name.localeCompare(right.first_name));
}

/**
 * The `starttime` of a process, field 22 of /proc/<pid>/stat. The `comm` field
 * is parenthesised and may itself contain spaces and parentheses, so fields are
 * counted from after its LAST closing parenthesis; starttime is then index 19,
 * fields 1 and 2 having been dropped. Returns null where /proc is absent.
 */
function readProcStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] || null;
  } catch {
    return null;
  }
}

/**
 * Whether a registry entry is backed by a real process. A registry file
 * outlives its process, so its presence proves nothing on its own.
 * `process.kill(pid, 0)` sends no signal and only probes existence; EPERM means
 * the process exists under another user, which still counts as alive. The
 * start-time comparison then closes the recycled-PID case. Without /proc the
 * signal probe is the only check available, and it is used alone.
 */
function isProcessAlive(pid, procStart) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err.code !== "EPERM") return false;
  }
  const actual = readProcStart(pid);
  if (actual === null) return true;
  return String(procStart) === actual;
}

/**
 * The assistant's live sessions, read from the session registry its own
 * runtime maintains under its config dir (`<config dir>/sessions/*.json`).
 * Entries whose process cannot be verified are dropped rather than reported
 * as live.
 */
function readLiveSessions(configDir) {
  const dir = path.join(configDir, "sessions");
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const live = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      // The runtime may be mid-write, or the file may be something else.
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    // An unclaimed warm-pool worker, kept alive by the CLI's own daemon to
    // speed up the next session start. It answers to no conversation and no
    // Remote Control bridge, so counting it as live would report an
    // assistant as up whenever its daemon happens to be keeping spares warm
    // -- observed in production: Lucy always showed up because her local
    // daemon always has a spare, while Xana and Jeremie (no local spares)
    // fluctuated normally.
    if (entry.spare === true) continue;
    if (!isProcessAlive(entry.pid, entry.procStart)) continue;
    live.push({
      pid: entry.pid,
      session_id: typeof entry.sessionId === "string" ? entry.sessionId : null,
      name: typeof entry.name === "string" ? entry.name : null,
      cwd: typeof entry.cwd === "string" ? entry.cwd : null,
      started_at: Number.isFinite(entry.startedAt) ? new Date(entry.startedAt).toISOString() : null,
      busy: entry.status === "busy",
      remote_control: typeof entry.bridgeSessionId === "string" && entry.bridgeSessionId.length > 0,
    });
  }
  return live.sort((left, right) => (right.started_at || "").localeCompare(left.started_at || ""));
}

module.exports = {
  parseAssistantDirName,
  discoverAssistants,
  readProcStart,
  isProcessAlive,
  readLiveSessions,
};
