/**
 * @file Verifies incremental Codex rollout ingestion: session metadata, token
 * deltas, context bands, duplicate safety, and lifecycle hook finalization.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ccam-codex-ingest-"));
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");
process.env.DASHBOARD_CODEX_HOME = path.join(TMP, "codex");

const { db, stmts } = require("../db");
const { ingestCodexHook, ingestCodexTranscript } = require("../lib/codex-ingest");

const SESSION_ID = "019a4ba6-a2b6-75f0-b186-bddd23ae4f2f";
const ROLLOUT = path.join(
  process.env.DASHBOARD_CODEX_HOME,
  "sessions",
  "2026",
  "08",
  "01",
  `rollout-2026-08-01T12-00-00-${SESSION_ID}.jsonl`
);

function append(record) {
  fs.mkdirSync(path.dirname(ROLLOUT), { recursive: true });
  fs.appendFileSync(ROLLOUT, `${JSON.stringify(record)}\n`);
}

function record(type, payload) {
  return { timestamp: "2026-08-01T12:00:00.000Z", type, payload };
}

after(() => {
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe("Codex rollout ingestor", () => {
  it("accounts cumulatives exactly once and splits long/short requests", () => {
    append(
      record("session_meta", {
        id: SESSION_ID,
        timestamp: "2026-08-01T12:00:00.000Z",
        cwd: "/workspace/demo",
        cli_version: "1.0.0",
        model_provider: "openai",
      })
    );
    append(record("turn_context", { model: "gpt-5.6-terra", service_tier: "standard" }));
    append(record("event_msg", { type: "user_message", message: "Track my Codex session" }));
    append(
      record("event_msg", {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 300_000,
            cached_input_tokens: 100_000,
            cache_write_input_tokens: 20_000,
            output_tokens: 1_000,
            reasoning_output_tokens: 250,
          },
        },
      })
    );

    const first = ingestCodexTranscript(ROLLOUT);
    assert.equal(first.changed, true);
    assert.equal(first.created, true);
    assert.equal(first.session.provider, "codex");
    assert.equal(first.session.transcript_path, ROLLOUT);
    assert.equal(first.session.name, "Track my Codex session");

    const long = stmts.getTokensBySession
      .all(SESSION_ID)
      .find((row) => row.context_size === "long");
    assert.equal(long.input_tokens, 180_000); // total less cached and cache-write tokens
    assert.equal(long.cache_read_tokens, 100_000);
    assert.equal(long.cache_write_tokens, 20_000);
    assert.equal(long.output_tokens, 1_250); // output + reasoning output

    assert.equal(ingestCodexTranscript(ROLLOUT).changed, false, "unchanged bytes must be free");

    append(
      record("event_msg", {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 300_100,
            cached_input_tokens: 100_000,
            cache_write_input_tokens: 20_000,
            output_tokens: 1_020,
            reasoning_output_tokens: 250,
          },
        },
      })
    );
    assert.equal(ingestCodexTranscript(ROLLOUT).changed, true);
    const short = stmts.getTokensBySession
      .all(SESSION_ID)
      .find((row) => row.context_size === "short");
    assert.equal(short.input_tokens, 100);
    assert.equal(short.output_tokens, 20);
  });

  it("applies SessionEnd immediately even when no additional rollout line exists", () => {
    const result = ingestCodexHook(ROLLOUT, "SessionEnd");
    assert.equal(result.changed, true);
    assert.equal(stmts.getSession.get(SESSION_ID).status, "completed");
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "completed");
  });
});
