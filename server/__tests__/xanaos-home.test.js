/**
 * @file xanaos-home.test.js
 * @description Tests for the XanaOS assistants-directory resolver: the operator
 * override wins, auto-detection falls back to the conventional sibling of the
 * dashboard checkout, an empty value returns to auto-detection, and invalid
 * paths are rejected rather than silently accepted.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "xanaos-home-test-"));
const REAL_DIR = path.join(TMP, "assistantes");
const A_FILE = path.join(TMP, "not-a-directory");
fs.mkdirSync(REAL_DIR, { recursive: true });
fs.writeFileSync(A_FILE, "x");

// writeEnvFile targets DASHBOARD_ENV_PATH, so the test never touches the repo .env.
process.env.DASHBOARD_ENV_PATH = path.join(TMP, ".env");

const home = require("../lib/xanaos-home");

describe("xanaos-home", () => {
  beforeEach(() => {
    delete process.env.XANAOS_ASSISTANTS_DIR;
    delete process.env.XANAOS_CONFIG_ROOT;
  });

  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("prefers the configured directory over auto-detection", () => {
    process.env.XANAOS_ASSISTANTS_DIR = REAL_DIR;
    const resolved = home.resolveAssistantsDir();
    assert.equal(resolved.dir, REAL_DIR);
    assert.equal(resolved.source, "configured");
    assert.equal(resolved.exists, true);
  });

  it("reports a configured directory that no longer exists", () => {
    process.env.XANAOS_ASSISTANTS_DIR = path.join(TMP, "gone");
    const resolved = home.resolveAssistantsDir();
    assert.equal(resolved.source, "configured");
    assert.equal(resolved.exists, false);
  });

  it("setAssistantsDir accepts an existing directory and persists it", () => {
    const resolved = home.setAssistantsDir(REAL_DIR);
    assert.equal(resolved.dir, REAL_DIR);
    assert.equal(resolved.source, "configured");
    assert.match(fs.readFileSync(process.env.DASHBOARD_ENV_PATH, "utf8"), /XANAOS_ASSISTANTS_DIR=/);
  });

  it("setAssistantsDir with an empty value returns to auto-detection", () => {
    process.env.XANAOS_ASSISTANTS_DIR = REAL_DIR;
    const resolved = home.setAssistantsDir("   ");
    assert.notEqual(resolved.source, "configured");
    assert.equal(process.env.XANAOS_ASSISTANTS_DIR, undefined);
  });

  it("rejects a relative path, a missing path, and a file", () => {
    assert.throws(() => home.setAssistantsDir("relative/path"), /absolute/);
    assert.throws(() => home.setAssistantsDir(path.join(TMP, "missing")), /does not exist/);
    assert.throws(() => home.setAssistantsDir(A_FILE), /Not a directory/);
  });

  it("getConfigRoot defaults to ~/.Xanaos and honours an override", () => {
    assert.equal(home.getConfigRoot(), path.join(os.homedir(), ".Xanaos"));
    process.env.XANAOS_CONFIG_ROOT = TMP;
    assert.equal(home.getConfigRoot(), TMP);
  });
});
