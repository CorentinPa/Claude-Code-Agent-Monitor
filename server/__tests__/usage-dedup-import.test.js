/**
 * @file Tests the IMPORT side of per-message usage reconciliation, the
 * companion to usage-dedup.test.js (which covers the live TranscriptCache).
 *
 * Claude Code writes one JSONL record per content block, so a single API
 * response (one `message.id`) appears as several records each carrying the
 * message's `usage`. Summing every record inflated token totals and costs
 * 2-4x. The copies are not identical — streaming writes partial usage first
 * (e.g. output_tokens 5, then the final 742) — so the LAST record for a
 * message.id is authoritative.
 *
 * Covers:
 *   1. `parseSessionFile` / `parseSubagentFile` count each message once, last
 *      record wins, and keep counting id-less records unconditionally.
 *   2. `rememberUsageContribution` keeps the reconciliation window a bounded
 *      tail, so a multi-hundred-MiB transcript can't grow it without limit.
 *   3. `stmts.resetTokenUsage` zeroes the compaction baselines instead of
 *      folding a decrease into them like `replaceTokenUsage` does.
 *   4. The repair sweep (`reconcileTokens` with `all` + `resetBaselines`)
 *      re-derives inflated historical rows, clears stale bucket rows whose
 *      pricing key no longer occurs, and leaves workflow rows alone — while
 *      the default (non-reset) sweep still never reduces totals.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Both module-level constants below are read at require time, so they must be
// set before the modules under test are loaded.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `usage-dedup-import-${process.pid}-`));
const CLAUDE_HOME = path.join(TMP_ROOT, "claude");
const PROJECT_DIR = path.join(CLAUDE_HOME, "projects", "-tmp-proj");
fs.mkdirSync(PROJECT_DIR, { recursive: true });
process.env.CLAUDE_HOME = CLAUDE_HOME;

const TEST_DB = path.join(TMP_ROOT, "dashboard.db");
process.env.DASHBOARD_DB_PATH = TEST_DB;

const dbModule = require("../db");
const { db, stmts } = dbModule;
const { rememberUsageContribution, USAGE_RECONCILE_WINDOW } = require("../lib/token-usage");
const {
  parseSessionFile,
  parseSubagentFile,
  reconcileTokens,
} = require("../../scripts/import-history");

after(() => {
  if (db) db.close();
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

const MODEL = "claude-opus-4-8";
const STALE_MODEL = "claude-retired-1";

// One API response's final usage, and the partial usage streaming writes first.
const FINAL = {
  input_tokens: 11,
  output_tokens: 742,
  cache_read_input_tokens: 9000,
  cache_creation_input_tokens: 400,
};
const PARTIAL = { ...FINAL, output_tokens: 5 };
const SECOND = {
  input_tokens: 3,
  output_tokens: 60,
  cache_read_input_tokens: 1200,
  cache_creation_input_tokens: 0,
};

// Correct, per-message totals for the fixture below.
const EXPECTED = {
  input: FINAL.input_tokens + SECOND.input_tokens,
  output: FINAL.output_tokens + SECOND.output_tokens,
  cacheRead: FINAL.cache_read_input_tokens + SECOND.cache_read_input_tokens,
  cacheWrite: FINAL.cache_creation_input_tokens + SECOND.cache_creation_input_tokens,
};

function assistantLine(msgId, usage, blockType = "text") {
  const block =
    blockType === "thinking" ? { type: "thinking", thinking: "…" } : { type: "text", text: "x" };
  const message = { model: MODEL, usage, content: [block] };
  if (msgId) message.id = msgId;
  return JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-15T10:00:00.000Z",
    cwd: "/tmp/proj",
    message,
  });
}

/**
 * One message spread over three records whose usage evolves (partial, partial,
 * final) plus a second, single-record message — the shape that produced the
 * reported 2-4x inflation.
 */
function fixtureLines() {
  return [
    assistantLine("msg_a", PARTIAL, "thinking"),
    assistantLine("msg_a", PARTIAL),
    assistantLine("msg_a", FINAL),
    assistantLine("msg_b", SECOND),
  ];
}

function writeJsonl(filePath, lines) {
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return filePath;
}

/** The single expected bucket out of a parser's tokensByModel. */
function onlyBucket(tokensByModel) {
  const buckets = Object.values(tokensByModel || {});
  assert.equal(buckets.length, 1, "expected exactly one pricing bucket");
  return buckets[0];
}

