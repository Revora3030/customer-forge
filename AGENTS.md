<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Whole-repository upgrade contract

- Checkout returns never prove payment; Stripe duplicates are acknowledged only after matching completed settlement, and unfinished claims are retained for review to prevent replayed side effects.

- Prospect outreach verifies the exact selected public-listing email through the existing enrichment verifier and retains its listing source; failed directory requests throw rather than log successful zero-result searches, so authorization never substitutes for contact evidence.
- External bots reach the platform only through key-checked `/api/public/agent/*` routes (`REVORA_AGENT_API_KEY`); their leads go through `importLeadCsv` into the owner review queue, so a bot never gets database keys, never contacts anyone and never starts a build. Level 4 actions (merge, deploy, publish, send, paid build, billing, delete) are asked for through `POST /api/public/agent/action-requests` and done by the bot only after the founder approves that one request on `/admin/approvals`; the gateway records decisions and never performs them. Runbook: `docs/agents/GROK_OPERATOR.md`.

- AI City is an authenticated super-admin projection of existing queues, owner-scoped Jarvis evidence and Lovable traces; polling never dispatches work, recent running heartbeats alone animate activity, and missions enter existing reviewed executors rather than a second worker or approval system.
- Scheduled Jarvis routines claim the unchanged owner-scoped row before dispatch and fence settlement to a unique attempt marker; unresolved running claims never auto-retry, preventing duplicate spend without a second scheduler or schema.

- Revora homepage, states and about search copy is shared through marketing-seo.ts with the SEO inventory; tenant head branches stay independent to prevent platform identity leaking onto customer sites.
- Crawler handlers return retryable uncached failures on lookup errors; sitemap content reads paginate existing public projections and preserve publication/tenant gates so incomplete inventories never look successful.

- First-build chat preferences travel through the existing saved brief to analysis, identity and composition checkpoints; keep them distinct from business fact evidence so owner direction survives retries without inventing claims.
- Served-HTML verification reports its evidence type and missing checks explicitly; missing preview evidence must never be counted as passed or trigger rollback, because browser interaction and rendered QA are separate measurements.
- Completed build polling refreshes generated content, settings, versions and readiness through the shared generated-result cache helper so customer views display saved output rather than stale empty states.
- Draft refresh notifications match the viewed organization; unpublished overlay comparison retains a draft pane and failed comparisons report unavailable rather than claiming no published site.

- Instagram is owner-scoped custom OAuth with encrypted server-only credentials; models may propose drafts but only the explicit authenticated review endpoint may atomically approve and publish an immutable saved caption/image URL/account. Uncertain submissions never auto-retry, preventing duplicate posts.

