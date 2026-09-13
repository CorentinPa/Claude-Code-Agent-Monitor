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

module.exports = { parseAssistantDirName, discoverAssistants };
