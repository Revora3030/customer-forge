# Roadmap — Five-phase blocker elimination

## Site-wide upgrade (2026-10-20)
- [ ] Current continuation: upgrade shared signed-in navigation/recovery and mobile marketing account controls; verify dynamic/shared-preview routes and offline publish-handler gates; record exact evidence and remaining gaps.
- [x] Wave 0: 23 public pages x2 widths + 33 signed-in pages checked: no console errors, no sideways scroll, all have titles/descriptions.
- [x] Phone tap targets fixed on sign-in, reset password, contact, CRM.
- [x] Homepage reduced to 7.3 screens at 390x710, including the undecided cookie notice and footer; checked at 320/390/768/1280/2560 widths.
- [x] Phone number removed from all public pages, footer, phone bar, SEO data (owner choice). Signed-in app pages still show it.
- [x] Mobile cookie notice now occupies its own row; starter input reaches signup, Reject/Accept persist, footer settings reopen it. Shared mobile header/footer and product tour tightened.
- [x] 24 static public pages + 24 linked dynamic pages checked at 390/1280; additional 18 state/city/local/calculator checks passed. These are sampled route/render checks, not exhaustive functional QA.
- [x] 111 targeted consent/preview/publish/resume checks pass; full suite 3,016 passed, 3 skipped; lint 0 errors/1 existing warning; security/repository/readiness structural audits pass; latest harness build OK.
- [x] Actual signed-in dashboard, website builder and admin Jarvis loaded during focused owner checks. No modifications or send/publish clicks performed.
- [ ] Complete authenticated all-page runtime audit: broad rapid checks caught blank/loading states; longer focused checks succeeded, but the later batch again timed out/loaded blank. Requires isolated waits and server/network diagnosis, not counting HTTP 200 as proof.
- [ ] Token preview and publishing boundary end-to-end check: existing offline safeguards pass; no new token, publish or customer-site mutation performed. Held-snapshot behavior for share links during fresh replacement still needs verified product behavior and dedicated coverage.
- [ ] Finish waves 2–5: full content/accessibility/performance, every dynamic permutation, signed-in functional flows, owner-preview navigation and publish-handler rejection evidence are not complete.
- [ ] Waves 2–5: complete only after page-by-page and signed-in journey evidence, not static route coverage alone.

## Build resume + production audit (2026-10-20)
- [x] Save finished early build stages (brief, brand identity, wording, page plan) per job; retries reuse them. Verified live: resumed attempt skipped analysis (33s -> 0.6s) and reused pictures.
- [x] AI repair pass when a page plan is unusable; home-page address aliases accepted.
- [x] Full suite green after fixing a test that read live provider state.
- [ ] One build end to end (BLOCKED: workspace daily AI limit and $5/day paid cap reached today; free pool heavily rate-limited). Daily site limit stays 5 until it passes.
- [ ] Migration drift: needs the remote migration version list (not readable from here) to reconcile.
- [ ] Owner decision: canonical offer in code/DB is $350 setup + 3-day full access; owner brief cites $750 + 1-day.
- [x] Jarvis tool/permission inventory documented (docs/operations/jarvis-tool-inventory.md).
- [x] Queued autopilot sends respect the off switch; launch review requires workspace membership.
- [x] Migration reconciliation runbook (docs/operations/migration-reconciliation.md).
- [ ] Wire durable approval proof into Jarvis consequential endpoints (needs table + UI).
- [ ] Live two-workspace RLS test (needs test accounts in a non-production database).

## Jarvis model access (2026-10-20)
- [x] Remove arbitrary catalog/purpose/demo defaults and admin chat free-only override, preserving explicit controls, capabilities and budgets.
- [x] Run isolated routing and spending regression tests; full suite passed (2,859 tests, 3 skipped). Live provider access and a real customer build remain unverified; no deployment or provider spending performed.

## Current repair request (2026-10-18)
- [x] Run repository-wide failure inventory and repair reproducible local failures: 335 test files pass, 2,749 tests pass, 3 integration tests skipped; lint has no errors and one existing warning.
- [x] Verify builder preview, chat compatibility, and complete first-build regression tests locally; repaired legacy branch-column detection and provider test isolation. No new customer build or production behavior claimed.
- [x] Verify affected signed-in browser flows (2026-10-18): backend woken, signed in as owner admin; /app/website builder, chat history, and /app dashboard all load — no console errors, no failed requests, no "still being built" masking, no trial-ended banner.

