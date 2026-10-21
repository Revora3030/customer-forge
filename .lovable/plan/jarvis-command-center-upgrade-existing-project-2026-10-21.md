# Jarvis Command Center upgrade (existing project)

Upgrade the existing super-admin Jarvis page into a mobile-first command center. Same route, same server path, same approval rules — no second Jarvis.

## What exists today (inspected)

- Page: `src/routes/_authenticated/admin.jarvis.tsx` (943 lines) plus `src/components/app/jarvis/*` (header, composer, message, proposal/approval cards, operations bottom sheet, free tools, autopilot, Instagram, pipeline). Floating `JarvisDock.tsx` elsewhere in admin.
- Execution: `sendJarvisMessage` / `regenerateJarvisReply` in `src/lib/jarvis.functions.ts` (super-admin guarded) → `runJarvis`: up to N rounds of model call → read-only actions (`runReadActions` in `jarvis-agent.server.ts`) → final answer. Request/response, not streamed. Proposals (PRs, demo builds, memory, routines, research) need owner Approve.
- Storage: `jarvis_messages` (one owner thread, own-row RLS, 86 rows). Tool runs and proposals are only embedded as metadata inside the assistant message text (`appendReplyMeta`) — no timestamps, inputs, outputs or per-tool status. Separate tables already exist for memories (`jarvis_memories`), routines, attachments, approval log, autopilot runs/actions.
- Observability: `ai_provider_runtime` (per-provider day usage, failures, circuit open-until, last success/failure, latency, rate-limited), `ai_team_trace` (4,605 per-call rows: provider, model, ok, latency, reason), `ai_model_registry`, `ai_usage_events`, paid budget tables, `/admin/ai` page. `ai_tool_audit` exists but has 0 rows.
- Tools: `jarvis-tool-registry.ts` (≈35 diagnostic tools with category, access, risk, requiresApproval) and readiness via `getJarvisFreeToolReadiness`.

## Gaps against your definition of done

1. No real per-tool timeline (no timestamps, inputs/outputs, durations, per-step status).
2. Replies are not streamed; there is no cancellation path.
3. One flat thread; no conversations, search or task records.
4. Model health exists in data but is not shown inside Jarvis with configured / reachable / healthy / rate-limited separated.
5. Tools screen shows readiness only; no unified category + permission + approval view.
6. Mobile shell: the operations sheet exists, but there's no drawer navigation, inspector panel or keyboard-safe composer audit.

## Phases (each is a small, testable slice)

### Phase 1 — Execution events (foundation)
- New table `jarvis_run_events` (additive migration): run id, message id, user id, step, kind (`model_call` | `tool` | `proposal` | `approval` | `error`), tool id, status (`running` | `ok` | `failed` | `rejected`), started/finished time, duration, sanitized input summary, sanitized output summary (truncated, secrets redacted), artifact link. Owner-only RLS (read own; inserts server-side only), grants, index on (user_id, created_at).
- `runJarvis` writes one event per model round, tool call and proposal; approval endpoints write approval events. Message stores the run id. Existing reply metadata is kept for older messages.
- Event writes are best-effort and never block the reply; redaction is shared and unit-tested.

### Phase 2 — Conversations, search and task history
- Additive `jarvis_conversations` table (title, archived, timestamps) and nullable `conversation_id` on `jarvis_messages`; existing 86 messages are backfilled into one "Earlier conversation". No deletes.
- Server functions: list/search conversations (title + message text, owner-scoped), create, rename, archive.
- Tasks view built from existing records: proposals and their approval outcomes, Claude Code requests, demo builds, routines, autopilot actions — read from the tables that already hold them, not copied.
- Memory stays in `jarvis_memories`, shown separately with forget controls. Nothing new is saved automatically.

