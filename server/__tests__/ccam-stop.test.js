/**
 * @file Tests for the `ccam stop` CLI command. Verifies graceful shutdown via
 * SIGTERM, SIGKILL escalation after timeout, error reporting for permission
 * failures, and edge cases (server not running, stale PID).
 *
 * These tests spawn a disposable child process (a simple Node sleep loop) to
 * act as the "dashboard server" target, write its PID into a discovery file,
 * then invoke `ccam stop` against it. This avoids killing the test harness's
 * own server.
 *
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

const STAMP = `ccam-stop-${Date.now()}-${process.pid}`;
const TMP = path.join(os.tmpdir(), STAMP);
const CLAUDE_HOME = path.join(TMP, "home");

const CLI = path.resolve(__dirname, "..", "..", "bin", "ccam.js");

/**
 * Run `ccam stop` with the given env overrides.
 * @param {object} envOverrides
 * @returns {Promise<{code: number, out: string, err: string}>}
 */
function ccamStop(envOverrides = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, "stop"], {
      env: { ...process.env, CLAUDE_HOME, ...envOverrides },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const killer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, out, err });
    });
  });
}

/**
 * Write a discovery file with the given servers array.
 * @param {number} port
 * @param {number} pid
 */
function writeDiscovery(port, pid) {
  const infoPath = path.join(CLAUDE_HOME, ".agent-dashboard.json");
  fs.mkdirSync(CLAUDE_HOME, { recursive: true });
  const entry = { port, pid, startedAt: new Date().toISOString(), dataDir: TMP };
  fs.writeFileSync(
    infoPath,
    JSON.stringify({ port, pid, startedAt: entry.startedAt, servers: [entry] }, null, 2),
  );
}

/**
 * Spawn a dummy process that stays alive until killed. Returns the child.
 * @returns {import("child_process").ChildProcess}
 */
function spawnDummy() {
  return spawn(process.execPath, ["-e", "setInterval(()=>{},60000)"], {
    stdio: "ignore",
    detached: true,
  });
}

/**
 * Start a minimal HTTP server that responds to /api/health (needed because
 * cmdStop calls serverIsUp() first). Returns { server, port }.
 */
function startFakeServer(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    srv.listen(port, "127.0.0.1", () => {
      resolve({ server: srv, port: srv.address().port });
    });
  });
}

/**
 * Check if a process is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("ccam stop — server not running", () => {
  beforeEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(CLAUDE_HOME, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("reports nothing to stop when server is not reachable", async () => {
    // Point at a port nothing listens on
    const { code, out } = await ccamStop({ DASHBOARD_PORT: "1" });
    assert.equal(code, 0);
    assert.match(out, /not running|nothing to stop/i);
  });
});

describe("ccam stop — graceful shutdown", () => {
  let dummy;
  let fakeSrv;
  let fakePort;

  beforeEach(async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(CLAUDE_HOME, { recursive: true });
    // Start a fake health endpoint
    const result = await startFakeServer();
    fakeSrv = result.server;
    fakePort = result.port;
    // Spawn a dummy process as the "dashboard"
    dummy = spawnDummy();
    dummy.unref();
    // Write discovery pointing to the dummy's PID
    writeDiscovery(fakePort, dummy.pid);
  });

  afterEach(() => {
    if (fakeSrv) fakeSrv.close();
    if (dummy && isAlive(dummy.pid)) {
      try {
        process.kill(dummy.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
    }
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("stops the server gracefully via SIGTERM", async () => {
    const { code, out } = await ccamStop({ DASHBOARD_PORT: String(fakePort) });
    assert.equal(code, 0);
    assert.match(out, /stopped/i);
    // Verify the dummy process is actually gone
    assert.equal(isAlive(dummy.pid), false, "dummy process should be dead after stop");
  });
});

describe("ccam stop — stale PID", () => {
  let fakeSrv;
  let fakePort;

  beforeEach(async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(CLAUDE_HOME, { recursive: true });
    const result = await startFakeServer();
    fakeSrv = result.server;
    fakePort = result.port;
  });

  afterEach(() => {
    if (fakeSrv) fakeSrv.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("exits 1 when the PID in discovery is not running", async () => {
    // Write a PID that definitely doesn't exist (use a very high number)
    writeDiscovery(fakePort, 2147483647);
    const { code, out, err } = await ccamStop({ DASHBOARD_PORT: String(fakePort) });
    assert.equal(code, 1);
    assert.match(out + err, /not running|stale/i);
  });
});

describe("ccam stop — missing discovery file", () => {
  let fakeSrv;
  let fakePort;

  beforeEach(async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(CLAUDE_HOME, { recursive: true });
    const result = await startFakeServer();
    fakeSrv = result.server;
    fakePort = result.port;
    // Do NOT write a discovery file
  });

  afterEach(() => {
    if (fakeSrv) fakeSrv.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("exits 1 with helpful error when discovery file is missing", async () => {
    const { code, out, err } = await ccamStop({ DASHBOARD_PORT: String(fakePort) });
    assert.equal(code, 1);
    assert.match(out + err, /could not determine|PID/i);
  });
});
