/**
 * @file Express router for the XanaOS assistants view. Composes, on every
 * request, a directory listing of the assistants discovered under the
 * resolved assistants directory, decorated with each assistant's verified
 * live state (up/busy, Remote Control availability) read from its own Claude
 * config dir. Nothing is cached and nothing is written, so a newly distilled
 * assistant, or one that just started a session, shows up on the next
 * refresh without an ingest path of its own.
 *
 * Scope note: sessions and transcripts stay out of this route — see
 * docs/superpowers/specs/2026-09-07-cockpit-assistants-design.md §5-§6 for
 * that larger, not-yet-built surface.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const path = require("path");
const { Router } = require("express");
const { resolveAssistantsDir, getConfigRoot, isDirectory } = require("../lib/xanaos-home");
const { discoverAssistants, readLiveSessions } = require("../lib/xanaos-assistants");

const router = Router();

// GET /api/xanaos/assistants — the assistants directory, one card per
// discovered assistant, and each assistant's verified live state.
router.get("/assistants", (_req, res) => {
  const { dir, source, exists } = resolveAssistantsDir();
  const configRoot = getConfigRoot();
  const cards = exists ? discoverAssistants(dir) : [];

  const assistants = cards.map((card) => {
    const configDir = path.join(configRoot, card.first_name);
    const deployed = isDirectory(configDir);
    const liveSessions = deployed ? readLiveSessions(configDir) : [];
    return {
      ...card,
      config_dir: deployed ? configDir : null,
      deployed,
      up: liveSessions.length > 0,
      busy: liveSessions.some((session) => session.busy),
      remote_control: liveSessions.some((session) => session.remote_control),
    };
  });

  res.json({
    assistants_dir: dir,
    assistants_dir_source: source,
    assistants_dir_exists: exists,
    config_root: configRoot,
    totals: {
      discovered: assistants.length,
      up: assistants.filter((a) => a.up).length,
      remote_control: assistants.filter((a) => a.remote_control).length,
    },
    assistants,
  });
});

module.exports = router;
