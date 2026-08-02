/**
 * @file Verifies incremental Codex rollout ingestion: session metadata, token
 * deltas, context bands, duplicate safety, and transcript-driven card
 * lifecycle transitions.
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
const hooksRouter = require("../routes/hooks");
const {
  findCodexTranscriptForSession,
  ingestCodexHook,
  ingestCodexTranscript,
  reconcileCodexSessionLiveness,
  refreshCodexSessionTitles,
} = require("../lib/codex-ingest");

const SESSION_ID = "019a4ba6-a2b6-75f0-b186-bddd23ae4f2f";
const ROLLOUT = path.join(
  process.env.DASHBOARD_CODEX_HOME,
  "sessions",
  "2026",
  "08",
  "01",
  `rollout-2026-08-01T12-00-00-${SESSION_ID}.jsonl`
);

const RENAMED_SESSION_ID = "019fbb99-bd87-7c80-afec-ee65e2ebbe1c";
const RENAMED_ROLLOUT = path.join(
  process.env.DASHBOARD_CODEX_HOME,
  "sessions",
  "2026",
  "08",
  "01",
  `rollout-2026-08-01T13-00-00-${RENAMED_SESSION_ID}.jsonl`
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
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "working");
    assert.equal(findCodexTranscriptForSession(SESSION_ID), ROLLOUT);
    assert.equal(
      hooksRouter.codexTranscriptPath({ thread_id: SESSION_ID }),
      ROLLOUT,
      "a hook can resolve a thread id even when its payload omits transcript_path"
    );

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

  it("maps task completion, resumed work, and interrupted work to Claude-equivalent card states", () => {
    append(record("event_msg", { type: "task_complete" }));
    ingestCodexTranscript(ROLLOUT);
    let session = stmts.getSession.get(SESSION_ID);
    let agent = stmts.getAgent.get(`codex:${SESSION_ID}`);
    assert.equal(session.status, "active", "a finished turn keeps the session resumable");
    assert.equal(session.awaiting_reason, "stop");
    assert.equal(agent.status, "waiting");
    assert.equal(agent.awaiting_reason, "stop");

    append(record("event_msg", { type: "user_message", message: "Continue the session" }));
    append(record("event_msg", { type: "task_started" }));
    ingestCodexTranscript(ROLLOUT);
    session = stmts.getSession.get(SESSION_ID);
    agent = stmts.getAgent.get(`codex:${SESSION_ID}`);
    assert.equal(session.awaiting_input_since, null);
    assert.equal(agent.status, "working");
    assert.equal(agent.awaiting_input_since, null);

    append(record("event_msg", { type: "turn_aborted" }));
    ingestCodexTranscript(ROLLOUT);
    session = stmts.getSession.get(SESSION_ID);
    agent = stmts.getAgent.get(`codex:${SESSION_ID}`);
    assert.equal(session.status, "active");
    assert.equal(session.awaiting_reason, "interrupted");
    assert.equal(agent.status, "waiting");
    assert.equal(agent.awaiting_reason, "interrupted");

    // Simulate a dashboard restart from a pre-fix cursor: the terminal event
    // is already recorded, but its old card state lacks awaiting markers.
    stmts.clearSessionAwaitingInput.run(SESSION_ID);
    stmts.clearAgentAwaitingInput.run(`codex:${SESSION_ID}`);
    stmts.updateAgent.run(null, "working", null, null, null, null, `codex:${SESSION_ID}`);
    const repaired = reconcileCodexSessionLiveness();
    assert.equal(repaired.length, 1);
    assert.equal(stmts.getSession.get(SESSION_ID).awaiting_reason, "interrupted");
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "waiting");

    // A silent working turn has no completed-turn record to reconcile. The
    // short test threshold models the production 90-second conservative
    // fallback and ensures cards cannot remain Active forever after Codex
    // stops writing.
    append(record("event_msg", { type: "task_started" }));
    ingestCodexTranscript(ROLLOUT);
    const staleAt = new Date(Date.now() - 1_000);
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(
      staleAt.toISOString(),
      SESSION_ID
    );
    fs.utimesSync(ROLLOUT, staleAt, staleAt);
    const idleRepaired = reconcileCodexSessionLiveness({ workingIdleMs: 1 });
    assert.equal(idleRepaired.length, 1);
    assert.equal(stmts.getSession.get(SESSION_ID).awaiting_reason, "interrupted");
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "waiting");
  });

  it("applies SessionEnd immediately even when no additional rollout line exists", () => {
    const result = ingestCodexHook(ROLLOUT, "SessionEnd");
    assert.equal(result.changed, true);
    assert.equal(stmts.getSession.get(SESSION_ID).status, "completed");
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "completed");
  });

  it("self-heals a completed Codex session when its rollout receives a new turn", () => {
    append(record("event_msg", { type: "task_started" }));
    const result = ingestCodexTranscript(ROLLOUT);
    assert.equal(result.changed, true);
    assert.equal(stmts.getSession.get(SESSION_ID).status, "active");
    assert.equal(stmts.getSession.get(SESSION_ID).ended_at, null);
    assert.equal(stmts.getAgent.get(`codex:${SESSION_ID}`).status, "working");
  });

  it("uses and live-syncs Codex's native /rename title from session_index.jsonl", () => {
    const indexPath = path.join(process.env.DASHBOARD_CODEX_HOME, "session_index.jsonl");
    fs.writeFileSync(
      indexPath,
      `${JSON.stringify({ id: RENAMED_SESSION_ID, thread_name: "hehe" })}\n`
    );
    fs.mkdirSync(path.dirname(RENAMED_ROLLOUT), { recursive: true });
    fs.writeFileSync(
      RENAMED_ROLLOUT,
      `${JSON.stringify(
        record("session_meta", { id: RENAMED_SESSION_ID, cwd: "/workspace/renamed" })
      )}\n`
    );

    const created = ingestCodexTranscript(RENAMED_ROLLOUT);
    assert.equal(created.session.name, "hehe");

    fs.appendFileSync(
      indexPath,
      `${JSON.stringify({ id: RENAMED_SESSION_ID, thread_name: "ship transcript fixes" })}\n`
    );
    const updates = refreshCodexSessionTitles();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].session.name, "ship transcript fixes");
  });
});
