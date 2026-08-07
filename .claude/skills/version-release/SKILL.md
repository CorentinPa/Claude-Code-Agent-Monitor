---
name: version-release
description: Choose and apply the correct semantic version bump for this repository. Use for every user-visible release, before merge when a change set should ship as patch, minor, or major, and whenever package/plugin/desktop version metadata must stay synchronized.
---

# Version Release

Use Semantic Versioning as the repository-wide release rule:

- **Patch** (`X.Y.Z+1`) for backward-compatible bug fixes, documentation-only changes, dependency/security maintenance, internal refactors, and small user-visible improvements that do not create a substantial new capability.
- **Minor** (`X.Y+1.0`) for backward-compatible feature additions or meaningfully larger product capabilities, including new workflows, pages, integrations, API fields/routes, or major UX surfaces.
- **Major** (`X+1.0.0`) for backward-incompatible behavior, removed/renamed public contracts, required migrations, or fundamental product/architecture changes.

When a change fits more than one category, use the highest applicable bump. When uncertain between adjacent categories, prefer the higher bump or ask the user before releasing. Never infer the bump from commit count, diff size, or elapsed time alone.

## CCAM release workflow

1. Read the current root `package.json` version and summarize why the change is patch, minor, or major.
2. Update the root `package.json` and root lockfile.
3. Mirror the shipping version in `desktop/package.json` and `desktop/package-lock.json`.
4. Update the OpenAPI version example in `server/openapi.js`, then run `npm run openapi:yaml`.
5. Update version-sensitive UI snapshots when the rendered release string changes.
6. Run `npm run extensions:sync` so every Claude/Codex plugin manifest and marketplace stays on the root release.
7. Update release/version documentation only where the concrete version is intentionally shown.
8. Run `npm run extensions:validate`, relevant tests/builds, and `ccam version` or `node bin/ccam.js version`.
9. Confirm only independently shipped packages remain on their own versions; do not bump `client`, `mcp`, `monitoring`, or VS Code extension packages unless those products are also being released.

## Release guardrails

- Do not hand-edit generated Codex metadata or marketplace files after `extensions:sync`.
- Do not create or move a Git tag unless the user explicitly requested a release/tag operation.
- Do not call a breaking change “minor” merely because compatibility can be restored later.
- Do not leave root, desktop, OpenAPI, snapshots, or generated plugin versions out of sync.

## References

- Repository release checklist: `references/version-checklist.md`
