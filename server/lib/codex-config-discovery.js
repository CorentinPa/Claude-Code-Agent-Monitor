/**
 * @file Read-only discovery for the local Codex configuration explorer. It
 * enumerates safe metadata and redacted text beneath CODEX_HOME without ever
 * exposing credential values or mutating files the Codex CLI may be writing.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("node:fs");
const path = require("node:path");
const { getCodexHome } = require("./codex-home");

const MAX_FILE_BYTES = 256 * 1024;
const SENSITIVE_KEY = /(token|secret|password|api[_-]?key|bearer|credential|private[_-]?key)/i;

function stat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}
function list(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function safeRead(file) {
  const meta = stat(file);
  if (!meta?.isFile()) return null;
  try {
    const body = fs.readFileSync(file, "utf8");
    return {
      path: file,
      text: body.slice(0, MAX_FILE_BYTES),
      size: meta.size,
      mtime: meta.mtimeMs,
      truncated: meta.size > MAX_FILE_BYTES,
    };
  } catch {
    return null;
  }
}
function redactToml(text) {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*([^=\s]+)\s*=\s*)(.*)$/);
      return match && SENSITIVE_KEY.test(match[2]) ? `${match[1]}"[redacted]"` : line;
    })
    .join("\n");
}
function redactJson(value) {
  if (Array.isArray(value)) return value.map(redactJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : redactJson(item),
    ])
  );
}
function relativeToAllowed(file) {
  const home = getCodexHome();
  const resolved = path.resolve(file);
  const projectInstructions = path.resolve(process.cwd(), "AGENTS.md");
  if (resolved === projectInstructions || resolved.startsWith(`${home}${path.sep}`))
    return resolved;
  return null;
}
function summary(file) {
  const meta = stat(file);
  return {
    path: file,
    exists: Boolean(meta?.isFile()),
    size: meta?.size || 0,
    mtime: meta?.mtimeMs || null,
  };
}
function configLines() {
  const file = path.join(getCodexHome(), "config.toml");
  return { file, read: safeRead(file) };
}
function tomlScalar(lines, key) {
  const match = lines.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\n#]+)`, "m"));
  return match ? match[1].trim() : null;
}
function tableNames(text, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escaped}\\.([^\\]]+)\\]\\s*$`, "gm");
  return Array.from(text.matchAll(re), (match) => match[1]);
}
function readMcp(text) {
  const names = tableNames(text, "mcp_servers").filter((name) => !name.includes(".tools."));
  return names.map((name) => {
    const start = text.indexOf(`[mcp_servers.${name}]`);
    const next = text.indexOf("\n[", start + 1);
    const block = text.slice(start, next < 0 ? text.length : next);
    return {
      name,
      command: tomlScalar(block, "command"),
      url: tomlScalar(block, "url"),
      enabled: tomlScalar(block, "enabled") !== "false",
      envNames: Array.from(
        block.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$?\{?([A-Z][A-Z0-9_]+)/g),
        (match) => match[2]
      ),
    };
  });
}
function readProjects(text) {
  return tableNames(text, "projects").map((name) => {
    const value = name.replace(/^"|"$/g, "");
    return { path: value, name: path.basename(value) || value };
  });
}
function readModels(home) {
  const file = path.join(home, "models_cache.json");
  const read = safeRead(file);
  if (!read) return { file, fetchedAt: null, items: [] };
  try {
    const parsed = JSON.parse(read.text);
    return {
      file,
      fetchedAt: typeof parsed.fetched_at === "string" ? parsed.fetched_at : null,
      items: Array.isArray(parsed.models)
        ? parsed.models
            .filter((model) => typeof model?.slug === "string")
            .map((model) => ({
              id: model.slug,
              name: model.display_name || model.slug,
              description: model.description || null,
              defaultEffort: model.default_reasoning_level || null,
              efforts: Array.isArray(model.supported_reasoning_levels)
                ? model.supported_reasoning_levels.map((entry) => entry?.effort).filter(Boolean)
                : [],
              contextWindow: model.context_window || null,
              visible: model.visibility !== "hidden",
            }))
        : [],
    };
  } catch {
    return { file, fetchedAt: null, items: [] };
  }
}
function readProfiles(home) {
  return list(home)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".config.toml"))
    .map((entry) => summary(path.join(home, entry.name)));
}
function readSkills(home) {
  const base = path.join(home, "skills");
  return list(base)
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = path.join(base, entry.name, "SKILL.md");
      const read = safeRead(file);
      return read
        ? {
            name: entry.name,
            file,
            preview: read.text.replace(/^---[\s\S]*?---\s*/, "").slice(0, 260),
            mtime: read.mtime,
          }
        : null;
    })
    .filter(Boolean);
}
function readRules(home) {
  const base = path.join(home, "rules");
  return list(base)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".rules"))
    .map((entry) => {
      const file = path.join(base, entry.name);
      const read = safeRead(file);
      return {
        name: entry.name,
        file,
        preview: read?.text.slice(0, 260) || "",
        mtime: read?.mtime || null,
      };
    });
}
function readHooks(home) {
  const file = path.join(home, "hooks.json");
  const read = safeRead(file);
  if (!read) return { file, items: [] };
  try {
    const hooks = JSON.parse(read.text)?.hooks;
    return {
      file,
      items:
        hooks && typeof hooks === "object"
          ? Object.entries(hooks).map(([event, groups]) => ({
              event,
              groups: Array.isArray(groups) ? groups.length : 0,
            }))
          : [],
    };
  } catch {
    return { file, items: [] };
  }
}
function readPlugins(home) {
  const base = path.join(home, "plugins");
  return list(base)
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({ name: entry.name, path: path.join(base, entry.name) }));
}
function readInstructions(home) {
  return [path.join(home, "AGENTS.md"), path.join(process.cwd(), "AGENTS.md")]
    .map((file) => {
      const read = safeRead(file);
      return read
        ? {
            path: file,
            name: path.basename(file),
            preview: read.text.slice(0, 320),
            mtime: read.mtime,
          }
        : null;
    })
    .filter(Boolean);
}