Scan before broad changes; preserve generated files and tenant/auth/billing/publishing boundaries. Gate runtime claims on evidence.
- Jarvis diagnostics are super-admin, allow-listed, readiness-only until requested. Keyless reads bound HTML, omit redirects/subresources/raw output and never prove rendered QA. Pin parsers compatible with the existing entities aliases to preserve builds.
- New customer website creative choices, including first-build CTA labels plus motion and density tokens, must be AI-authored and safety-reviewed rather than seeded from deterministic rules; this keeps creative authority with the AI team while preserving truth/accessibility safeguards.
- Builder progress uses the chat request ID from planning through apply; this keeps every live stage attached to the request that caused it.
- AI router unit tests use the shared provider environment isolation helper and stub HTTP and spend reservations; ambient deployment credentials must not trigger provider calls or ledger writes.
- Lovable AI is the only AI provider: the router (`router.server.ts`) has one adapter (`providers/lovable.ts`, chat-completions for openai/google ids, native /v1/messages for anthropic ids, image, transcription and Gemini Omni video jobs), active only when LOVABLE_API_KEY is present; every call spends through the shared daily paid reservation and Luna's monthly cap. Each role is a comma-separated per-job roster in `config.ts` (overridable via AI_LOVABLE_MODEL_<ROLE>) that the router fails over across; Jarvis's chat roster lives in browser-safe `lovable-models.ts` so pickers only send roster ids, which lead via `preferModels` without dropping failover. Review areas pick their first model via REVIEW_AREA_MODELS. No free/backup provider exists (owner decision 2026-10-22): when Lovable is unavailable or capped, work waits; never re-add a second provider lane.
- The builder's thinker (`callBestThinker` in `thinker.server.ts`) reserves monthly + per-workspace spend through Luna's `reserveBudget`/`settleBudget`, then walks the shared router with `budgetReservedExternally`; never add a second paid-reservation path.
- Admin Jarvis uses the shared conversation request helper and router; this preserves one eligibility, budget and failover boundary for chat and build teamwork.
- Site builds checkpoint each finished AI stage on the job row (stage checkpoints incl. section wording, section checkpoints; digest-matched and job-scoped) and a capacity park keeps the attempt's pictures, so resumes reuse inputs the saved section designs depend on instead of regenerating; cleared on completion.
- Builds parked for AI capacity go only through the worker's capacity deferral, which mirrors its retry time into generation_jobs.resumes_at/wait_reason/wait_providers for owner display; never add a second deferral path.
- Marketing cookie consent occupies normal document flow on phones and floats only on larger screens; this keeps signup usable without hiding consent or weakening measurement controls.
- Shared list-query recovery uses QueryErrorNotice before empty states; failed reads must not be presented as missing customer records.
- Workspace mobile navigation traps and restores keyboard focus and makes the closed drawer inert; desktop navigation remains available without modal behavior.
- External integration tests require their exact file to be selected as well as the credential gate; ordinary regression runs must never send email or create checkout sessions.
- Prospect demo Google Maps photos are stored only as place ID + media rows pointing at /api/public/maps-photo, which redirects to Google live; Google's terms forbid saving copies and every photo is credited to its author.
- Browser visual QA captures runtime script errors in the measured page and grades them P0; this feeds the existing AI repair loop instead of a separate error channel.
- Perplexity keys are split by connection: `PERPLEXITY_API_KEY` is the Lovable-managed connection (gateway, Search API only); `PERPLEXITY_API_KEY_1` is the owner's own `pplx-` key, the only key allowed at api.perplexity.ai directly (Agent API in `src/lib/integrations/perplexity-agent.server.ts`). Agent calls stay behind `paidCollectiveAllowed`; only the super-admin smoke check and `approvePerplexityResearch` (owner's explicit Jarvis research.ask Approve tap, audit-logged) bypass it.
- Subdirectories may have their own AGENTS.md; read it before changing files there.
- Prospect search is OpenStreetMap-only unless a caller explicitly asks for Google Places and no zero-cost switch is set; demo outreach emails always carry the canonical setup/monthly price sentence so the offer is never presented as entirely free.
- Jarvis replies record each model round, tool call and proposal in jarvis_run_events (redacted, bounded, owner-read RLS, written once after the reply via jarvis-events.server.ts); provider status levels come only from recorded calls and circuit state in jarvis-model-status.ts so configuration is never shown as working.
- Jarvis messages belong to owner-only jarvis_conversations; a database trigger assigns unscoped inserts (routines, older clients) to the latest active conversation and rejects foreign conversation ids, so every write path stays scoped without per-caller changes.
- Model-declared whole-site redesigns must cover every retained section after renderer validation; reviewer rejections cascade to dependent references and never revive rejected creators, preventing partial or fabricated rebuilds from being accepted.
- First-site jobs compare tenant readback against the materializer's exact page/section identities, roles and multiplicity before completion; composition saves must return exactly the requested tenant-scoped section, so zero-row writes cannot count as saved designs. This is structural verification, never a creative template or a rendered-quality claim.
- Cinematic primitives (scene, scroll_chapters, offer_card, spin_viewer, collection_row) are AI-chosen via PRIMITIVE_GUIDE: scenes compute their scrim so text passes AA over any photo, offer cards show prices only from the named real service and link only to the site's own booking/quote paths, and spins with under 8 owner-photographed angles stay a still. Sol's per-section shot list rides the screened creative brief (refined stage checkpoint) into the one image prompt; design-quality gates (text-only opening, scene contrast, no interactive primitive on home) return through repairDesignQuality, and overlay-covers-control at 390px is browser P0 whose missing measurement reports not measured — so the reference look never trades away truth, reachability or evidence.
- Publishing has one path, `publishSiteNow` in production.functions.ts (role, payment/readiness gates, production snapshot, live switch); the Publish button and the builder apply's straight-to-live step both call it so live edits never skip the publish gates.
- The router filters every role roster through the live Lovable catalogue (`catalogue.server.ts`, GET /v1/models, 10-min cache, last-good copy kept) by surface, deprecation and retention policy; if the catalogue is unreadable the static rosters are used and admin health says so, so stale ids are never routed or shown as healthy.
- Admin routing controls derive only from compatible configured Lovable rosters, never historical usage; saves validate exact catalogue IDs server-side. Legacy usage remains immutable accounting history, not a selectable provider.
- Jarvis Lovable speech (`lovable-speech.server.ts`) calls `/v1/audio/speech` only via the router's `callLovableSpeech`, reserving/settling the shared Luna + daily paid caps per call with a per-character estimate; Auto keeps ElevenLabs when its key exists so the working voice is never replaced silently.
- Site builds never run inside a browser request: the builder pump and kicks ask the database (`call_revora_job`, pg_net, 15-minute hold) to call the worker route, which streams keep-alive bytes so the hosting proxy's ~100s idle cutoff cannot kill a long AI step; thinker answers get a per-attempt limit scaled to their output size (hard cap in the router).
- Customer FAQ metadata reads dedicated visible FAQ composition nodes through composition-faq.ts; this keeps tenant page facts aligned without inventing schema for inactive panels.
- Public form interaction tracking uses a per-mounted-form deduplication guard and skips draft previews; this keeps repeated focus and back/continue actions from inflating conversion counts.
- Existing composition primitives remain the sole interactive website rendering path; measured mobile action height reserves clearance without imposing new customer templates.
