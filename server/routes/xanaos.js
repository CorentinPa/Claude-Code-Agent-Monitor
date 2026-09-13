/**
 * @file Express router for the XanaOS assistants view. Composes, on every
 * request, a directory listing of the assistants discovered under the
 * resolved assistants directory. Nothing is cached and nothing is written, so
 * a newly distilled assistant shows up on the next refresh without an ingest
 * path of its own.
 *
 * Scope note: this route reports discovery only (identity, description,
 * sub-agents, distilled-runtime marker). Live process state, sessions, and
 * transcripts are out of scope for now — see
 * docs/superpowers/specs/2026-09-07-cockpit-assistants-design.md §4-§6 for
 * that larger, not-yet-built surface.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const { resolveAssistantsDir } = require("../lib/xanaos-home");
const { discoverAssistants } = require("../lib/xanaos-assistants");

const router = Router();

// GET /api/xanaos/assistants — the assistants directory and one card per
// discovered assistant.
router.get("/assistants", (_req, res) => {
  const { dir, source, exists } = resolveAssistantsDir();
  const assistants = exists ? discoverAssistants(dir) : [];

  res.json({
    assistants_dir: dir,
    assistants_dir_source: source,
    assistants_dir_exists: exists,
    totals: { discovered: assistants.length },
    assistants,
  });
});

module.exports = router;
