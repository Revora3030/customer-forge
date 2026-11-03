# Claude Code setup for this repo

Project config committed so every Claude Code session (local, web, GitHub Action) uses fewer tokens and catches errors earlier. Nothing here is app code or shipped to users.

| Path | What |
|---|---|
| `/CLAUDE.md`, `src/lib/builder/CLAUDE.md`, `supabase/CLAUDE.md` | Short working notes: architecture, commands, CI, files never to read |
| `.claude/settings.json` | Permission allowlist for safe checks, deny rules for secrets/generated/huge files, one Bash guard hook |
| `.claude/hooks/guard-bash.mjs` | Blocks reading `.env*`, whole-file dumps of lockfiles/generated files/`node_modules`/build output, and force pushes. Only ever blocks; allows on any parse error |
| `.claude/agents/` | `explorer`, `test-runner` (Haiku), `reviewer` (Sonnet) |
| `.claude/skills/` | Vendored + repo skills (below) |
| `.claude/references/` | Checklists the vendored addyosmani skills link to |
| `/.mcp.json` | MCP servers, all free, no API key, pinned |
| `/.serena/project.yml` | Serena project config (TypeScript language server, huge files ignored); `.serena/memories/` is shared project memory |

## Vendored skills (unmodified; each folder has `LICENSE` + `ATTRIBUTION.md`)

| Skill | Source | License |
|---|---|---|
| systematic-debugging, test-driven-development, requesting-code-review, receiving-code-review, verification-before-completion | https://github.com/obra/superpowers (commit `2ce8aa15d05b`) | MIT |
| frontend-design, webapp-testing | https://github.com/anthropics/skills (commit `ca45fc496a34`) | Apache-2.0 |
| security-and-hardening (OWASP), frontend-ui-engineering (accessibility), performance-optimization, code-simplification, deprecation-and-migration, ci-cd-and-automation; plus `references/*-checklist.md` | https://github.com/addyosmani/agent-skills (commit `301b02b12bff`) | MIT |
| supabase (RLS, auth, security), supabase-postgres-best-practices (schema, indexes, migrations) | https://github.com/supabase/agent-skills (commit `c9be0e931b79`) | MIT |

Not vendored: trailofbits/skills (CC-BY-SA-4.0, not an OSI license) and the anthropics document skills (docx/pdf/pptx/xlsx, source-available, not open source).

## Repo skills (written for this repo)

`run-ci-locally`, `triage-ci-failure`, `add-supabase-migration`, `builder-pipeline-map`, `fix-snapshot-tests`, `verify-customer-site-visuals`, `typescript-refactoring`, `revora-security-review`. No OSI-licensed TypeScript-refactoring skill existed upstream, so that one is repo-written; `revora-security-review` adds the Supabase RLS / secrets / Revora-boundary checklist on top of the vendored OWASP skill.

## MCP servers (`.mcp.json`)

| Server | Pinned | Source | License |
|---|---|---|---|
| serena | `v2.1.0` via `uvx` (needs `uv`), `--agent-interface tools` | https://github.com/oraios/serena | GPL-3.0 app / MIT SolidLSP (run as a tool, not vendored) |
| context7 | `@upstash/context7-mcp@4.4.4` | https://github.com/upstash/context7 | MIT (works without a key, rate-limited) |
| playwright | `@playwright/mcp@0.0.83`, `--headless --isolated` | https://github.com/microsoft/playwright-mcp | Apache-2.0 |
| sequential-thinking | `@modelcontextprotocol/server-sequential-thinking@2.0.0` | https://github.com/modelcontextprotocol/servers | MIT / Apache-2.0 |
| revora-jarvis-readonly | repo script | `scripts/jarvis-mcp-server.mjs` | repo |

Each version was at least two weeks old when pinned (2026-11-03). Serena runs with the discrete `tools` interface, not its default Python REPL tool, so every call stays visible to Claude Code's permission checks.

## Persistent memory

- **Used: Serena memories** (`.serena/memories/*.md`), free, no account, committed with the repo so every machine and cloud session shares them; plus Claude Code's built-in `/memory` and `/compact`.
- **Not installed: claude-mem** (https://github.com/thedotmack/claude-mem, Apache-2.0, v15.9.0). It needs a per-machine installer and background worker (`npx claude-mem install`), its default path signs you up for a hosted trial, and its observer summarises sessions with extra model calls, which adds usage instead of cutting it. Its memory lives in the user's home folder, so it can't be shared as project config and is lost when a cloud container is reclaimed. Install it per machine only if you want it: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`.

## Updating

Re-copy a vendored skill folder from a newer upstream commit and update its `ATTRIBUTION.md`. Bump an MCP pin only to a release that is at least two weeks old.