function readOverview() {
  const home = getCodexHome();
  const { file: configPath, read } = configLines();
  const config = read?.text || "";
  const models = readModels(home);
  const skills = readSkills(home);
  const rules = readRules(home);
  const hooks = readHooks(home);
  const profiles = readProfiles(home);
  const mcp = readMcp(config);
  const projects = readProjects(config);
  const plugins = readPlugins(home);
  const instructions = readInstructions(home);
  return {
    home,
    config: {
      ...summary(configPath),
      text: read ? redactToml(read.text) : "",
      truncated: Boolean(read?.truncated),
    },
    defaults: {
      model: tomlScalar(config, "model"),
      reasoningEffort: tomlScalar(config, "model_reasoning_effort"),
      personality: tomlScalar(config, "personality"),
    },
    counts: {
      models: models.items.length,
      profiles: profiles.length,
      mcp: mcp.length,
      projects: projects.length,
      skills: skills.length,
      hooks: hooks.items.length,
      rules: rules.length,
      plugins: plugins.length,
      instructions: instructions.length,
    },
    models,
    profiles,
    mcp,
    projects,
    skills,
    hooks,
    rules,
    plugins,
    instructions,
  };
}
function readFileSafe(file) {
  const allowed = typeof file === "string" && relativeToAllowed(file);
  if (!allowed) return { error: "File must be inside Codex home or this project's AGENTS.md" };
  const read = safeRead(allowed);
  if (!read) return { error: "File is not readable" };
  const text = allowed.endsWith(".json")
    ? (() => {
        try {
          return JSON.stringify(redactJson(JSON.parse(read.text)), null, 2);
        } catch {
          return read.text;
        }
      })()
    : allowed.endsWith(".toml")
      ? redactToml(read.text)
      : read.text;
  return { ...read, text };
}

module.exports = { readOverview, readFileSafe };
