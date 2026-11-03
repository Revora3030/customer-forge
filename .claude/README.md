# Claude Code setup for this repo

Project config committed so every Claude Code session (local, web, GitHub Action) uses fewer tokens and catches errors earlier. Nothing here is app code or shipped to users. Everything is free and needs no API key or secret.

| Path | What |
|---|---|
| `/CLAUDE.md`, `src/lib/builder/CLAUDE.md`, `supabase/CLAUDE.md` | Short working notes: architecture, commands, CI, files never to read |
| `.claude/settings.json` | Permission allowlist for safe checks, deny rules for secrets/generated/huge files, one Bash guard hook, pre-approved project MCP servers |
| `.claude/hooks/guard-bash.mjs` | Blocks reading `.env*`, whole-file dumps of lockfiles/generated files/`node_modules`/build output, and force pushes. Only ever blocks; allows on any parse error |
| `.claude/agents/` | `explorer`, `test-runner` (Haiku), `reviewer` (Sonnet) |
| `.claude/skills/` | Vendored + repo skills (below) |
| `.claude/references/` | Checklists the vendored addyosmani/agent-skills skills link to |
| `/.mcp.json` | MCP servers, all free, no API key, pinned |
| `/.serena/project.yml` | Serena project config (TypeScript language server, huge files ignored); `.serena/memories/` is the shared project memory |

## Vendored skills (unmodified; each folder has `LICENSE` + `ATTRIBUTION.md` with source URL and commit)

