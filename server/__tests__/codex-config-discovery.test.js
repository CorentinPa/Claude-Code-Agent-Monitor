/**
 * @file Tests for Codex configuration discovery and its narrow, backup-backed
 * editor allowlist. Fixtures prove that plugins are resolved as real manifests,
 * previews redact secrets, and only intended local text files are mutable.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "codex-config-discovery-"));
const previousHome = process.env.DASHBOARD_CODEX_HOME;
const previousDisablePluginCli = process.env.DASHBOARD_DISABLE_CODEX_PLUGIN_CLI;
process.env.DASHBOARD_CODEX_HOME = HOME;
process.env.DASHBOARD_DISABLE_CODEX_PLUGIN_CLI = "1";

fs.writeFileSync(
  path.join(HOME, "config.toml"),
  [
    'model = "gpt-5.6-terra"',
    'model_reasoning_effort = "high"',
    "[mcp_servers.example]",
    'command = "npx"',
    'api_key = "super-secret"',
    '[projects."/tmp/project"]',
    'trust_level = "trusted"',
    '[plugins."demo-plugin@demo-market"]',
    "enabled = true",
  ].join("\n")
);
fs.writeFileSync(
  path.join(HOME, "models_cache.json"),
  JSON.stringify({
    fetched_at: "2026-08-01T00:00:00.000Z",
    models: [
      {
        slug: "gpt-5.6-terra",
        display_name: "GPT-5.6 Terra",
        supported_reasoning_levels: [{ effort: "high" }],
      },
    ],
  })
);
fs.writeFileSync(path.join(HOME, "hooks.json"), JSON.stringify({ hooks: { SessionStart: [{}] } }));
fs.mkdirSync(path.join(HOME, "skills", "demo"), { recursive: true });
fs.writeFileSync(path.join(HOME, "skills", "demo", "SKILL.md"), "# Demo\n");
fs.mkdirSync(path.join(HOME, "rules"), { recursive: true });
fs.writeFileSync(path.join(HOME, "rules", "review.rules"), "Review every change.\n");
fs.mkdirSync(
  path.join(HOME, "plugins", "cache", "demo-market", "demo-plugin", "1.0.0", ".codex-plugin"),
  {
    recursive: true,
  }
);
fs.writeFileSync(
  path.join(
    HOME,
    "plugins",
    "cache",
    "demo-market",
    "demo-plugin",
    "1.0.0",
    ".codex-plugin",
    "plugin.json"
  ),
  JSON.stringify({
    name: "demo-plugin",
    version: "1.0.0",
    description: "A test plugin",
    interface: { displayName: "Demo Plugin", shortDescription: "The real installed plugin" },
  })
);

const discovery = require("../lib/codex-config-discovery");
const mutate = require("../lib/codex-config-mutate");

describe("codex config discovery", () => {
  after(() => {
    if (previousHome === undefined) delete process.env.DASHBOARD_CODEX_HOME;
    else process.env.DASHBOARD_CODEX_HOME = previousHome;
    if (previousDisablePluginCli === undefined)
      delete process.env.DASHBOARD_DISABLE_CODEX_PLUGIN_CLI;
    else process.env.DASHBOARD_DISABLE_CODEX_PLUGIN_CLI = previousDisablePluginCli;
    fs.rmSync(HOME, { recursive: true, force: true });
  });

  it("enumerates safe metadata without exposing config secrets", () => {
    const overview = discovery.readOverview();
    assert.equal(overview.home, HOME);
    assert.equal(overview.defaults.model, "gpt-5.6-terra");
    assert.equal(overview.counts.models, 1);
    assert.equal(overview.counts.mcp, 1);
    assert.equal(overview.counts.skills, 1);
    assert.equal(overview.counts.plugins, 1);
    assert.deepEqual(overview.plugins[0], {
      id: "demo-plugin@demo-market",
      name: "demo-plugin",
      displayName: "Demo Plugin",
      description: "The real installed plugin",
      marketplace: "demo-market",
      marketplaceLabel: "Demo Market",
      version: "1.0.0",
      enabled: true,
    });
    assert.match(overview.config.text, /\[redacted\]/);
    assert.doesNotMatch(overview.config.text, /super-secret/);
  });

  it("redacts safe file reads and rejects paths outside Codex home", () => {
    const allowed = discovery.readFileSafe(path.join(HOME, "config.toml"));
    assert.ok(!allowed.error);
    assert.match(allowed.text, /\[redacted\]/);
    assert.doesNotMatch(allowed.text, /super-secret/);

    const blocked = discovery.readFileSafe(path.join(os.tmpdir(), "not-codex-config.toml"));
    assert.match(blocked.error, /inside Codex home/);
  });

  it("edits only allowlisted files and creates a timestamped backup", () => {
    const config = path.join(HOME, "config.toml");
    const raw = mutate.readEditableFile(config);
    assert.match(raw.text, /super-secret/);

    const result = mutate.writeEditableFile({
      file: config,
      content: 'model = "gpt-5.6-sol"\n',
    });
    assert.equal(result.ok, true);
    assert.equal(result.created, false);
    assert.ok(result.backupPath);
    assert.match(fs.readFileSync(result.backupPath, "utf8"), /super-secret/);
    assert.equal(fs.readFileSync(config, "utf8"), 'model = "gpt-5.6-sol"\n');

    assert.throws(
      () => mutate.writeEditableFile({ file: path.join(HOME, "models_cache.json"), content: "{}" }),
      /not editable/
    );
  });

  it("does not follow an allowlisted configuration symlink", () => {
    const hooked = path.join(HOME, "hooks.json");
    const outside = path.join(os.tmpdir(), `codex-config-outside-${process.pid}.json`);
    fs.writeFileSync(outside, "{}\n");
    fs.unlinkSync(hooked);
    fs.symlinkSync(outside, hooked);
    assert.throws(() => mutate.readEditableFile(hooked), /symbolic link/);
    fs.unlinkSync(hooked);
    fs.writeFileSync(hooked, JSON.stringify({ hooks: { SessionStart: [{}] } }));
    fs.rmSync(outside, { force: true });
  });
});
