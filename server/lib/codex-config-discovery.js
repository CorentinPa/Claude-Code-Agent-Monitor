/**
 * @file Discovery helpers for the local Codex configuration explorer. They
 * enumerate safe metadata, installed-plugin state, and redacted file previews
 * beneath CODEX_HOME; a separate tightly scoped mutation helper owns edits.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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

function readJson(file) {
  const read = safeRead(file);
  if (!read || read.truncated) return null;
  try {
    return JSON.parse(read.text);
  } catch {
    return null;
  }
}

function titleCase(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pluginKey(name, marketplace) {
  return `${name}@${marketplace}`.toLowerCase();
}

function pluginIdParts(id) {
  const at = id.lastIndexOf("@");
  if (at <= 0 || at === id.length - 1) return null;
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) };
}

function pluginManifest(file, marketplace, installPath) {
  const manifest = readJson(file);
  if (!manifest || typeof manifest.name !== "string") return null;
  const ui = manifest.interface && typeof manifest.interface === "object" ? manifest.interface : {};
  return {
    id: pluginKey(manifest.name, marketplace),
    name: manifest.name,
    displayName: typeof ui.displayName === "string" ? ui.displayName : titleCase(manifest.name),
    description:
      typeof ui.shortDescription === "string"
        ? ui.shortDescription
        : typeof manifest.description === "string"
          ? manifest.description
          : null,
    marketplace,
    marketplaceLabel: titleCase(marketplace),
    version: typeof manifest.version === "string" ? manifest.version : null,
    installPath,
  };
}

/**
 * Codex stores downloaded plugin manifests below `plugins/cache`, but cache is
 * an implementation detail, not a plugin. This function only returns actual
 * manifests at the leaf directories, never a cache/marketplace folder.
 */
function cachedPluginManifests(home) {
  const cache = path.join(home, "plugins", "cache");
  const items = [];
  for (const marketplaceEntry of list(cache)) {
    if (!marketplaceEntry.isDirectory() || marketplaceEntry.name.startsWith(".")) continue;
    const marketplace = marketplaceEntry.name;
    const marketplaceDir = path.join(cache, marketplace);
    for (const pluginEntry of list(marketplaceDir)) {
      if (!pluginEntry.isDirectory() || pluginEntry.name.startsWith(".")) continue;
      const pluginDir = path.join(marketplaceDir, pluginEntry.name);
      for (const versionEntry of list(pluginDir)) {
        if (!versionEntry.isDirectory() || versionEntry.name.startsWith(".")) continue;
        const installPath = path.join(pluginDir, versionEntry.name);
        const item = pluginManifest(
          path.join(installPath, ".codex-plugin", "plugin.json"),
          marketplace,
          installPath
        );
        if (item) items.push(item);
      }
    }
  }
  return items;
}

