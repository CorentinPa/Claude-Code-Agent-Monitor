# Codex Agent Setup

This directory contains all project-scoped Codex extensions:

- instruction baseline via root [`AGENTS.md`](../AGENTS.md)
- execution policy rules in [`rules/default.rules`](./rules/default.rules)
- custom subagent definitions in [`agents/`](./agents)
- reusable skills in [`skills/`](./skills)
- runtime configuration in [`config.toml`](./config.toml)
- a repository plugin marketplace in [`.agents/plugins/marketplace.json`](../.agents/plugins/marketplace.json)
- 13 shared plugins under [`plugins/`](../plugins), each with `.codex-plugin/plugin.json`

## What Codex reads

- `AGENTS.md` from repository root
- `.codex/config.toml` for runtime settings
- `.codex/agents/*.toml` for custom agents
- `.codex/skills/*/SKILL.md` for project skills
- `.codex/rules/*.rules` for execution policy
- `.agents/plugins/marketplace.json` for repository plugin discovery
- `plugins/*/.codex-plugin/plugin.json` for installable plugin metadata
- `plugins/*/skills/*/SKILL.md` and `agents/openai.yaml` for packaged skills

## Included custom agents

- `reviewer`: read-only, high-rigor review agent
- `implementer`: workspace-write implementation agent
- `release_auditor`: read-only release readiness checker

## Included skills

- `repo-onboarding` — architecture discovery and verification selection
- `mcp-maintainer` — MCP server operations and troubleshooting
- `release-guard` — release readiness checks

## Plugin marketplace

```bash
codex plugin marketplace add hoangsonww/Claude-Code-Agent-Monitor
codex plugin list --marketplace claude-code-agent-monitor-plugins --available --json
codex plugin add ccam-platform@claude-code-agent-monitor-plugins
```

The marketplace contains 13 plugins and 62 bundled skills. The same plugin
directories also carry Claude Code manifests, so product metadata stays
separate while skill instructions remain shared.

## skills.sh-compatible installation

```bash
npx skills add hoangsonww/Claude-Code-Agent-Monitor --list
npx skills add hoangsonww/Claude-Code-Agent-Monitor \
  --skill mcp-server --agent codex
```

The skills CLI discovers 70 repository skills. Run `npm run extensions:sync`
after changing a plugin skill or Claude manifest, then
`npm run extensions:validate`.
