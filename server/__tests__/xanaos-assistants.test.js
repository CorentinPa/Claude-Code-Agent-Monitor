/**
 * @file Tests for XanaOS assistant discovery: both directory-naming forms are
 * parsed, non-conforming directories are ignored rather than erroring, the
 * README description is extracted and truncated, sub-agents and the distilled
 * runtime are detected, and a missing directory yields an empty list instead
 * of throwing.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "xanaos-assistants-test-"));
const DIR = path.join(TMP, "assistantes");

const XANA = path.join(DIR, "Xana-IA-Orchestration");
fs.mkdirSync(path.join(XANA, "subAgents"), { recursive: true });
fs.mkdirSync(path.join(XANA, "runtime"), { recursive: true });
fs.writeFileSync(path.join(XANA, "subAgents", "routingGuardDesk.md"), "# guard");
fs.writeFileSync(path.join(XANA, "subAgents", "notes.txt"), "ignored");
fs.writeFileSync(path.join(XANA, "runtime", "CLAUDE.md"), "# brain");
fs.writeFileSync(
  path.join(XANA, "README.md"),
  "---\ntitre: Xana\nagent: Xana\n---\n\n# Xana\n\n> une citation ignoree\n\nElle oriente les demandes vers la bonne assistante\net ne produit rien elle-meme.\n"
);

// Old naming form, no runtime, no sub-agents, no README.
fs.mkdirSync(path.join(DIR, "Marie-Claire-AssistanteIA-Support-Client"), { recursive: true });

// Neither form: must be ignored without erroring.
fs.mkdirSync(path.join(DIR, "notes"), { recursive: true });
fs.writeFileSync(path.join(DIR, "README.md"), "not a directory");

const { parseAssistantDirName, discoverAssistants } = require("../lib/xanaos-assistants");

describe("parseAssistantDirName", () => {
  it("parses the current form", () => {
    assert.deepEqual(parseAssistantDirName("Jeremie-IA-Construction"), {
      firstName: "Jeremie",
      role: "Construction",
    });
  });

  it("parses the legacy form and a compound first name", () => {
    assert.deepEqual(parseAssistantDirName("Marie-Claire-AssistanteIA-Support-Client"), {
      firstName: "Marie-Claire",
      role: "Support Client",
    });
  });

  it("returns null for a non-conforming name", () => {
    assert.equal(parseAssistantDirName("notes"), null);
    assert.equal(parseAssistantDirName("Xana-Orchestration"), null);
  });
});

describe("discoverAssistants", () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it("returns one entry per conforming directory, sorted by first name", () => {
    const found = discoverAssistants(DIR);
    assert.deepEqual(
      found.map((a) => a.first_name),
      ["Marie-Claire", "Xana"]
    );
  });

  it("extracts the first non-heading, non-quote paragraph as the description", () => {
    const xana = discoverAssistants(DIR).find((a) => a.first_name === "Xana");
    assert.equal(
      xana.description,
      "Elle oriente les demandes vers la bonne assistante et ne produit rien elle-meme."
    );
  });

  it("lists markdown sub-agents only, and detects the distilled runtime", () => {
    const xana = discoverAssistants(DIR).find((a) => a.first_name === "Xana");
    assert.deepEqual(xana.sub_agents, ["routingGuardDesk"]);
    assert.equal(xana.has_runtime, true);
    assert.match(xana.distilled_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("degrades gracefully for an assistant with no README, runtime or sub-agents", () => {
    const marie = discoverAssistants(DIR).find((a) => a.first_name === "Marie-Claire");
    assert.equal(marie.description, null);
    assert.deepEqual(marie.sub_agents, []);
    assert.equal(marie.has_runtime, false);
    assert.equal(marie.distilled_at, null);
  });

  it("returns an empty list for a missing or null directory", () => {
    assert.deepEqual(discoverAssistants(path.join(TMP, "gone")), []);
    assert.deepEqual(discoverAssistants(null), []);
  });
});