function pluginTables(text) {
  const starts = Array.from(text.matchAll(/^\s*\[plugins\.(?:"([^"]+)"|([^\]]+))\]\s*$/gm));
  return starts
    .map((match, index) => {
      const id = (match[1] || match[2] || "").trim();
      const parts = pluginIdParts(id);
      if (!parts) return null;
      const start = (match.index || 0) + match[0].length;
      const next = starts[index + 1]?.index ?? text.length;
      const block = text.slice(start, next);
      return {
        ...parts,
        enabled: !/^\s*enabled\s*=\s*false\b/m.test(block),
      };
    })
    .filter(Boolean);
}

function parsePluginList(stdout) {
  const plugins = [];
  for (const line of stdout.split("\n")) {
    const match = line.match(
      /^\s*(\S+@\S+)\s{2,}installed(?:,\s*(enabled|disabled))?\s{2,}(\S+)\s{2,}(.+?)\s*$/i
    );
    if (!match) continue;
    const parts = pluginIdParts(match[1]);
    if (!parts) continue;
    plugins.push({
      ...parts,
      enabled: match[2] !== "disabled",
      version: match[3] || null,
      installPath: match[4] || null,
    });
  }
  return plugins;
}

/**
 * `codex plugin list` is the CLI's authoritative installation registry. The
 * cache is used only to enrich entries with presentation metadata, and only
 * when the CLI is unavailable do we fall back to configured/cache records.
 */
function installedPluginsFromCli(home) {
  if (process.env.DASHBOARD_DISABLE_CODEX_PLUGIN_CLI === "1") return [];
  try {
    return parsePluginList(
      execFileSync("codex", ["plugin", "list"], {
        encoding: "utf8",
        timeout: 4_000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, CODEX_HOME: home },
      })
    );
  } catch {
    return [];
  }
}

function readPlugins(home, configText) {
  const manifests = cachedPluginManifests(home);
  const manifestsById = new Map(manifests.map((item) => [item.id, item]));
  const manifestsByName = new Map();
  for (const manifest of manifests) {
    if (!manifestsByName.has(manifest.name)) manifestsByName.set(manifest.name, manifest);
  }
  const cliItems = installedPluginsFromCli(home);
  const configured = pluginTables(configText);
  const installed = cliItems.length ? cliItems : configured;

  const result = new Map();
  for (const item of installed) {
    const key = pluginKey(item.name, item.marketplace);
    const fromCache = manifestsById.get(key) || manifestsByName.get(item.name) || null;
    let fromInstall = null;
    if (item.installPath) {
      fromInstall = pluginManifest(
        path.join(item.installPath, ".codex-plugin", "plugin.json"),
        item.marketplace,
        item.installPath
      );
    }
    const metadata = fromInstall || fromCache;
    result.set(key, {
      id: key,
      name: item.name,
      displayName: metadata?.displayName || titleCase(item.name),
      description: metadata?.description || null,
      marketplace: item.marketplace,
      marketplaceLabel: titleCase(item.marketplace),
      version: item.version || metadata?.version || null,
      enabled: item.enabled,
    });
  }

  // Remote curated installs are managed separately from config.toml. Their
  // marker is written only once Codex installs them, so it is a reliable
  // fallback for an unavailable/older CLI. When `plugin list` works we leave
  // it authoritative rather than mixing stale downloaded cache entries in.
  if (!cliItems.length) {
    for (const manifest of manifests) {
      const pluginDir = path.dirname(manifest.installPath);
      const remoteMarker = path.join(pluginDir, ".codex-remote-plugin-install.json");
      if (!stat(remoteMarker)?.isFile()) continue;
      const alreadyInstalled = Array.from(result.values()).some(
        (item) => item.name === manifest.name
      );
      if (alreadyInstalled) continue;
      result.set(manifest.id, { ...manifest, enabled: true });
    }
  }
  return Array.from(result.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
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
  const plugins = readPlugins(home, config);
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
function editablePath(file) {
  if (typeof file !== "string") return null;
  const home = getCodexHome();
  const resolved = path.resolve(file);
  const projectInstructions = path.resolve(process.cwd(), "AGENTS.md");
  const allowedExact = new Set([
    path.join(home, "config.toml"),
    path.join(home, "hooks.json"),
    path.join(home, "AGENTS.md"),
    projectInstructions,
  ]);
  if (allowedExact.has(resolved)) return resolved;
  const skillsRoot = path.join(home, "skills");
  const rulesRoot = path.join(home, "rules");
  const skillRelative = path.relative(skillsRoot, resolved);
  if (
    skillRelative &&
    !skillRelative.startsWith("..") &&
    !path.isAbsolute(skillRelative) &&
    path.basename(resolved) === "SKILL.md"
  ) {
    return resolved;
  }
  const ruleRelative = path.relative(rulesRoot, resolved);
  if (
    ruleRelative &&
    !ruleRelative.startsWith("..") &&
    !path.isAbsolute(ruleRelative) &&
    resolved.endsWith(".rules")
  ) {
    return resolved;
  }
  return null;
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

module.exports = { MAX_FILE_BYTES, editablePath, readOverview, readFileSafe };