describe("import parsers — usage reconciled per message.id", () => {
  it("parseSessionFile counts each message once, using the final record", async () => {
    const p = writeJsonl(path.join(TMP_ROOT, "session-dedup.jsonl"), fixtureLines());
    const parsed = await parseSessionFile(p);
    const bucket = onlyBucket(parsed.tokensByModel);

    assert.equal(bucket.output, EXPECTED.output);
    assert.equal(bucket.input, EXPECTED.input);
    assert.equal(bucket.cacheRead, EXPECTED.cacheRead);
    assert.equal(bucket.cacheWrite, EXPECTED.cacheWrite);
    // Guard the specific regression: the naive per-record sum is much larger.
    assert.notEqual(
      bucket.cacheRead,
      FINAL.cache_read_input_tokens * 3 + SECOND.cache_read_input_tokens
    );
  });

  it("parseSessionFile still counts every content block", async () => {
    const p = writeJsonl(path.join(TMP_ROOT, "session-blocks.jsonl"), fixtureLines());
    const parsed = await parseSessionFile(p);
    // Deduping usage must not dedupe the per-record thinking blocks: each
    // record carries a DISTINCT block, only the usage copy is repeated.
    assert.equal(parsed.thinkingBlockCount, 1);
    assert.equal(parsed.assistantMessages, 4);
  });

  it("parseSubagentFile counts each message once, using the final record", async () => {
    const p = writeJsonl(path.join(TMP_ROOT, "agent-sub-dedup.jsonl"), fixtureLines());
    const parsed = await parseSubagentFile(p);
    const bucket = onlyBucket(parsed.tokensByModel);

    assert.equal(bucket.output, EXPECTED.output);
    assert.equal(bucket.cacheRead, EXPECTED.cacheRead);
  });

  it("counts records without a message id unconditionally", async () => {
    const p = writeJsonl(path.join(TMP_ROOT, "session-no-id.jsonl"), [
      assistantLine(null, SECOND),
      assistantLine(null, SECOND),
    ]);
    const parsed = await parseSessionFile(p);
    assert.equal(onlyBucket(parsed.tokensByModel).output, SECOND.output_tokens * 2);
  });
});

describe("rememberUsageContribution — bounded reconciliation window", () => {
  it("keeps only the newest maxEntries ids", () => {
    const map = new Map();
    for (let i = 0; i < 10; i++) rememberUsageContribution(map, `m${i}`, { n: i }, 4);
    assert.equal(map.size, 4);
    assert.deepEqual([...map.keys()], ["m6", "m7", "m8", "m9"]);
  });

  it("refreshes recency on update instead of adding a second entry", () => {
    const map = new Map();
    rememberUsageContribution(map, "a", { n: 1 }, 3);
    rememberUsageContribution(map, "b", { n: 2 }, 3);
    rememberUsageContribution(map, "a", { n: 3 }, 3); // same id, newer value
    assert.equal(map.size, 2);
    assert.deepEqual(map.get("a"), { n: 3 });
    // "a" moved to the tail, so the next eviction drops "b" first.
    rememberUsageContribution(map, "c", { n: 4 }, 3);
    rememberUsageContribution(map, "d", { n: 5 }, 3);
    assert.deepEqual([...map.keys()], ["a", "c", "d"]);
  });

  it("defaults to the shared window size", () => {
    const map = new Map();
    for (let i = 0; i < USAGE_RECONCILE_WINDOW + 25; i++) {
      rememberUsageContribution(map, `m${i}`, { n: i });
    }
    assert.equal(map.size, USAGE_RECONCILE_WINDOW);
  });
});

// ---------------------------------------------------------------------------
// Repair path
// ---------------------------------------------------------------------------

function insertSession(id) {
  try {
    stmts.insertSession.run(id, "t", "active", "/tmp/proj", null, null);
  } catch {
    /* already present */
  }
}

/** Raw (pre-baseline-fold) row for a bucket. */
function rawRow(sessionId, model, tier = "standard") {
  return db
    .prepare(
      `SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              baseline_input, baseline_output, baseline_cache_read, baseline_cache_write
         FROM token_usage
        WHERE session_id = ? AND model = ? AND service_tier = ?`
    )
    .get(sessionId, model, tier);
}

function bucketRows(sessionId) {
  return db
    .prepare("SELECT model, service_tier FROM token_usage WHERE session_id = ? ORDER BY model")
    .all(sessionId);
}

/** Write a bucket through the normal high-water-mark path. */
function writeLive(sessionId, model, values, tier = "standard") {
  stmts.replaceTokenUsage.run(
    sessionId,
    model,
    "standard",
    "global",
    tier,
    values.input || 0,
    values.output || 0,
    values.cacheRead || 0,
    values.cacheWrite || 0,
    0,
    0,
    0,
    0
  );
}

describe("resetTokenUsage — zeroes baselines instead of folding", () => {
  before(() => insertSession("reset-1"));

  it("clears a baseline that replaceTokenUsage had accumulated", () => {
    // Inflated reading first, then the corrected (lower) one: the high-water
    // fold parks the difference in baseline_* so effective never drops.
    writeLive("reset-1", MODEL, { output: 1000, cacheRead: 20000 });
    writeLive("reset-1", MODEL, { output: 400, cacheRead: 8000 });
    const folded = rawRow("reset-1", MODEL);
    assert.equal(folded.baseline_output, 600, "high-water fold preserves the over-count");
    assert.equal(folded.baseline_cache_read, 12000);

    stmts.resetTokenUsage.run(
      "reset-1",
      MODEL,
      "standard",
      "global",
      "standard",
      0,
      400,
      8000,
      0,
      0,
      0,
      0,
      0
    );
    const repaired = rawRow("reset-1", MODEL);
    assert.equal(repaired.output_tokens, 400);
    assert.equal(repaired.cache_read_tokens, 8000);
    assert.equal(repaired.baseline_output, 0, "repair must not leave the over-count in baseline");
    assert.equal(repaired.baseline_cache_read, 0);
  });
});

