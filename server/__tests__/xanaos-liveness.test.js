/**
 * @file Tests that an assistant's live state is derived from a verified
 * process, not from the presence of a registry file: a stale entry whose
 * process is gone is dropped, an entry whose recorded start time disagrees
 * with /proc is dropped as a recycled PID, an unclaimed warm-pool spare
 * (however alive its process is) is dropped too, and the Remote Control
 * marker follows bridgeSessionId.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readProcStart, isProcessAlive, readLiveSessions } = require("../lib/xanaos-assistants");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "xanaos-liveness-test-"));
const CONFIG_DIR = path.join(TMP, "Xana");
const SESSIONS = path.join(CONFIG_DIR, "sessions");
fs.mkdirSync(SESSIONS, { recursive: true });

// This test process is the only PID guaranteed to be alive while the test runs.
const SELF = process.pid;
const SELF_START = readProcStart(SELF);
// A PID that cannot exist, so the liveness probe fails deterministically.
const DEAD = 2147483646;

function writeEntry(name, entry) {
  fs.writeFileSync(path.join(SESSIONS, name), JSON.stringify(entry));
}

writeEntry("live.json", {
  pid: SELF,
  procStart: SELF_START,
  sessionId: "aaaa-live",
  name: "Xana",
  cwd: "/mnt/DATA2/xanaos-travail",
  startedAt: 1788785499982,
  status: "busy",
  bridgeSessionId: "session_abc",
});
writeEntry("stale.json", {
  pid: DEAD,
  procStart: "1",
  sessionId: "bbbb-stale",
  status: "idle",
});
writeEntry("recycled.json", {
  pid: SELF,
  procStart: "999999999",
  sessionId: "cccc-recycled",
  status: "idle",
});
writeEntry("spare.json", {
  pid: SELF,
  procStart: SELF_START,
  sessionId: "dddd-spare",
  status: "idle",
  spare: true,
});
writeEntry("corrupt.json", "{ not json");
writeEntry("ignored.txt", {});

describe("process verification", () => {
  it("reads the start time of a live process from /proc when available", (t) => {
    if (SELF_START === null) return t.skip("no /proc on this platform");
    assert.match(SELF_START, /^\d+$/);
  });

  it("accepts a live process whose recorded start time agrees", () => {
    assert.equal(isProcessAlive(SELF, SELF_START), true);
  });

  it("rejects a dead process", () => {
    assert.equal(isProcessAlive(DEAD, "1"), false);
  });

  it("rejects a recycled PID whose start time disagrees", (t) => {
    if (SELF_START === null) return t.skip("no /proc on this platform");
    assert.equal(isProcessAlive(SELF, "999999999"), false);
  });

  it("rejects a malformed pid", () => {
    assert.equal(isProcessAlive(undefined, "1"), false);
    assert.equal(isProcessAlive(-1, "1"), false);
  });
});

describe("readLiveSessions", () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("keeps only entries backed by a verified process", () => {
    const live = readLiveSessions(CONFIG_DIR);
    assert.deepEqual(
      live.map((s) => s.session_id),
      ["aaaa-live"]
    );
  });

  it("maps the registry fields the view needs", () => {
    const [session] = readLiveSessions(CONFIG_DIR);
    assert.equal(session.name, "Xana");
    assert.equal(session.busy, true);
    assert.equal(session.remote_control, true);
    assert.equal(session.cwd, "/mnt/DATA2/xanaos-travail");
    assert.match(session.started_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns an empty list for a config dir with no sessions directory", () => {
    assert.deepEqual(readLiveSessions(path.join(TMP, "Jeremie")), []);
  });

  it("excludes an unclaimed warm-pool spare even though its process is alive", () => {
    const ids = readLiveSessions(CONFIG_DIR).map((s) => s.session_id);
    assert.equal(ids.includes("dddd-spare"), false);
  });
});
