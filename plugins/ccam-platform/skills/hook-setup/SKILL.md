---
name: hook-setup
description: >
  Inspect and install CCAM monitoring hooks for Claude Code and Codex. Use when
  onboarding a provider, repairing missing hooks, checking which provider is
  active, or validating that installation preserved unrelated user hooks.
---

# Hook Setup

1. Inspect current state: `ccam hooks status`.
2. Show which provider hooks are missing or will be replaced.
3. Install only after confirmation:

```bash
ccam hooks install claude codex --yes
```

4. Read back `ccam hooks status`.
5. Start a real provider session and verify a new session/event reaches CCAM.

Installers replace only CCAM-owned entries and preserve unrelated hooks.
Hook execution must remain fail-safe and non-blocking.
