/**
 * @file manual.js
 * @description Read-only access to the repository's Markdown manual (`docs/*.md`)
 * so the dashboard can render it in-app on the Documentation page, instead of
 * sending the user out to a separate static site. `GET /api/manual` lists the
 * available documents; `GET /api/manual/:slug` returns one document's raw
 * Markdown.
 *
 * The documents stay owned by the repository: nothing is copied, rewritten, or
 * cached, so a new file under `docs/` shows up in the UI on the next request and
 * an upstream edit is reflected immediately. Slugs are matched against the
 * directory listing rather than joined onto a path, so no request can escape
 * `docs/`. Mounted under `/api`, the route inherits the Host-header and optional
 * `DASHBOARD_TOKEN` guards like every other endpoint.
 *
 * Packaged desktop builds ship `docs/` as an extraResource; when the directory
 * is missing anyway, the list is empty and the UI renders its empty state rather
 * than failing.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const fs = require("fs");
const path = require("path");

const router = Router();

const DOCS_DIR = path.join(__dirname, "..", "..", "docs");

/** A slug is the file name without its extension, lowercased. */
function slugOf(fileName) {
  return path.basename(fileName, ".md").toLowerCase();
}

/**
 * The document's display title: its first Markdown H1, falling back to the file
 * name when a document has none. Backticks are stripped because several titles
 * are written as code spans (e.g. "# `ccam` CLI Reference").
 */
function titleOf(markdown, fileName) {
  for (const line of markdown.split("\n", 40)) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1].replace(/`/g, "");
  }
  return path.basename(fileName, ".md");
}

/**
 * Lists the top-level Markdown files in `docs/`. Subdirectories (screenshots,
 * plan archives) are ignored: the manual is the flat set of documents.
 * @returns {string[]} File names, alphabetically, or `[]` when `docs/` is absent.
 */
function listFiles() {
  try {
    return fs
      .readdirSync(DOCS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

router.get("/", (_req, res) => {
  const documents = listFiles().map((fileName) => {
    let markdown = "";
    try {
      markdown = fs.readFileSync(path.join(DOCS_DIR, fileName), "utf8");
    } catch {
      // A file that disappeared between listing and reading still gets an entry,
      // titled by its name; fetching it will return the 404 below.
    }
    return {
      slug: slugOf(fileName),
      title: titleOf(markdown, fileName),
      bytes: Buffer.byteLength(markdown, "utf8"),
    };
  });
  res.json({ documents });
});

router.get("/:slug", (req, res) => {
  // Resolve the slug against the actual listing rather than joining it onto
  // DOCS_DIR: an unmatched slug can never reach the filesystem, so traversal
  // attempts ("../../server/db") simply fall through to the 404 below.
  const fileName = listFiles().find(
    (name) => slugOf(name) === String(req.params.slug).toLowerCase()
  );
  if (!fileName) {
    return res.status(404).json({
      error: { code: "ENOTFOUND", message: `Unknown manual document: ${req.params.slug}` },
    });
  }
  try {
    const markdown = fs.readFileSync(path.join(DOCS_DIR, fileName), "utf8");
    res.json({ slug: slugOf(fileName), title: titleOf(markdown, fileName), markdown });
  } catch {
    res.status(404).json({
      error: { code: "ENOTFOUND", message: `Unreadable manual document: ${req.params.slug}` },
    });
  }
});

module.exports = router;
