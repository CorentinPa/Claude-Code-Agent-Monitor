/**
 * @file Express router for the XanaOS assistants view. `GET /assistants`
 * composes, on every request, a directory listing of the assistants
 * discovered under the resolved assistants directory, decorated with each
 * assistant's verified live state (up/busy, Remote Control availability)
 * read from its own Claude config dir. `GET /assistants/:firstName` adds the
 * detail a "see more" view needs to actually pilot and analyze one assistant:
 * its recent sessions (read from its transcript tree, so history predating
 * the cockpit's hooks still shows) decorated with what this dashboard's own
 * database knows about them, and their most recent recorded events. Nothing
 * is cached and nothing is written, so a newly distilled assistant, or one
 * that just started a session, shows up on the next request without an
 * ingest path of its own.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const path = require("path");
const { Router } = require("express");
const { db } = require("../db");
const { resolveAssistantsDir, getConfigRoot, isDirectory } = require("../lib/xanaos-home");
const {
  discoverAssistants,
  readLiveSessions,
  listRecentSessions,
} = require("../lib/xanaos-assistants");

const router = Router();

/** Sessions scanned per assistant on the detail view. */
const SESSION_SCAN_LIMIT = 50;
/** Sessions listed back to the client on the detail view. */
const SESSION_LIST_LIMIT = 10;
/** Events shown per assistant on the detail view. */
const EVENT_LIMIT = 8;

function placeholders(count) {
  return new Array(count).fill("?").join(",");
}

/** What this dashboard's database knows about a set of session ids, keyed by id. */
function sessionRows(ids) {
  if (ids.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT id, name, status, started_at, ended_at
       FROM sessions WHERE id IN (${placeholders(ids.length)})`
    )
    .all(...ids);
  return new Map(rows.map((row) => [row.id, row]));
}

/** The most recent recorded events across a set of sessions, newest first. */
function recentEvents(ids) {
  if (ids.length === 0) return [];
  return db
    .prepare(
      `SELECT session_id, event_type, tool_name, summary, created_at
       FROM events WHERE session_id IN (${placeholders(ids.length)})
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(...ids, EVENT_LIMIT);
}

/** One assistant card, decorated with its config dir and verified live state. */
function buildCard(discoveryCard, configRoot) {
  const configDir = path.join(configRoot, discoveryCard.first_name);
  const deployed = isDirectory(configDir);
  const liveSessions = deployed ? readLiveSessions(configDir) : [];
  return {
    ...discoveryCard,
    config_dir: deployed ? configDir : null,
    deployed,
    up: liveSessions.length > 0,
    busy: liveSessions.some((session) => session.busy),
    remote_control: liveSessions.some((session) => session.remote_control),
  };
}

// GET /api/xanaos/assistants — the assistants directory, one card per
// discovered assistant, and each assistant's verified live state.
router.get("/assistants", (_req, res) => {
  const { dir, source, exists } = resolveAssistantsDir();
  const configRoot = getConfigRoot();
  const cards = exists ? discoverAssistants(dir) : [];
  const assistants = cards.map((card) => buildCard(card, configRoot));

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

// GET /api/xanaos/assistants/:firstName — one assistant's card plus what a
// "see more" detail view needs to pilot and analyze it: recent sessions
// (from disk, so pre-hooks history still shows) decorated with the database's
// own record of them, and the most recent events across those sessions.
router.get("/assistants/:firstName", (req, res) => {
  const { dir, exists } = resolveAssistantsDir();
  const configRoot = getConfigRoot();
  const cards = exists ? discoverAssistants(dir) : [];
  const discoveryCard = cards.find((card) => card.first_name === req.params.firstName);
  if (!discoveryCard) {
    return res.status(404).json({
      error: { code: "ENOTFOUND", message: `Unknown assistant: ${req.params.firstName}` },
    });
  }

  const card = buildCard(discoveryCard, configRoot);
  const scanned = card.deployed ? listRecentSessions(card.config_dir, SESSION_SCAN_LIMIT) : [];
  const listed = scanned.slice(0, SESSION_LIST_LIMIT);
  const ids = listed.map((session) => session.session_id);
  const known = sessionRows(ids);

  res.json({
    ...card,
    recent_sessions: listed.map((session) => {
      const row = known.get(session.session_id);
      return {
        session_id: session.session_id,
        modified_at: session.modified_at,
        name: row?.name ?? null,
        status: row?.status ?? null,
        started_at: row?.started_at ?? null,
        ended_at: row?.ended_at ?? null,
        known: Boolean(row),
      };
    }),
    recent_events: recentEvents(ids),
  });
});

module.exports = router;
