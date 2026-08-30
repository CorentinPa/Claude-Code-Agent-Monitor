/**
 * @file Unit tests for the in-app manual routes (GET /api/manual and
 * /api/manual/:slug): the listing mirrors docs/*.md, a document round-trips its
 * Markdown, and a slug that does not match the listing - including a traversal
 * attempt - is refused instead of reaching the filesystem.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const manualRouter = require("../routes/manual");

const DOCS_DIR = path.join(__dirname, "..", "..", "docs");

let server;
let base;

async function get(urlPath) {
  const res = await fetch(`${base}${urlPath}`);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  const app = express();
  app.use("/api/manual", manualRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
});

describe("GET /api/manual", () => {
  it("lists every top-level Markdown file under docs/", async () => {
    const onDisk = fs
      .readdirSync(DOCS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.basename(entry.name, ".md").toLowerCase())
      .sort();

    const { status, body } = await get("/api/manual");
    assert.equal(status, 200);
    assert.deepEqual(
      body.documents.map((doc) => doc.slug),
      onDisk
    );
    for (const doc of body.documents) {
      assert.ok(doc.title.length > 0, `${doc.slug} has a title`);
      assert.ok(doc.bytes > 0, `${doc.slug} has a size`);
      assert.ok(!doc.title.includes("`"), `${doc.slug} title has no code-span backticks`);
    }
  });
});

describe("GET /api/manual/:slug", () => {
  it("returns the document's Markdown byte-for-byte", async () => {
    const { status, body } = await get("/api/manual/hooks");
    assert.equal(status, 200);
    assert.equal(body.slug, "hooks");
    assert.equal(body.markdown, fs.readFileSync(path.join(DOCS_DIR, "HOOKS.md"), "utf8"));
  });

  it("matches the slug case-insensitively", async () => {
    const { status, body } = await get("/api/manual/HOOKS");
    assert.equal(status, 200);
    assert.equal(body.slug, "hooks");
  });

  it("refuses an unknown slug", async () => {
    const { status, body } = await get("/api/manual/nope");
    assert.equal(status, 404);
    assert.equal(body.error.code, "ENOTFOUND");
  });

  it("refuses a path-traversal slug instead of reading outside docs/", async () => {
    for (const slug of ["..%2F..%2Fserver%2Fdb", "..%2F..%2Fpackage", "%2Fetc%2Fpasswd"]) {
      const { status, body } = await get(`/api/manual/${slug}`);
      assert.equal(status, 404, `${slug} is refused`);
      assert.equal(body.error.code, "ENOTFOUND");
    }
  });
});
