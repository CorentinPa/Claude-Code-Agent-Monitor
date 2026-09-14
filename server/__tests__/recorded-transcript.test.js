/**
 * @file Tests that a session's transcript can be resolved from the absolute
 * path the runtime itself reported at SessionStart. This is what lets a
 * session living under a non-default CLAUDE_CONFIG_DIR — a XanaOS assistant,
 * a second profile — render its conversation at all: the default resolvers
 * only look under CLAUDE_HOME.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "recorded-transcript-test-"));
process.env.DASHBOARD_DATA_DIR = path.join(TMP, "data");
fs.mkdirSync(process.env.DASHBOARD_DATA_DIR, { recursive: true });

const { db } = require("../db");
const { getRecordedTranscriptPath } = require("../lib/recorded-transcript");

const ELSEWHERE = path.join(TMP, "Xanaos", "Jeremie", "projects", "-work");
fs.mkdirSync(ELSEWHERE, { recursive: true });
const TRANSCRIPT = path.join(ELSEWHERE, "sess-elsewhere.jsonl");
fs.writeFileSync(TRANSCRIPT, "{}\n");

describe("getRecordedTranscriptPath", () => {
  before(() => {
    const insertSession = db.prepare(
      "INSERT INTO sessions (id, name, status, started_at) VALUES (?, ?, ?, ?)"
    );
    const insertEvent = db.prepare(
      "INSERT INTO events (session_id, event_type, summary, data, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    for (const id of ["sess-elsewhere", "sess-gone", "sess-noevent", "sess-multi"]) {
      insertSession.run(id, id, "completed", "2026-09-07T12:00:00.000Z");
    }
    insertEvent.run(
      "sess-elsewhere",
      "SessionStart",
      "Session started",
      JSON.stringify({ transcript_path: TRANSCRIPT }),
      "2026-09-07T12:00:00.000Z"
    );
    insertEvent.run(
      "sess-gone",
      "SessionStart",
      "Session started",
      JSON.stringify({ transcript_path: path.join(TMP, "vanished.jsonl") }),
      "2026-09-07T12:00:00.000Z"
    );
    // Two SessionStart events (a resumed session): the later one wins.
    insertEvent.run(
      "sess-multi",
      "SessionStart",
      "Session started",
      JSON.stringify({ transcript_path: path.join(TMP, "vanished.jsonl") }),
      "2026-09-07T12:00:00.000Z"
    );
    insertEvent.run(
      "sess-multi",
      "SessionStart",
      "Session resumed",
      JSON.stringify({ transcript_path: TRANSCRIPT }),
      "2026-09-07T13:00:00.000Z"
    );
  });

  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("returns the absolute path the runtime recorded, when the file still exists", () => {
    assert.equal(getRecordedTranscriptPath("sess-elsewhere"), TRANSCRIPT);
  });

  it("returns null when the recorded path no longer exists on disk", () => {
    assert.equal(getRecordedTranscriptPath("sess-gone"), null);
  });

  it("returns null when the session has no SessionStart event", () => {
    assert.equal(getRecordedTranscriptPath("sess-noevent"), null);
  });

  it("returns null for an unknown session id", () => {
    assert.equal(getRecordedTranscriptPath("sess-does-not-exist"), null);
  });

  it("uses the most recent SessionStart when a session was resumed", () => {
    assert.equal(getRecordedTranscriptPath("sess-multi"), TRANSCRIPT);
  });
});
