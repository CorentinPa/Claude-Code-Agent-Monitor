#!/usr/bin/env node
// Forwards a Codex lifecycle hook to each live dashboard without waiting for a
// response, so monitoring never delays the Codex CLI.
// @author Son Nguyen <hoangson091104@gmail.com>

const http = require("http");

const hookType = process.argv[2] || "unknown";

function resolvePorts() {
  try {
    return require("../server/lib/server-info").resolveHookIngestPorts();
  } catch {
    const port = Number.parseInt(process.env.CLAUDE_DASHBOARD_PORT || "", 10);
    return [Number.isInteger(port) && port > 0 ? port : 4820];
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    data = { raw: input };
  }
  const payload = JSON.stringify({ hook_type: hookType, data });
  const contentLength = Buffer.byteLength(payload);
  const sends = resolvePorts().map(
    (port) =>
      new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        const request = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api/hooks/codex",
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": contentLength },
            timeout: 2000,
          },
          (response) => response.resume()
        );
        request.on("error", done);
        request.on("timeout", () => {
          request.destroy();
          done();
        });
        request.write(payload);
        request.end(done);
      })
  );
  Promise.all(sends).finally(() => setImmediate(() => process.exit(0)));
});
setTimeout(() => process.exit(0), 2500);
