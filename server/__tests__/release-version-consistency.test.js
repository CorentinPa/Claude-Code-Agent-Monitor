/**
 * @file Guards release metadata that must carry the root package version.
 * The checks make version bumps fail fast when packaged artifacts drift.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

describe("release version consistency", () => {
  const packageVersion = readJson("package.json").version;

  it("keeps package metadata and lockfile roots aligned", () => {
    const rootLockfile = readJson("package-lock.json");
    const desktopPackage = readJson("desktop/package.json");
    const desktopLockfile = readJson("desktop/package-lock.json");

    assert.equal(rootLockfile.version, packageVersion);
    assert.equal(rootLockfile.packages[""].version, packageVersion);
    assert.equal(desktopPackage.version, packageVersion);
    assert.equal(desktopLockfile.version, packageVersion);
    assert.equal(desktopLockfile.packages[""].version, packageVersion);
  });
});
