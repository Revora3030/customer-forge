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
- Admin Jarvis uses the shared conversation request helper and router rather than forcing its own free-only lane; this preserves one eligibility, budget and failover boundary for chat and build teamwork.
- Site builds checkpoint each finished AI stage on the job row (stage and section checkpoints, digest-matched and job-scoped) so retries resume instead of regenerating; cleared on completion.
- Builds parked for AI capacity go only through the worker's capacity deferral, which mirrors its retry time into generation_jobs.resumes_at/wait_reason/wait_providers for owner display; never add a second deferral path.
- Marketing cookie consent occupies normal document flow on phones and floats only on larger screens; this keeps signup usable without hiding consent or weakening measurement controls.
- Shared list-query recovery uses QueryErrorNotice before empty states; failed reads must not be presented as missing customer records.
- Workspace mobile navigation traps and restores keyboard focus and makes the closed drawer inert; desktop navigation remains available without modal behavior.
- External integration tests require their exact file to be selected as well as the credential gate; ordinary regression runs must never send email or create checkout sessions.
- Prospect demo Google Maps photos are stored only as place ID + media rows pointing at /api/public/maps-photo, which redirects to Google live; Google's terms forbid saving copies and every photo is credited to its author.
- Browser visual QA captures runtime script errors in the measured page and grades them P0; this feeds the existing AI repair loop instead of a separate error channel.
- Perplexity keys are split by connection: `PERPLEXITY_API_KEY` is the Lovable-managed connection (gateway, Search API only); `PERPLEXITY_API_KEY_1` is the owner's own `pplx-` key, the only key allowed at api.perplexity.ai directly (Agent API in `src/lib/integrations/perplexity-agent.server.ts`). Agent calls stay behind `paidCollectiveAllowed`; only the super-admin smoke check and `approvePerplexityResearch` (owner's explicit Jarvis research.ask Approve tap, audit-logged) bypass it.
- Subdirectories may have their own AGENTS.md; read it before changing files there.