- [x] Phase 1 inventory: no style pools remain reachable.
- [x] Phase 2: silent label trim removed; site-style / site-effects audited.
- [x] Phase 3: larger layout and motion vocabulary + Sol prompt updates.
- [x] Phase 4: visual evidence tied to site version; AI repair loop ("Fix with AI").
- [x] Phase 5 security pass: all scan warnings fixed.
- [x] Visual check was broken in real browsers (security rules blocked it; sub-pages 404'd on preview links) — fixed.
- [x] "Fix with AI" runs live: 3 AI repair rounds ran on the Northline test site.
- [x] Test site check: 0 overflow, 0 small text, 0 small taps at 320/390/768/1440.
- [x] Northline visual check now PASSES (0 serious issues; saved score 91). Remaining advice (slow server, big scripts) comes from the unbundled preview server.
- [x] Automatic buttons/cards by section name removed; AI must request them (rebuild of test site still to confirm).
- [x] Design compiler no longer invents phone/tablet columns, menu style, button stacking, crop or text scale; blank design record carries no look.
- [ ] Rebuild test site to confirm buttons/cards still appear (needs a live AI build).
- [ ] Second-industry build → approve → publish → verify publicly (BLOCKED: needs a real business’s details from owner).
- [x] Fixed page shape (required opening/closing/picture sections) removed from AI instructions.
- [x] Fresh security scan + database checks clean; delete paths reviewed (rebuild wipe only on owner-requested fresh rebuild with backup).
- [ ] Remaining 12/16-point areas (expressiveness, effects ceilings, AI screenshot critique, job fencing audit, full security/billing audit).
- [x] 46-vs-91 explained: 46 is the launch-review score (visual design hard-set to 0 until screenshot evidence exists; trust needs real reviews; publishing needs custom domain). 91 is the visual check. Different measures.
- [x] Launch score uses passing visual check for current revision; trust skipped without real reviews; own /s/ address counts.
- [x] Build attempt fencing: progress/complete/fail writes tied to attempt; superseded attempts stop silently; failed fresh rebuild restores backup (rollbackFreshBuild). Tests in final-blockers.test.ts.
- [x] Database security check clean after new server-only revision lookup.

## Hall of Fame architecture (Sep 25)
- [x] Independent + visual review routed to Terra (pinned, never raised to Sol)
- [x] Visual check: lazy pictures, one-page menu, home/anchor links fixed
- [x] Multi-provider advisers before Sol + diverse free-squad reviewers in first build and edits (Terra keeps truthfulness)
- [x] Persisted per-model capability registry with probe evidence + admin counts
- [x] Per-build team trace table and admin view
- [ ] Revora site: visual 97/100 and hours fixed — publish waits on the $350 setup payment
- [ ] Second genuinely different industry build — needs real business details from owner
- [x] Final security/billing review (clean)
- [ ] Northline rebuild — waiting on owner go-ahead (uses AI budget)
- [x] Site review no longer writes the business name into empty headlines (report only); page caps removed; build picture cleanup scoped to one business.
- [x] Phase 2: invented sections proven to reach the page; site check covers every page and flags sections with no layout.
- [x] Phase 3: AI designs its own motion (start position, tilt, fade, blur, easing, repeats, play-on-scroll) within safety limits; bad values reported to the AI, never dropped.
- [x] Phase 4: "Review every page at 5 sizes" (320/390/768/1024/1440) — photo, AI review, safe repair, re-photo and re-review.
- [x] Phase 5: jobs audited (all cron-secret protected, lease + attempt fence), nightly record clean-up added, security scan clean.
- [x] AI-designed hover/focus/touch response (bounded, reduced-motion safe).

## Remaining blockers (Sep 25)
- [x] Stale roadmap items closed; preview page split warning fixed; old Stripe test keys kept — still used by payment tests.
- [ ] Real AI build to prove motion, 5-size review, buttons/cards — needs owner go-ahead (uses AI allowance).
- [ ] Strengthen near-ranking city/industry pages with truthful content.
- [ ] Google Business Profile reviews/hours sync.
- [x] Automatic 5-size look-and-fix after every change (builder open).
- [x] Root-level legacy authoring elimination (zero-cost switch, dead builders, canned upgrades, fixed repairs removed; firewall tests; all gates pass).
- [x] Final AI-authority cleanup: reviewer taste vetoes and fixed public sticky chrome removed; AI media treatments now reach public rendering.
