/**
 * @file Read-only HTTP surface for the Codex configuration explorer. Codex
 * owns these files and can change them while running, so this route exposes
 * safe discovery plus redacted file inspection rather than unsafe editing.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const codex = require("../lib/codex-config-discovery");

const router = Router();

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

module.exports = router;
