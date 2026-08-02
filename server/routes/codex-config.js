/**
 * @file HTTP surface for Codex configuration discovery, redacted inspection,
 * and tightly scoped text-file editing with timestamped backups. Only the
 * configuration files that Codex users commonly maintain are writable.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const codex = require("../lib/codex-config-discovery");
const mutate = require("../lib/codex-config-mutate");
const { broadcast } = require("../websocket");

const router = Router();

function emitChanged(payload) {
  try {
    broadcast("codex_config_changed", { source: "dashboard", ...payload });
  } catch {
    // The websocket service is optional for isolated route tests.
  }
}

function mutationError(res, error) {
  const status = error.code === "ETOOLARGE" ? 413 : error.code === "ENOTFILE" ? 409 : 400;
  return res.status(status).json({
    error: { code: error.code || "EINTERNAL", message: error.message || "Unable to update file" },
  });
}

router.get("/overview", (_req, res) => {
  res.json(codex.readOverview());
});

router.get("/file", (req, res) => {
  const result = codex.readFileSafe(req.query.path);
  if (result.error) {
    return res.status(400).json({ error: { code: "READ_DENIED", message: result.error } });
  }
  return res.json(result);
});

// This endpoint deliberately returns unredacted text only for the small
// editable allowlist. A redacted preview cannot safely be saved back because
// it would overwrite a user's real secret values with "[redacted]".
router.get("/edit-file", (req, res) => {
  try {
    return res.json(mutate.readEditableFile(req.query.path));
  } catch (error) {
    return mutationError(res, error);
  }
});

router.put("/file", (req, res) => {
  try {
    const result = mutate.writeEditableFile({ file: req.body?.path, content: req.body?.content });
    emitChanged({ action: "write", path: result.file });
    return res.json(result);
  } catch (error) {
    return mutationError(res, error);
  }
});

module.exports = router;
