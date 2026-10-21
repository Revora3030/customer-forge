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

- Instagram is owner-scoped custom OAuth with encrypted server-only credentials; models may propose drafts but only the explicit authenticated review endpoint may atomically approve and publish an immutable saved caption/image URL/account. Uncertain submissions never auto-retry, preventing duplicate posts.

Scan the entire repository before making broad changes. Do not mass-edit generated types, lockfiles or binary assets without a concrete reason. Prefer deterministic, evidence-backed improvements, preserve tenant/auth/billing/publishing boundaries, and keep browser/database/provider claims explicitly runtime- or environment-gated.
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
- Chat edit scoping is model-declared (planner `scope` field) plus the point-and-edit block id, enforced in `src/lib/builder/edit-scope.ts` by dropping out-of-scope actions before apply; it must stay fail-open and never keyword-classify requests.
