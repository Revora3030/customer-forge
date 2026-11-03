# Revora Growth Systems — working notes for Claude Code

`AGENTS.md` holds the project invariants (Lovable sync, AI provider, publishing, tenant and billing boundaries). Read it first; this file only covers how to work here cheaply.

## Stack
TanStack Start (React 19) + Tailwind v4 + Vite on Cloudflare Workers; Supabase with row level security per workspace. Route files live in `src/routes/` and set metadata with `head()`. Never hand-edit `src/routeTree.gen.ts` or `src/integrations/supabase/types.ts` (generated).

## Fixed facts
- Offer: $350 setup, first month free, then $100/month, 3-day full access. Never reintroduce the old $750 price.
- Lovable AI is the only AI provider; never add a second lane.
- No phone number on Revora public marketing pages.
- Never force-push or rewrite published history on `lovable-sync` or a pushed branch.

## Check commands (smallest first)
- One test file: `npx vitest run src/path/to/file.test.ts`
- Types: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` (the default heap runs out)
- Lint changed files: `npx eslint path/to/file.ts`
- Whole suite only before a push: `npx vitest run --exclude src/lib/flows.e2e.test.ts --exclude ".claude/**" --exclude "**/node_modules/**"`
- Ignore `.claude/worktrees/` copies; they hold stale duplicates of tests and sources.

## Keeping usage low
- Search with narrow patterns (`rg -n -m 10 pattern path/`); read file ranges, not whole files; do not dump `supabase/migrations/` (183 files).
- The `revora-jarvis-readonly` MCP server (`scripts/jarvis-mcp-server.mjs`, wired in `.mcp.json`) gives bounded repo reads and CI status.
- Give each task exact target files and the one test to run.
