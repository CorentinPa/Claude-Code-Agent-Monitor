/**
 * @file Carefully mutates the small, text-only Codex configuration surface:
 * config.toml, hooks.json, user rules, user skills, and instruction files.
 * Every overwrite is size-bounded, path-whitelisted, backed up, and atomic.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const fs = require("node:fs");
const path = require("node:path");
const { getCodexHome } = require("./codex-home");
const { MAX_FILE_BYTES, editablePath } = require("./codex-config-discovery");

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function timestamp() {
  return new Date().toISOString().replace(/[:]/g, "-");
}

function backupPathFor(file) {
  const home = getCodexHome();
  const root = path.join(home, "codex-config-backups");
  const relative = path.relative(home, file);
  const segment =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative)
      ? relative.replace(/[\\/]/g, "__")
      : `project__${path.basename(file)}`;
  return path.join(root, `${segment}.${timestamp()}.bak`);
}

function atomicWrite(file, content) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`
  );
  let fd = null;
  try {
    fd = fs.openSync(temporary, "wx");
    fs.writeSync(fd, content);
    try {
      fs.fsyncSync(fd);
    } catch {
      // fsync is best effort on local/temporary filesystems.
    }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      if (fd !== null) fs.closeSync(fd);
    } catch {
      // Preserve the original write error.
    }
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      // A failed cleanup must not mask the original write error.
    }
    throw error;
  }
}

// An allowlisted lexical path can still be a symlink into an unrelated
// location. Codex's own managed configuration should be plain local files, so
// reject symlinks rather than following them while reading or overwriting.
function rejectSymlink(file) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) {
      throw makeError("ESYMLINK", "Configuration target must not be a symbolic link");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function readEditableFile(file) {
  const target = editablePath(file);
  if (!target) throw makeError("EEDITDENIED", "This Codex file is not editable from the dashboard");
  rejectSymlink(target);
  let stat = null;
  try {
    stat = fs.statSync(target);
  } catch {
    // config.toml and hooks.json can be created by the first edit.
  }
  if (stat && !stat.isFile()) throw makeError("ENOTFILE", "Configuration target is not a file");
  if (stat && stat.size > MAX_FILE_BYTES) {
    throw makeError("ETOOLARGE", `file exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return {
    path: target,
    text: stat ? fs.readFileSync(target, "utf8") : "",
    size: stat?.size || 0,
    mtime: stat?.mtimeMs || null,
    truncated: false,
    exists: Boolean(stat),
  };
}

function writeEditableFile({ file, content }) {
  const target = editablePath(file);
  if (!target) throw makeError("EEDITDENIED", "This Codex file is not editable from the dashboard");
  rejectSymlink(target);
  if (typeof content !== "string") throw makeError("EBADCONTENT", "content must be a string");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw makeError("ETOOLARGE", `content exceeds ${MAX_FILE_BYTES} bytes`);
  }
  let existing = null;
  try {
    existing = fs.statSync(target);
  } catch {
    // First-time file creation is supported for known config surfaces.
  }
  if (existing && !existing.isFile())
    throw makeError("ENOTFILE", "Configuration target is not a file");
  let backupPath = null;
  if (existing) {
    backupPath = backupPathFor(target);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(target, backupPath);
  }
  atomicWrite(target, content);
  return { ok: true, file: target, backupPath, created: !existing };
}

module.exports = { readEditableFile, writeEditableFile };
