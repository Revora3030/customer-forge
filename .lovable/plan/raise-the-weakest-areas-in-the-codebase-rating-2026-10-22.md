# Raise the weakest areas in the codebase rating

The uploaded rating gives the platform 7.9/10 overall. Its biggest gaps are around proof: things that exist in the code but haven't been shown to work for real. No plan can promise a 10/10. This plan targets the gaps the rating names, in priority order. Each step finishes with evidence, not just a claim.

Ground rules for all phases: no paid AI calls, no publishing, no emails or posts, and no rebuilds of customer sites unless you approve each one first. Pricing stays at $350 setup, first month free, then $100/month.

## Phase 1: Prove the builder makes complete websites (P0, builder rated 7.5)
- Do one free-model first build on an internal test workspace (never a customer's), with your approval first.
- Read the saved result back: every page and every section has an AI-made layout, real or credited pictures, and no plain white or cream background.
- Run the existing visual check on every page at phone, tablet and desktop widths. Then check that links and contact forms work and that page titles and descriptions are filled in.
- Write the findings up as a report: which pages passed, which failed, and why. Failures go into the existing AI repair loop, followed by one re-check.
- Flag older saved designs that still use the old cream style. List them for you instead of changing them silently.

## Phase 2: Jarvis shows everything it does (P0, Jarvis rated 8.0)
- Show live step-by-step progress while Jarvis replies: which model, which tools, how long each took, failures and retries. Today these steps only appear once the reply is finished.
- Add a Stop button that actually cancels a run, and Resume for runs that were interrupted.
- Approvals expire, and each one can only be used once. Show expired approvals clearly.
- Add one place that lists every pending approval: posts, research, outreach and Growth Engine items.

## Phase 3: Production safety checks (P0, security 8.0, readiness 7.0)
- Add automated tests that sign in as one workspace and try to read or change another workspace's sites, leads, quotes, bookings, Jarvis chats and approvals. Every attempt must be blocked.
- Confirm on the server that paid AI, publishing, email and posting all require the right person's approval.
- Run the security scan and database linter, and confirm database changes were applied in the right order. Fix whatever they find.

## Phase 4: Honest integration status (P1)
- Each connection on one status page reads Working, Not connected, Failing or Not checked yet, based only on real recent results.
- Instagram reads "Not connected" until you add your Meta app credentials. That part is blocked on you.
- Show email domain verification and Cloudflare zone status as they are today. Neither is verified yet.

## Phase 5: Phone and tablet QA sweep (P1, mobile rated 7.5)
- Check every signed-in and public page at 320, 390, 768 and 1280 widths. Fix anything that overflows, buttons too small to tap, and broken layouts.

## Done means
- The full test suite, typecheck and lint pass, and the build is OK.
- The Phase 1 report shows one complete free-model website with every page checked.
- The cross-workspace tests pass, and the security scan comes back clean.

## Technical details
- Phase 1 uses the existing `site-engine.worker.server.ts` first-build path, `first-build-saved-coverage`, `palette-guard` and `visual-measure` on a test workspace.
- Phase 2 builds on `jarvis_run_events`: write events as they happen instead of once after the reply, add a cancel flag on the run, and add expiry and a used-once marker to approvals (an additive migration).
- Phase 3 adds a vitest suite with two signed-in workspaces running against RLS. It is gated so it never touches real customer data.
- Phase 4 reuses the Jarvis readiness panel and `jarvis-model-status.ts` evidence levels.
