# Roadmap — Five-phase blocker elimination

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