describe("reconcileTokens — historical repair sweep", () => {
  const SESSION = "repair-1";

  before(() => {
    insertSession(SESSION);
    writeJsonl(path.join(PROJECT_DIR, `${SESSION}.jsonl`), fixtureLines());

    // Reproduce a pre-fix database: an inflated per-record total, then a
    // corrected lower re-read that the high-water fold parks in baseline_*.
    writeLive(SESSION, MODEL, {
      input: EXPECTED.input * 3,
      output: EXPECTED.output * 3,
      cacheRead: EXPECTED.cacheRead * 3,
      cacheWrite: EXPECTED.cacheWrite * 3,
    });
    writeLive(SESSION, MODEL, EXPECTED);
    // A bucket whose pricing key no longer occurs in the corrected derivation.
    writeLive(SESSION, STALE_MODEL, { output: 555, cacheRead: 777 });
    // Workflow rows come from run journals, not transcripts — the sweep can't
    // rebuild them, so it must not delete them either.
    writeLive(SESSION, MODEL, { output: 99, cacheRead: 88 }, "workflow");
  });

  it("leaves the inflation in place without --reset-baselines", async () => {
    await reconcileTokens(dbModule, { all: true });
    const row = rawRow(SESSION, MODEL);
    assert.equal(
      row.output_tokens + row.baseline_output,
      EXPECTED.output * 3,
      "default sweep must stay a high-water mark"
    );
    assert.ok(
      bucketRows(SESSION).some((r) => r.model === STALE_MODEL),
      "default sweep must not delete rows"
    );
  });

  it("re-derives correct totals and zeroes baselines with --reset-baselines", async () => {
    const counters = await reconcileTokens(dbModule, { all: true, resetBaselines: true });
    assert.ok(counters.sessionsTouched >= 1);

    const row = rawRow(SESSION, MODEL);
    assert.equal(row.output_tokens, EXPECTED.output);
    assert.equal(row.input_tokens, EXPECTED.input);
    assert.equal(row.cache_read_tokens, EXPECTED.cacheRead);
    assert.equal(row.cache_write_tokens, EXPECTED.cacheWrite);
    assert.equal(row.baseline_output, 0);
    assert.equal(row.baseline_cache_read, 0);
    assert.equal(row.baseline_input, 0);
    assert.equal(row.baseline_cache_write, 0);
  });

  it("clears stale bucket rows but preserves workflow rows", () => {
    const rows = bucketRows(SESSION);
    assert.ok(
      !rows.some((r) => r.model === STALE_MODEL),
      "a bucket key absent from the corrected derivation must not survive"
    );
    assert.ok(
      rows.some((r) => r.service_tier === "workflow"),
      "workflow rows are owned by workflow-ingest and must be preserved"
    );
    const workflow = rawRow(SESSION, MODEL, "workflow");
    assert.equal(workflow.output_tokens, 99);
    assert.equal(workflow.cache_read_tokens, 88);
  });

  it("clears a session's stale rows even when the corrected derivation is empty", async () => {
    const EMPTY = "repair-empty";
    insertSession(EMPTY);
    // A transcript with no assistant usage at all, but a timestamp so the
    // parser returns a session rather than null.
    writeJsonl(path.join(PROJECT_DIR, `${EMPTY}.jsonl`), [
      JSON.stringify({
        type: "user",
        timestamp: "2026-08-15T10:00:00.000Z",
        cwd: "/tmp/proj",
        message: { role: "user", content: "hi" },
      }),
    ]);
    writeLive(EMPTY, MODEL, { output: 12345, cacheRead: 6789 });
    assert.ok(rawRow(EMPTY, MODEL));

    await reconcileTokens(dbModule, { all: true, resetBaselines: true });
    assert.equal(
      rawRow(EMPTY, MODEL),
      undefined,
      "stale rows must be cleared with nothing to replace them"
    );
  });

  it("skips sessions whose transcript is gone rather than clearing them", async () => {
    const GONE = "repair-no-transcript";
    insertSession(GONE);
    writeLive(GONE, MODEL, { output: 4242, cacheRead: 2121 });

    const counters = await reconcileTokens(dbModule, { all: true, resetBaselines: true });
    assert.ok(counters.missingFiles >= 1);
    // Deleting these would destroy real usage we cannot re-derive, so the
    // sweep deliberately leaves them untouched (documented limitation).
    assert.equal(rawRow(GONE, MODEL).output_tokens, 4242);
  });
});
