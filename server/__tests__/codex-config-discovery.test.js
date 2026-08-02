/**
 * @file Tests for the read-only Codex configuration discovery helpers. The
 * fixtures prove that metadata is enumerated while secrets and paths outside
 * of CODEX_HOME remain unavailable to the dashboard.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "codex-config-discovery-"));
const previousHome = process.env.DASHBOARD_CODEX_HOME;
process.env.DASHBOARD_CODEX_HOME = HOME;

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

const discovery = require("../lib/codex-config-discovery");

describe("codex config discovery", () => {
  after(() => {
    if (previousHome === undefined) delete process.env.DASHBOARD_CODEX_HOME;
    else process.env.DASHBOARD_CODEX_HOME = previousHome;
    fs.rmSync(HOME, { recursive: true, force: true });
  });

  it("enumerates safe metadata without exposing config secrets", () => {
    const overview = discovery.readOverview();
    assert.equal(overview.home, HOME);
    assert.equal(overview.defaults.model, "gpt-5.6-terra");
    assert.equal(overview.counts.models, 1);
    assert.equal(overview.counts.mcp, 1);
    assert.equal(overview.counts.skills, 1);
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
});
