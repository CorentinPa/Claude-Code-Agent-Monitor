/**
 * @file Resolves a session's transcript from the absolute path its own
 * runtime reported at SessionStart, rather than by re-deriving it from
 * CLAUDE_HOME. `server/lib/claude-home.js` only looks under a single home, so
 * a session living under a non-default config dir — a XanaOS assistant, a
 * second profile — never resolves through it even though the row exists in
 * this dashboard's own database (hooks from every local config dir report to
 * the same instance). This module cannot live in claude-home.js, which
 * server/db.js requires: doing so would create a require cycle, since this
 * module itself needs db.js.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("fs");
const { db } = require("../db");

/**
 * The absolute transcript path recorded by the most recent SessionStart event
 * for this session, if that file still exists. Null when the session has no
 * such event, its data carries no path, or the file is gone.
 */
function getRecordedTranscriptPath(sessionId) {
  const row = db
    .prepare(
      `SELECT data FROM events
       WHERE session_id = ? AND event_type = 'SessionStart' AND data IS NOT NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .get(sessionId);
  if (!row) return null;
  let data;
  try {
    data = JSON.parse(row.data);
  } catch {
    return null;
  }
  const transcriptPath = data?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath === "") return null;
  return fs.existsSync(transcriptPath) ? transcriptPath : null;
}

module.exports = { getRecordedTranscriptPath };