| Skill | Source | License |
|---|---|---|
| systematic-debugging, test-driven-development, requesting-code-review, receiving-code-review, verification-before-completion | https://github.com/obra/superpowers (commit `2ce8aa15d05b`) | MIT |
| frontend-design | https://github.com/anthropics/skills (commit `ca45fc496a34`) | Apache-2.0 |
| security-and-hardening (OWASP), frontend-ui-engineering, code-simplification, deprecation-and-migration, ci-cd-and-automation; plus `references/security-checklist.md`, `references/accessibility-checklist.md` | https://github.com/addyosmani/agent-skills (commit `301b02b12bff`) | MIT |
| supabase (RLS, auth, security), supabase-postgres-best-practices (schema, indexes, migrations) | https://github.com/supabase/agent-skills (commit `c9be0e931b79`) | MIT |
| a11y-debugging, chrome-devtools, debug-optimize-lcp, troubleshooting (Google's Chrome DevTools team; use the `chrome-devtools` MCP server) | https://github.com/ChromeDevTools/chrome-devtools-mcp (tag `chrome-devtools-mcp-v1.11.0`, commit `a878bcad3958`, matches the pinned server) | Apache-2.0 |
| core-web-vitals, performance, accessibility (WCAG 2.2), seo, best-practices, web-quality-audit (web.dev / Lighthouse guidance) | https://github.com/addyosmani/web-quality-skills (commit `afa8da942115`) | MIT |

Not vendored, and why:
- anthropics `webapp-testing`: its example scripts trip DevSkim. Browser checks are covered by the Playwright and Chrome DevTools MCP servers plus `verify-customer-site-visuals`.
- addyosmani/agent-skills `performance-optimization`: replaced by web-quality-skills `performance` + `core-web-vitals` (no duplicates).
- chrome-devtools-mcp `cookie-debugging`, `memory-leak-debugging`, `chrome-devtools-cli`: niche for this repo.
- trailofbits/skills: CC-BY-SA-4.0, not an OSI license. Anthropic's docx/pdf/pptx/xlsx skills: source-available, not open source.

## Repo skills (written for this repo)

`run-ci-locally`, `triage-ci-failure`, `add-supabase-migration`, `builder-pipeline-map`, `fix-snapshot-tests`, `verify-customer-site-visuals`, `typescript-refactoring`, `revora-security-review`. No OSI-licensed TypeScript-refactoring skill existed upstream, so that one is repo-written; `revora-security-review` adds the Supabase RLS / secrets / Revora-boundary checklist on top of the vendored OWASP skill.

## MCP servers (`.mcp.json`)

| Server | Pinned | Source | License | Notes |
|---|---|---|---|---|
| serena | `v2.1.0` via `uvx` | https://github.com/oraios/serena | GPL-3.0 app / MIT SolidLSP (run as a tool, not vendored) | `--agent-interface tools` (discrete tools, not its Python REPL tool, so every call goes through permission checks); also the project memory |
| context7 | `@upstash/context7-mcp@4.4.4` | https://github.com/upstash/context7 | MIT | Library docs; works without a key (rate-limited) |
| playwright | `@playwright/mcp@0.0.83` | https://github.com/microsoft/playwright-mcp | Apache-2.0 | `--headless --isolated` |
| chrome-devtools | `chrome-devtools-mcp@1.11.0` | https://github.com/ChromeDevTools/chrome-devtools-mcp | Apache-2.0 | Google's official server: Lighthouse audit, performance traces/insights, network, console, a11y snapshots. `--headless --isolated --no-usage-statistics`, update checks off. Its performance tools may query Google's public CrUX API for the page URL; add `--no-performance-crux` if that is unwanted |
| sequential-thinking | `@modelcontextprotocol/server-sequential-thinking@2.0.0` | https://github.com/modelcontextprotocol/servers | MIT / Apache-2.0 | |
| revora-jarvis-readonly | repo script | `scripts/jarvis-mcp-server.mjs` | repo | |

Each version was at least two weeks old when pinned (2026-11-03). Every server was started in a cloud session and answered `initialize` + `tools/list`; Serena resolved a real TypeScript symbol and Chrome DevTools opened a page headless.

Considered and not added: Google Developer Knowledge MCP (needs a Google Cloud API key), GitHub MCP (needs a token), any server needing an account or paid key.

## Persistent memory

- **Used: Serena memories** (`.serena/memories/*.md`, written with Serena's `write_memory` tool). Free, no account, plain Markdown committed with the repo, so every machine and every cloud session (whose container is discarded) shares them through git. Pinned with Serena `v2.1.0`. Plus Claude Code's built-in `/memory`, `/compact` and CLAUDE.md files.
- **Not installed: claude-mem** (https://github.com/thedotmack/claude-mem, Apache-2.0, latest 15.9.0) because it does not work as committed project config in cloud sessions: it needs a per-machine installer (`npx claude-mem install`) plus a Bun-managed background worker service, keeps its SQLite/Chroma data in the user's home (`~/.claude-mem`), which is lost when a cloud container is reclaimed, defaults to signing you up for a hosted service (CMEM Pro, falling back to your Anthropic plan), and its observer summarises sessions with extra model calls, which adds usage instead of cutting it. Every recent release is also under two weeks old (four releases on 2026-11-01..02), so none meets the pinning rule. Install it per machine only if you want it: `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem`.
- **Not added: `@modelcontextprotocol/server-memory`**: works without a key, but a second memory store would duplicate Serena's, and its JSONL graph merges poorly in git.

## Manual settings for the owner

1. Install `uv` on each machine that should run Serena (https://docs.astral.sh/uv/), or add `curl -LsSf https://astral.sh/uv/install.sh | sh` to the cloud environment's setup script. Cloud sessions here already have it.
2. Chrome DevTools MCP needs Chrome or Chromium on the machine; cloud sessions here already have Chromium.
3. Project MCP servers are pre-approved in `enabledMcpjsonServers`. To approve each one on first use instead, delete that list.
4. Plugins: `agent-skills@addy-agent-skills` and `chrome-devtools-mcp@chrome-devtools-plugins` are set to `false` because their vendored/pinned copies are here; set them back to `true` in `.claude/settings.json` (or `/plugin` in Claude Code) to use the full unpinned sets. `ponytail@ponytail` is unchanged.
5. Optional: a free Context7 key raises its rate limit; not required.
6. `Read` of `.env*` is denied, which also covers `.env.example`; `cp .env.example .env` still works.

## Updating

Re-copy a vendored skill folder from a newer upstream commit and update its `ATTRIBUTION.md`. Bump an MCP pin only to a release that is at least two weeks old, and bump the chrome-devtools skills to the tag of the same server version.