### Phase 3 — Live progress (honest streaming)
- Add a signed-in streaming endpoint that runs the same `runJarvis` loop and sends the Phase 1 events as they happen, then the final answer. If the chosen provider doesn't stream text, only steps stream; the answer appears when finished (labeled, no fake typing).
- Stop button cancels the request: the loop stops before the next model/tool step and records a `cancelled` event. A call already in flight finishes server-side and is not billed twice.
- Fallback to the current request/response path if streaming fails; retry button re-sends via `regenerateJarvisReply`.

### Phase 4 — Command Center UI (mobile first)
- Shell: compact top bar; left drawer (conversations, search, new chat, Tasks, Tools, Models, Memory) — a sheet on phones, a collapsible rail on desktop.
- Main: transcript + composer. Composer pinned with `dvh` and safe-area insets so the iPhone keyboard doesn't cover it; 44px tap targets; no hover-only actions.
- Inspector: tapping a reply's "N steps" opens the timeline (tool name, status, times, input/output summaries, approvals, errors, artifact links). Bottom sheet on phones, side panel on wide screens.
- Styling: existing Revora graphite + restrained gold tokens in `src/styles.css`; no new glow/gradients; only real numbers.
- Loading, empty, error (`QueryErrorNotice`) and offline (navigator.onLine banner, send disabled) states.

### Phase 5 — Models and Tools screens
- Models: per provider/model from `ai_provider_runtime` + `ai_team_trace` (last 24h) + registry: Configured (key present, boolean only), Reachable (a recent successful call), Healthy (success rate and circuit closed), Rate-limited / resting until (time), last verified, usage today, paid budget used vs cap where recorded. Catalog-only models are labeled "listed, unverified". Nothing secret is returned.
- Tools: from `jarvis-tool-registry` grouped into AI/models, Website builder, Research, GitHub/code, Database/backend, Growth/CRM, Deployment/operations; each shows readiness (key present / connected / missing), access (read / proposes write), and whether approval is required. A Run button stays only for read-only tools. Missing integrations say what's missing.

### Phase 6 — Verification and status report
- Tests: redaction, event writer, conversation scoping, model-status classification (configured vs reachable vs healthy vs rate-limited), tool categorization, approval-still-required checks.
- Run typecheck, lint, then the full test suite; report only real results.
- Browser checks signed in at 390x844 and 1280: send a real message, see the reply and its steps, reopen after reload, switch conversations, open Models/Tools, stop a run. One small free-model message only; no paid calls, publishing, emails or posts.
- Feature-by-feature status report with any blockers.

## Risks and safeguards
- `jarvis.functions.ts` and the page are large and well-tested; changes are additive and existing tests are kept passing.
- Migrations are additive only (new tables, a nullable column, backfill); RLS stays owner-only; super-admin guard stays on every server function.
- Streaming on Cloudflare Workers: use a standard response stream from a server route; if a runtime limit blocks it, Phase 3 falls back to polling run events (still real data).
- Event summaries may contain business data: they're truncated, redacted and stored only for the owner.
- Approval gates, budget caps, rate limits, free-only mode and audit logging are unchanged.

## Technical details
- Event contract: `{ runId, step, kind, toolId?, status, startedAt, finishedAt?, durationMs?, input?: string<=500, output?: string<=1500, artifactUrl?, error?: string<=300 }`.
- Stream route: `src/routes/api/jarvis/stream.ts` (signed-in, bearer-verified, super-admin check), newline-delimited JSON of events then `{type:"final"}`; abort via request signal.
- New/changed files (indicative): `supabase/migrations/*_jarvis_run_events.sql`, `*_jarvis_conversations.sql`, `src/lib/jarvis-events.server.ts`, `src/lib/jarvis-conversations.functions.ts`, `src/lib/jarvis-model-status.ts`, `src/components/app/jarvis/{CommandShell,ConversationDrawer,RunInspector,ModelsPanel,ToolsPanel,TasksPanel}.tsx`; edits to `admin.jarvis.tsx`, `jarvis.functions.ts`, `jarvis.css`.
- No deploy, publish or merge; you publish when ready.
