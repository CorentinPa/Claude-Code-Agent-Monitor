/**
 * @file Tests that an assistant's sessions are read from its transcript
 * tree: the file name is the session id, entries come back newest first, the
 * limit is honoured, sub-agent transcripts and non-JSONL files are excluded,
 * and a config dir with no projects tree yields an empty list.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { listRecentSessions } = require("../lib/xanaos-assistants");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "xanaos-sessions-test-"));
const CONFIG_DIR = path.join(TMP, "Xana");
const PROJECT_A = path.join(CONFIG_DIR, "projects", "-mnt-DATA2-xanaos-travail");
const PROJECT_B = path.join(CONFIG_DIR, "projects", "-tmp-wk-CG7CjU");
fs.mkdirSync(PROJECT_A, { recursive: true });
fs.mkdirSync(path.join(PROJECT_A, "aaaa", "subagents"), { recursive: true });
fs.mkdirSync(PROJECT_B, { recursive: true });

function writeTranscript(dir, name, mtimeMs) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, "{}\n");
  fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  return file;
}

writeTranscript(PROJECT_A, "aaaa.jsonl", 1_700_000_000_000);
writeTranscript(PROJECT_B, "bbbb.jsonl", 1_800_000_000_000);
writeTranscript(PROJECT_A, "notes.txt", 1_900_000_000_000);
writeTranscript(path.join(PROJECT_A, "aaaa", "subagents"), "agent-1234.jsonl", 1_900_000_000_000);

describe("listRecentSessions", () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("returns the session id from the file name, newest first", () => {
    const sessions = listRecentSessions(CONFIG_DIR);
    assert.deepEqual(
      sessions.map((s) => s.session_id),
      ["bbbb", "aaaa"]
    );
  });

  it("carries the absolute transcript path and the modification time", () => {
    const [newest] = listRecentSessions(CONFIG_DIR);
    assert.equal(newest.transcript_path, path.join(PROJECT_B, "bbbb.jsonl"));
    assert.match(newest.modified_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("excludes sub-agent transcripts and non-JSONL files", () => {
    const ids = listRecentSessions(CONFIG_DIR).map((s) => s.session_id);
    assert.equal(ids.includes("agent-1234"), false);
    assert.equal(ids.includes("notes"), false);
  });

  it("honours the limit", () => {
    assert.equal(listRecentSessions(CONFIG_DIR, 1).length, 1);
  });

  it("returns an empty list when there is no projects tree", () => {
    assert.deepEqual(listRecentSessions(path.join(TMP, "Jeremie")), []);
  });
});
