/**
 * @file stats-range.test.js
 * @description Tests the `from`/`to` time window threaded through GET /api/stats
 * and GET /api/pricing/cost, which back the dashboard's stat cards. Each counter
 * is windowed on its own timestamp (sessions.started_at, agents.started_at,
 * events.created_at) so the cards agree with the activity feed's `from` filter.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `dashboard-range-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.DASHBOARD_LIVENESS_PROBE = "0";

const { createApp, startServer } = require("../index");
const { db, stmts } = require("../db");

let server;
let BASE;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const OLD = "2020-01-01T00:00:00.000Z";
const RECENT = new Date(Date.now() - 60 * 1000).toISOString();
const CUTOFF = new Date(Date.now() - 60 * 60 * 1000).toISOString();

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;

  // Two sessions with an agent and an event each: one far in the past, one now.
  for (const [id, at] of [
    ["range-old", OLD],
    ["range-new", RECENT],
  ]) {
    stmts.insertSession.run(id, id, "active", "/tmp", "claude-opus-4-8", null);
    db.prepare("UPDATE sessions SET started_at = ? WHERE id = ?").run(at, id);
    stmts.insertAgent.run(`${id}-main`, id, "Main", "main", null, "working", null, null, null);
    db.prepare("UPDATE agents SET started_at = ? WHERE id = ?").run(at, `${id}-main`);
    stmts.insertEventAt.run(id, `${id}-main`, "PreToolUse", "Bash", "s", "{}", at);
    stmts.upsertTokenUsage.run(id, "claude-opus-4-8", 1000, 1000, 0, 0);
  }
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* ignore */
    }
  }
});

describe("GET /api/stats time window", () => {
  it("counts everything when no window is given", async () => {
    const res = await get("/api/stats");
    assert.equal(res.status, 200);
    assert.equal(res.body.total_sessions, 2);
    assert.equal(res.body.total_agents, 2);
    assert.equal(res.body.total_events, 2);
  });

  it("windows each counter on its own timestamp", async () => {
    const res = await get(`/api/stats?from=${encodeURIComponent(CUTOFF)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.total_sessions, 1);
    assert.equal(res.body.active_sessions, 1);
    assert.equal(res.body.total_agents, 1);
    assert.equal(res.body.active_agents, 1);
    assert.equal(res.body.total_events, 1);
  });

  it("honours an upper bound", async () => {
    const res = await get(`/api/stats?to=${encodeURIComponent(CUTOFF)}`);
    assert.equal(res.body.total_sessions, 1);
    assert.equal(res.body.total_events, 1);
  });

  it("ignores an unparseable bound rather than returning nothing", async () => {
    const res = await get("/api/stats?from=not-a-date");
    assert.equal(res.status, 200);
    assert.equal(res.body.total_sessions, 2);
  });

  it("composes the window with the provider scope", async () => {
    const res = await get(`/api/stats?from=${encodeURIComponent(CUTOFF)}&providers=codex`);
    assert.equal(res.body.total_sessions, 0);
  });
});

describe("GET /api/pricing/cost time window", () => {
  it("prices only the sessions inside the window", async () => {
    const all = await get("/api/pricing/cost");
    const windowed = await get(`/api/pricing/cost?from=${encodeURIComponent(CUTOFF)}`);
    assert.ok(all.body.total_cost > 0);
    assert.ok(windowed.body.total_cost > 0);
    assert.ok(windowed.body.total_cost < all.body.total_cost);
  });

  it("ignores an unparseable bound", async () => {
    const all = await get("/api/pricing/cost");
    const bogus = await get("/api/pricing/cost?from=nope");
    assert.equal(bogus.body.total_cost, all.body.total_cost);
  });
});
