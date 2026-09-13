/**
 * @file Tests for GET /api/xanaos/assistants. Builds a fake assistants
 * directory and a fake config root in tmpdir, points the server at both, and
 * asserts the resolved directory, its source, the discovered cards, the
 * live/Remote Control state derived from a real session registry entry, and
 * the empty payload returned when the assistants directory does not resolve.
 * Sessions and transcripts stay out of scope for this route.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "xanaos-route-test-"));
const ASSISTANTS = path.join(TMP, "assistantes");
const CONFIG_ROOT = path.join(TMP, "config");
const XANA_SESSIONS = path.join(CONFIG_ROOT, "Xana", "sessions");

fs.mkdirSync(path.join(ASSISTANTS, "Xana-IA-Orchestration"), { recursive: true });
fs.mkdirSync(path.join(ASSISTANTS, "Jeremie-IA-Construction"), { recursive: true });
fs.mkdirSync(XANA_SESSIONS, { recursive: true });
// Jeremie's config dir under CONFIG_ROOT is deliberately absent: never deployed.

fs.writeFileSync(
  path.join(XANA_SESSIONS, "live.json"),
  JSON.stringify({
    pid: process.pid,
    procStart: (() => {
      try {
        const stat = fs.readFileSync(`/proc/${process.pid}/stat`, "utf8");
        return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      } catch {
        return "1";
      }
    })(),
    sessionId: "sess-live",
    status: "busy",
    bridgeSessionId: "session_abc",
  })
);

process.env.XANAOS_ASSISTANTS_DIR = ASSISTANTS;
process.env.XANAOS_CONFIG_ROOT = CONFIG_ROOT;
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");
fs.mkdirSync(process.env.DASHBOARD_DATA_DIR, { recursive: true });

const { createApp } = require("../index");

let server;
let baseUrl;

function get(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${pathname}`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      })
      .on("error", reject);
  });
}

describe("GET /api/xanaos/assistants", () => {
  before(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server?.close();
    delete process.env.XANAOS_ASSISTANTS_DIR;
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("reports the resolved directory and its source", async () => {
    const { status, body } = await get("/api/xanaos/assistants");
    assert.equal(status, 200);
    assert.equal(body.assistants_dir, ASSISTANTS);
    assert.equal(body.assistants_dir_source, "configured");
    assert.equal(body.assistants_dir_exists, true);
  });

  it("returns one card per discovered assistant", async () => {
    const { body } = await get("/api/xanaos/assistants");
    assert.deepEqual(body.assistants.map((a) => a.first_name).sort(), ["Jeremie", "Xana"]);
    assert.equal(body.totals.discovered, 2);
  });

  it("reports an assistant with a verified live, busy, Remote-Control-exposed session as up", async () => {
    const { body } = await get("/api/xanaos/assistants");
    const xana = body.assistants.find((a) => a.first_name === "Xana");
    assert.equal(xana.deployed, true);
    assert.equal(xana.up, true);
    assert.equal(xana.busy, true);
    assert.equal(xana.remote_control, true);
    assert.equal(body.totals.up, 1);
    assert.equal(body.totals.remote_control, 1);
  });

  it("reports an assistant with no config dir as never deployed, not up", async () => {
    const { body } = await get("/api/xanaos/assistants");
    const jeremie = body.assistants.find((a) => a.first_name === "Jeremie");
    assert.equal(jeremie.deployed, false);
    assert.equal(jeremie.config_dir, null);
    assert.equal(jeremie.up, false);
    assert.equal(jeremie.remote_control, false);
  });

  it("returns an empty payload when the configured directory does not exist", async () => {
    // Unsetting the override entirely would fall through to auto-detection,
    // which finds this checkout's own OS/assistantes — not what this case
    // means to exercise. Pointing the override at a missing path keeps the
    // "configured but absent" case deterministic regardless of checkout layout.
    process.env.XANAOS_ASSISTANTS_DIR = path.join(TMP, "gone");
    const { body } = await get("/api/xanaos/assistants");
    assert.equal(body.assistants_dir_source, "configured");
    assert.equal(body.assistants_dir_exists, false);
    assert.deepEqual(body.assistants, []);
    assert.equal(body.totals.discovered, 0);
    process.env.XANAOS_ASSISTANTS_DIR = ASSISTANTS;
  });
});
