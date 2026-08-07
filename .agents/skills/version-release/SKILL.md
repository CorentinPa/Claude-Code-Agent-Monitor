---
name: version-release
description: Choose and apply the correct semantic version bump for this repository. Use for every user-visible release, before merge when a change set should ship as patch, minor, or major, and whenever package/plugin/desktop version metadata must stay synchronized.
---

# Version Release Skill

Apply Semantic Versioning across CCAM:

- **Patch** (`X.Y.Z+1`): backward-compatible fixes, docs-only work, dependency/security maintenance, refactors, or small improvements without a substantial new capability.
- **Minor** (`X.Y+1.0`): backward-compatible features or meaningfully larger capabilities such as new workflows, pages, integrations, API fields/routes, or major UX surfaces.
- **Major** (`X+1.0.0`): breaking public behavior, removed or renamed contracts, required migrations, or fundamental product/architecture changes.

Choose the highest applicable category. If the boundary is ambiguous, prefer the higher bump or ask before release. Do not classify from diff size or commit count alone.

## Workflow

- Explain the chosen bump from the current root version.
- Update root and desktop package/lockfile versions.
- Update the OpenAPI version example and regenerate `openapi.yaml`.
- Update version-sensitive UI snapshots.
- Run `npm run extensions:sync` to regenerate Claude/Codex plugin manifests and both marketplaces.
- Keep independently shipped client/MCP/monitoring/VS Code package versions unchanged unless explicitly included.
- Run `npm run extensions:validate`, relevant tests/builds, and the CLI version check.
- Never create or move a release tag without explicit user approval.

## References

- `references/version-checklist.md`
