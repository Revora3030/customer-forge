## Reveal brush and trade playbooks (2026-10-28)
- [x] `before_after_slider` takes `revealMode: "brush"`: the visitor drags across the before picture and the after appears where they have been, with a live percentage ("Clean this driveway: 44%"), a button that shows the finished result for keyboard and screen-reader users, a touch switch so the page still scrolls past it, and the finished picture for no-JavaScript visitors. It keeps the existing rule: the owner's own real before and after photos only, never generated pictures.
- [x] Trade playbooks (`builder/industry-playbook.ts`): for 19 kinds of local business, the signature moment, a scene order for a scroll story, and exactly what the owner must supply. Added to the first-build design prompt as ideas, not orders.
- [ ] Not built: AI-made before and after pairs (they would present invented results; the builder refuses them on purpose), and any proof that a first build with real generated pictures looks like the reference video, which needs a live build.

# Roadmap — Five-phase blocker elimination

## Blueprint batches C, D and E (2026-10-27)
- [x] Batch C was checked against the code before anything was built: the instant quote estimator is the existing `quote_calculator`, the floating mobile bar is `mobile_sticky_bar`, the before/after slider has keyboard steps (`SLIDER_STEP = 5`), scroll chapters, the five-picture first-build gate and the duplicate-text / empty-column / contrast repair gates all exist. Nothing was rebuilt.
- [x] Estimates and work orders for a lead (Leads → open a lead → "Estimate or work order"): `lib/estimates/printable-estimate.ts` builds the document in exact cents from what the owner types (lines, quantity, price, a tax rate that applies only to lines marked Taxed, discount lines, validity, terms); a work order is a crew checklist without prices unless the owner turns them on. It prefills only from records the workspace already holds (service, assigned teammate, next appointment, business profile) and shows the visitor's calculator range and choices for reference without copying them into prices. It prints or saves as PDF from the browser, names the PDF after the document number, remembers tax rate, validity and terms on that device, and logs one activity line on the lead when the owner ticks the box. Nothing is sent to the customer. The leads page already had the stage board, status filter and CSV export, so none of that was rebuilt.
- [x] 44px phone targets: `scripts/page-sweep.mjs --target=44` lists the controls that miss it, most widespread first. The shared header, footer and buttons already passed; the misses were standalone links and chips (state, trade and related-page lists), the small button size, the auth logo link and one auth button. They now use the `tap-target` utility, and the sweep reports zero small targets across the 36 sampled public pages. Buttons also give a subtle press (scale 0.98, off under reduced motion).
- [ ] Not built: a universal MCP gateway, SVG social cards and a tenant service worker (no recorded need, and each adds an outbound or caching surface that needs an owner decision).

## Blueprint batches A and B (2026-10-27)
- [x] Event bus: `cognition/event-emitter.ts` collects independent sources and reports an unreadable one by name; new sources for failed builds (names the stopped step), failed CI on the release branch's current commit, Revora's own unanswered leads and trials ending within a day. Owner notices only: nothing is retried, and no client is contacted.
- [x] Approve exactly what you saw: the approval call can carry a fingerprint of the content shown; the server refuses if the item changed since and pins the claim to that content. Used by the existing Growth queue and the new City cards.
- [x] `cognition/build-plan.ts` derives the build's task graph from the real generation steps (tested against them) to say where a failed build stopped.
- [x] AI City: one-finger rotate, two-finger zoom and pan; pixel ratio up to 2x with fall-back to 1x if the frame rate drops, 2048 shadows on desktop; beacon pulse speed follows queue depth; live worker cards from recorded fields; quick missions per district tied to real read-only tools (drift-tested); approval review cards in the Growth district (two taps for medium and high risk).
- [ ] Not built: cryptographic HMAC tokens (the queue row is the server-side authority, so a keyed token adds nothing), per-task token-budget reservations (not recorded), travelling data pulses between districts (not recorded), automatic build retries or client notifications (spend / outbound sends need owner approval), simulated vision review.

## AI City upgrade (2026-10-27)
- [x] "Needs you" triage panel: every failed or waiting record, failures first then longest-standing, opening the record's evidence; says "records unavailable" rather than looking calm when sources cannot be read.
- [x] 3D scene: rings and beacons coloured by recorded state (green working with pulse waves, red failures, gold waiting, grey unreadable), floating labels with live running/waiting/failed counts, smooth camera flight between districts, colour key.
- [x] "All activity" tab: newest-first feed across every district with text search and district filters; per-district records-per-hour chart in the inspector.
- [x] District shareable in the address (?district=growth); keys 1-7 and arrows switch district (ignored inside fields and dialogs).
- [x] 23 City tests (triage ranking, counts, hourly buckets, search, feed, deep-link parsing, key mapping, panel rendering). Rendered with a stand-in model and sample records at 1280 and 390: no errors, no overflow.
- [x] Scene: warm key and cool rim lighting with a gold glow over the tower, depth fog, district pads that glow with recorded state, status-coloured conduit lines from the Jarvis hub to each district (a status indicator only; nothing travels along them).
- [x] Phone: thumb-zone district carousel pinned above the safe area, compact count badges with a full label only on the chosen district, bottom sheet that opens at about half height, resizes by tap or swipe on its handle and swipes down to close.
- [ ] Not built: autonomous cold outreach sending (needs explicit owner approval per AGENTS.md).
- [ ] Not built: model "sprites" travelling between districts. Records do not say which district hands work to which, so any movement would be invented.
- [ ] Not verified against live records or your real building models (needs your signed-in /admin/city).

## Jarvis event nudges (2026-10-27)
- [x] The routines job now also posts a plain, no-AI notice into each super admin's Jarvis chat when a site build failed in the last day (cooldown per workspace, at most 5 per pass), with a suggested question to ask. 4 tests.
- [ ] `ci.failed` and `lead.unanswered` have rules but no emitter yet.

## Weekly content audit of published sites (2026-10-27)
- [x] `site-content-audit` job (Mondays 13:05 UTC) checks each published customer site's home page and up to 6 internal links for title, h1, structured-data validity, alt text and broken links; up to 40 sites per run, rotated weekly; one digest per week to the Revora inbox only (customers are not emailed). 8 tests.
- [ ] Not run against live sites; first scheduled run happens after publish. No results table (needs a migration); findings live in the digest and job log counts.

## Public page sweep (2026-10-27)
- [x] `scripts/page-sweep.mjs` (`npm run site:sweep`) crawls a running site at phone and desktop width and measures status, script errors, overflow, title/description/h1, unnamed controls, image alt, tap targets and broken internal links.
- [x] First run: 43 pages across 21 families, 0 failures; fixed 15 small phone tap targets on location, state and guide link lists. Authenticated pages and the one-time-token pages are not covered (no sign-in available to the crawler).
- [ ] Run the sweep in CI against the built app (needs a start step and Playwright in the workflow).

## Free upgrades from the model scan (2026-10-27)
- [x] Printable / save-as-PDF estimate after a quote request (browser print, no server cost, labelled as an estimate not a quote).
- [x] Customer-site "page not found" now links back to the business's home page.
- [ ] Already present, not rebuilt: QR codes (campaigns), voice dictation (Jarvis dock, chat tools), dashboard install manifest.
- [ ] Not built: SVG social cards (Facebook, iMessage and X do not accept SVG share images; needs PNG rendering), tenant service worker (stale-site risk), tsvector search and audit triggers (migrations need approval).

## Cognitive architecture foundations (2026-10-27)
- [x] Six-pillar foundations in `src/lib/cognition/` with 33 tests (plan graph, ReAct loop, memory recall, approval tokens, vision review, event rules, deliberation); see docs/COGNITIVE_ARCHITECTURE.md.
- [x] Jarvis memory now recalls relevant memories from all 200 for the owner's latest message instead of only the newest 40.
- [ ] Database-backed approval store and mutation tools (needs table migration approval).
- [ ] pgvector memory (needs migration approval and a verified, priced embeddings call).
- [ ] Vision-model critique, event emitters, live multi-agent runs (each spends budget; none wired).

## AI City and workforce-first continuation (2026-10-27)
- [x] Harden existing routine runner with conditional pre-execution claims, owner/attempt-fenced settlement and explicit uncertain outcomes; overlapping wake-ups, changed prompts and failed settlement tested without paid calls or production writes. 51 focused tests pass; lint clean; automatic build OK. Hosted concurrency and live cron remain unverified (docs/workforce-routine-verification.md).
- [x] Build authenticated AI City with all seven operational districts, real queues/evidence, full returned Lovable capability catalogue and phone/desktop navigation. Super-admin reads preserve owner-filtered Jarvis records and per-source failures.
- [x] Connect read-only department checks to the existing executor and prepare review-only missions in Jarvis; no simulated jobs, second worker or automatic spend/send/publish path. Existing department review pages remain execution entry points.
- [x] Signed-in real records, 3D scene, district selection, Operations fallback, full catalogue, mission composer handoff and real read-only error diagnostic checked; 320/390/768/1280/2560 no overflow, reduced-motion fallback, no page errors after repair; 78 focused regressions pass, lint clean, automatic build OK. Evidence: docs/ai-city-verification.md.
- [ ] Full workforce automation beyond existing executors: durable approval consumption/unified inbox, persistent employee task contracts and evaluated media workflows remain unfinished. Same-routine claims implemented; owner-wide serialization and live scheduler acceptance remain unverified. No approved paid employee run or complete all-pillar acceptance evidence exists; city controls do not imply these are complete.
- [ ] Continue unfinished pillars after city; live paid work, outbound sends and publishing wait for specific approval; external credentials and measured live evidence remain blockers, not completed milestones.

## Admin account Lovable-only repair (2026-10-27)
- [x] Inspect all 16 admin index/list screens signed in as the requesting owner; no page script errors or document overflow. Client-detail permutations and every mutation are not covered by this route-load audit.
- [x] Replace usage-derived routing controls with eligible configured Lovable model IDs; reject obsolete pins/pauses server-side and retain immutable usage history. Special media selectors and existing roster order preserved.
- [x] Remove outdated multi-provider/free-router claims, filter current AI health to Lovable records, distinguish configuration from verified calls, fail budget/design reads honestly, and fix phone-clipped AI reporting.
- [x] 29 initial routing checks passed; full suite 438 files / 3,371 tests passed / 6 live tests skipped; changed-file lint clean and automatic build OK. Signed-in Command Center/AI health verified at 390/1280, local Pin/Unpin exercised without saving. Evidence: docs/admin-lovable-only-verification.md.
- [ ] Real AI requests, saved routing changes, every admin mutation and client-detail permutations remain unverified; paid actions/publishing require explicit approval. No provider calls or publishing performed.

## Roadmap continuation (2026-10-27)
- [x] Priority 1: reject zero-row first-build composition saves; eight initial tests passed, including exact tenant filters and missing/duplicate/wrong-row failures.
- [x] Priority 2: compare saved page/section identities, original roles and multiplicity with the materialized build inventory, not only aggregate counts; substituted pages, moved/duplicate sections and lost roles rejected. Completion readback tested with a fake database; no hosted writes.
- [x] Existing controls reviewed: queued/running generation cancellation and recovery already exist; client-side request dismissal is not remote cancellation, and local approval memory is not server authorization. Durable approval consumption and unified inbox remain later work, not claimed complete.
- [x] Batch verification: 144 affected files / 1,079 tests passed; full offline suite: 436 files / 3,365 passed / 6 live tests skipped; changed-code lint clean; automatic build OK. Evidence: docs/roadmap-reliability-verification-2026-10-27.md.
- [ ] Live generation, real lead delivery, paid provider calls, publishing and production mutations require separate owner authorization; none authorized by this continuation.

## Interactive tools and conversion completion (2026-10-27)
- [x] Complete existing comparison slider pointer and image behavior; preserve real-work provenance.
- [x] Complete FAQ structured-data parity for dedicated visible customer FAQ compositions; inactive tabs deliberately omitted.
- [x] Harden existing mobile sticky actions for contrast, long labels, and measured variable-height clearance; hide while typing.
- [x] Complete existing quote selection controls, unique field identifiers, and prevent duplicate/preview tracking.
- [x] 89 focused regressions pass, changed-file lint clean, automatic build OK; isolated browser fixture comparison/FAQ/quote simulated submission and 320/390/768/1280/2560 layout checks pass without script errors. Evidence: docs/interactive-tools-verification.md.
- [ ] Actual customer generation and real lead delivery remain unverified: require authorized AI spending and production mutations. The broader workforce/connector/growth roadmap is not completed by this focused tools pass.

## All-model wiring (2026-10-22)
- [x] Jarvis voice choice: Auto / ElevenLabs / Lovable AI speech (Gemini TTS, budgeted, router telemetry). No live speech call made.
- [x] Maps review form: per-fact source labels, editable address and hours, website suggestions needing approval, existing build handoff kept.
- [x] Veo, music, live voice and embeddings labelled with exact blockers in the model panel.
- [ ] Veo routes: request shape and pricing unverified.
- [ ] Search memory: needs a vector-storage migration the owner approves.
- [ ] Music and two-way live voice: not built.
- [ ] Live end-to-end check of Lovable voice and a Maps-to-build run (needs a paid call / live build approval).

## Test build resume fixes (2026-10-22)
- [x] Resume no longer redoes finished work: busy-AI pauses keep the build's pictures; section wording is saved and reapplied; section designs therefore stay valid.
- [x] Busy (rate-limited) or repeatedly slow free services rest briefly for every concurrent step instead of being re-called.
- [ ] Resume test build "Revora Internal Test Plumbing" with fixed engine, then verify every page, image, form and final quality check (no publish, no paid calls).
- [ ] Published worker still runs the old engine until the owner publishes.

## Raise rating gaps (2026-10-22 plan)
- [ ] Phase 1: one free-model test-workspace build + every-page report — waiting on owner approval to run.
- [x] Phase 2a: live Jarvis step events shown while working (tested).
- [ ] Phase 2: Stop/Resume, expiring single-use approvals, unified approvals list.
- [x] Phase 3 (partial): security scan clean; linter shows 28 server-only tables locked by design (no browser policies) and 1 extension-in-public warning.
- [x] Phase 3 (static part): `tenant-rls-coverage.test.ts` checks every migration-created table with an organization_id has RLS on, never switched off, and no anon update/delete grant. A live two-workspace test against a non-production database is still open.
- [ ] Phase 4: honest status page (Instagram blocked on Meta credentials).
- [ ] Phase 5: 320/390/768/1280 sweep.

## Reject generic white/cream customer defaults (2026-10-22)
- [x] Removed cream/bone/sand suggestions from AI identity guidance; reject dominant near-white/cream generated surfaces even with colorful accents.
- [x] Final identity acceptance rechecks palette and required design tokens after repair attempts; invalid final answers cannot slip through.
- [x] 3,493 tests passed, 6 gated live tests skipped; changed-file lint clean and automatic build OK. Existing customer sites unchanged.
- [ ] Legacy saved palettes/checkpoints and missing-palette renderer fallback still need provenance-aware cleanup; they are not silently recolored by this guard. Live AI redesign unrun.

## Complete customer first websites (2026-10-22)
- [x] Traced signup → onboarding facts/approval → existing queue → AI architecture, sections and chrome; no duplicate pipeline.
- [x] First builds now read back every saved page/section and renderable AI composition before ready/completed; all composition material reads paginate and fail closed.
- [x] Full regression suite: 3,491 passed, 6 live tests skipped; changed-code lint and automatic build checked.
- [ ] Live new-customer signup-to-generated-site verification unrun under standing no-live-build/no-paid-spend restriction. Provider capacity is not guaranteed; existing pause/resume and publication gates retained.
- [x] Materialized inventory identity/multiplicity and zero-row composition saves hardened (2026-10-27); completion now requires exact inserted page IDs/slugs and section IDs/page ownership/roles.
- [ ] Investigation follow-ups: unmarked partial-site handling and upstream service-card architecture coverage still require targeted hardening; this readback verifies inserted inventory, not independent completeness of the architect's design or rendered quality.

## Whole customer-site repair (2026-10-22)
- [x] Inspect all eight Elite Mobile Detail pages and saved requests; no active generation job or duplicate rebuild started.
- [x] Reject model-declared full redesigns missing retained sections; repair invalid composition properties; cascade safety rejections through nested references. Existing every-page visual grader retained.
- [x] 68 focused regressions and changed-file lint pass; harness build OK; all eight authenticated pages rendered at phone/desktop without script errors or horizontal overflow. Evidence: docs/elite-mobile-detail-whole-site-audit.md.
- [x] Complete offline suite: 429 files passed, 3,485 tests passed, 6 credential-gated live tests skipped.
- [ ] Actual free-only redesign and saved-output/full interaction verification remain unrun; existing draft still has plain pages. No paid calls, publishing or outreach performed.

## Gap audit + Jarvis conversations (2026-10-21)
- [x] Evidence matrix and prioritized backlog in docs/GAP_AUDIT_2026-10-21.md.
- [x] Jarvis conversations: create/list/search/rename/archive, owner-only, foreign ids rejected.
- [x] Setup price confirmed $350 everywhere (2026-10-22); locked by offer-price-lock test.
- [ ] Meta/Instagram connection — blocked on META_APP_ID/META_APP_SECRET and Meta app review.
- [ ] Backlog items 2–10 in the audit file.

## No-key Jarvis website tools (2026-10-21)
- [x] Added four bounded direct HTML, accessibility/structured-data, security-header and link-inventory diagnostics through the existing authenticated executor, chat catalogue and page-check panel; no keys or paid providers required.
- [x] 50 focused tests pass, changed-file lint clean, harness build OK. Real published homepage read (84,491 bytes, HTTP 200): metadata, links and security-header presence checks clean; static accessibility flags one unlabeled control and one heading skip. No repairs, publishing or outreach performed.
- [ ] Signed-in button verification blocked: preview shows only backdrop or navigation times out despite restored owner session; not counted as passed. Full autonomous generation and 10/10 quality are not established by these static tools; existing approval, budget and measured-quality boundaries remain.

## Finish free Jarvis tools (2026-10-21)
- [x] Finish page-check/docs inputs and readiness controls; update Context7 API and Browserless envelope; correct speed timeout and preserve canceled requests separately.
- [x] All three supplied keys are saved; signed-in smoke checks returned docs with sources, mobile Lighthouse scores (62 performance / 95 accessibility / 100 best practices / 100 SEO), and phone/desktop browser evidence. Browser reports failed tracking requests, but no script errors, broken links or sideways overflow; no all-clear claim.
- [ ] Live availability requires authorized publishing; no publishing requested.

## Search acquisition upgrade (2026-10-21)
- [x] Audit Google evidence (541 impressions / 8 clicks, Sep20–Oct17), public metadata, crawl boundaries and existing buying-focused pages; Semrush US estimates favor focused contractor/CRM/follow-up searches over broad AI-builder competition.
- [x] Improve homepage, states and about content, contextual links and truthful metadata; remove unsupported one-day/template claims, share inventory copy, and add official Google sources with neutral review guidance. Billing and saved customer content unchanged.
- [x] Correct local page self-referencing canonical/og:url without removing existing crawl eligibility; correct AI-named tenant home canonical; paginate sitemap reads and return uncached retryable failures on lookup errors. 3,172 tests passed, six gated live tests skipped; focused lint clean and harness build OK. Phone/desktop discovery→pricing→signup entry checked without page errors; account/payment submission not exercised.
- [ ] Live search impact requires owner-authorized publishing and subsequent Google data; no traffic or customer guarantees.

## Continued builder upgrade (2026-10-21)
- [x] Unpublished overlay retains draft; failed diff says unavailable; fullscreen remeasures, Escape exits/restores focus and scrolling; phone starts at 390px; contrast scan no longer claims full AA compliance; draft notifications are workspace-scoped.
- [x] Signed-in existing draft renders on desktop/phone; fullscreen/Escape/focus/compare controls checked without page errors or generation. Offline suite: 3,150 passed, 6 live tests skipped; focused lint clean; harness build OK.
- [ ] Live generation/publishing and full interaction QA remain blocked by absent spend/publish authorization; fullscreen comprehensive keyboard trapping and iframe network-failure recovery need further implementation/verification.

## Uploaded one-click website brief (2026-10-21)
- [x] Audit current generation, brief controls, preview, rendered quality and publishing against the uploaded requirements; served HTML does not prove screen/form/image/browser QA.
- [x] Implement saved first-build owner direction, guided brief, manager-only brief writes, read-error recovery, completed-result cache refresh and honest verification evidence using the existing pipeline.
- [x] Signed-in guided brief tested at desktop/phone: reaches composer, fits screen, restores focus, no page errors; AI/mutation calls blocked. Generation, generated-site rendering and publishing were not exercised.
- [ ] Full rendered-site interaction/form/image/network repair coverage remains incomplete; requires generated-site evidence and authorized live verification, not HTML scores.
- [ ] Real generation and publishing verification BLOCKED: paid balances exhausted; no new provider spend or production publishing authorized. Preserve daily site limit 5.

## Instagram posting through Jarvis (2026-10-21)
- [x] Linked Reel caption can be read; video not watched. Owner asked to upload it for visual review.
- [x] Custom Instagram authorization, encrypted owner-bound account credentials, disconnect/reconnect implemented; additive server-only storage migration applied.
- [x] Exact-post review and individual approval, durable duplicate/uncertain-publish protection, Jarvis draft tools implemented for single-image feed posts.
- [x] Offline approval/ownership/state/provider tests and signed-in Jarvis controls checked; latest harness build OK, no real posts sent.
- [ ] Real authorization and posting verification BLOCKED: owner skipped Meta app credential form; callback update also needs publishing authorization, and each test post needs individual approval. No Instagram live access claimed.

## Admin accuracy pass (2026-10-20)
- [x] AI health: totals were capped at 1,000 records; provider status came from one idle server's memory. Now counts every record and uses shared provider records.
- [x] Command center model stats and build health totals count every record.
- [x] All 15 admin pages load signed in on phone width, no errors or sideways scroll.
- [ ] Number-by-number check of the remaining admin pages (analytics, payments, monthly, outreach, clients) against the database.

## Phase 1 — builds never stall silently (2026-10-20)
- [x] Layout rescue wall-clock deadline; capacity-starved layouts park via the existing capacity deferral (forced park, still capped at 6).
- [x] Resume time, reason, busy providers and earliest reset recorded on the job and shown in builder, build card and Jarvis demo list.
- [x] Tests: stage reuse on retry, digest discard, deadline→deferral, resume display, attempt fencing.
- [ ] Live verification build (needs owner approval to spend AI budget).

## Site-wide upgrade (2026-10-20)
- [x] Current continuation: workspace/admin/client-portal keyboard-safe mobile drawers, marketing account controls, service/activity retry states, private route metadata, shared-preview identity/expiry protection, and offline publish-handler fixtures implemented.
- [x] Verification: 370 test files, 3,054 passed / 6 skipped with live integrations disabled; lint 0 errors / 1 existing warning; harness build OK; security and structural readiness audits pass. Existing shared preview home + eight linked pages + missing-page recovery tested at 390/1280 without overflow/page errors; signed-in drawer focus/inert/desktop checks pass for workspace, portal and admin.
- [ ] Remaining journey evidence: all signed-in create/update flows, every dynamic content permutation, owner draft/held-snapshot navigation, comprehensive accessibility/performance, and actual database/RLS publishing rejection remain unverified; no production publish performed.
- [x] Regression safety: general test runs now require explicit exact-file selection before credential-gated live tests can run; isolated routing mocks no longer read production circuit state. Earlier general runs unexpectedly accepted test emails and created sandbox checkout sessions; no payment charge, production publish, outreach campaign, commercial-rule change or migration occurred.
- [x] Wave 0: 23 public pages x2 widths + 33 signed-in pages checked: no console errors, no sideways scroll, all have titles/descriptions.
- [x] Phone tap targets fixed on sign-in, reset password, contact, CRM.
- [x] Homepage reduced to 7.3 screens at 390x710, including the undecided cookie notice and footer; checked at 320/390/768/1280/2560 widths.
- [x] Phone number removed from all public pages, footer, phone bar, SEO data (owner choice). Signed-in app pages still show it.
- [x] Mobile cookie notice now occupies its own row; starter input reaches signup, Reject/Accept persist, footer settings reopen it. Shared mobile header/footer and product tour tightened.
- [x] 24 static public pages + 24 linked dynamic pages checked at 390/1280; additional 18 state/city/local/calculator checks passed. These are sampled route/render checks, not exhaustive functional QA.
- [x] 111 targeted consent/preview/publish/resume checks pass; full suite 3,016 passed, 3 skipped; lint 0 errors/1 existing warning; security/repository/readiness structural audits pass; latest harness build OK.
- [x] Actual signed-in dashboard, website builder and admin Jarvis loaded during focused owner checks. No modifications or send/publish clicks performed.
- [ ] Complete authenticated all-page runtime audit: broad rapid checks caught blank/loading states; longer focused checks succeeded, but the later batch again timed out/loaded blank. Requires isolated waits and server/network diagnosis, not counting HTTP 200 as proof.
- [ ] Token preview and publishing boundary: existing shared token/page navigation verified; unknown/revoked/expired/malformed/mismatched-workspace fixtures and publish handler role/access/approval/branch/measured-quality/version/update rejection tests pass offline. Actual database guard and held-snapshot replacement behavior still need isolated end-to-end coverage. No new token or publish performed.
- [ ] Finish waves 2–5: full content/accessibility/performance, every dynamic permutation, signed-in functional flows, owner-preview navigation and publish-handler rejection evidence are not complete.
- [ ] Waves 2–5: complete only after page-by-page and signed-in journey evidence, not static route coverage alone.

## Build resume + production audit (2026-10-20)
- [x] Save finished early build stages (brief, brand identity, wording, page plan) per job; retries reuse them. Verified live: resumed attempt skipped analysis (33s -> 0.6s) and reused pictures.
- [x] AI repair pass when a page plan is unusable; home-page address aliases accepted.
- [x] Full suite green after fixing a test that read live provider state.
- [ ] One build end to end (BLOCKED: workspace daily AI limit and $5/day paid cap reached today; free pool heavily rate-limited). Daily site limit stays 5 until it passes.
- [ ] Migration drift: needs the remote migration version list (not readable from here) to reconcile.
- [x] Retired stale offer conflict: current owner rule is $350 setup, first month free, then $100/month and 3-day full access; billing unchanged.
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

## Close the gaps vs Lovable/Framer (2026-10-20)
- [x] Jarvis: one follow-up email 48h after the first, only with no reply/claim/opt-out; within daily caps; enforced in send path + DB unique index.
- [x] Demo photos from the Google Maps listing (live, credited).
- [ ] Phase A test build running (parked at 74% on free capacity; $20 paid cap set, takes effect on the live worker after publish).
- [x] Builder buttons verified signed in (2026-10-20): fullscreen preview was trapped under the app header (shell backdrop-blur stacking context) with the exit button covered by Notifications — fixed by portalling the fullscreen preview to document.body; verified open/exit at 1280x1800 with zero page errors. Compare on an unpublished site no longer loads the 404 live page (shows "Not published yet"). Point-and-edit toggles on/off (aria-pressed). Publish dialog opens with correct gating copy ($350 setup, first month free, then $100/month, trial-ended message). 50 related tests pass; no publish performed.
- [ ] Phase B point-and-edit end-to-end AI edit + before/after compare of a live change (needs an AI edit run).
- [ ] Phase C fact provenance + launch checklist.
- [ ] Phase D claimed demo → Activate → setup-fee checkout (setup price is settled at $350; the old $750 figure is retired).
- [x] Phase E approval log (Jarvis operations panel, from the permanent audit record).
- [ ] Phase E daily brief upgrade.
- [ ] Phase F signed-in journey/accessibility/speed pass.
- [x] SEO review: all checks pass, indexed; targets reported.
- [x] Jarvis targets weak existing websites (verified gaps + public email).
- [x] Jarvis: OpenStreetMap as free second lead source.

## Stolen ideas from Terminal Jarvis Frankenstein (2026-10-21)
Owner approved porting two ideas (audit of the uploaded Next.js project; auto package-install, sandboxed codegen, regex intent matching and conversation trimming rejected as inapplicable or worse than existing AI understanding).
- [x] Self-healing preview: the browser quality check now captures runtime script errors and unhandled rejections inside the measured site, grades them as P0 findings, and the AI repair loop receives them in its repair brief (2026-10-20).
- [x] Edit-intent scoping: the AI planner declares the smallest scope its plan touches (style/section/page/site) and point-and-edit carries the selected block id; the server drops any planned change outside that boundary before apply, failing open if the scope is unusable (2026-10-20).

## Upgrade wave 2026-10-21 (no spend/publish)
- [x] Fullscreen preview keeps keyboard focus inside; preview frame shows Retry after 20s or a load error.
- [x] Admin totals checked against records: 0 real customers, $0 paid, 0 outreach; 3 demo invoices correctly excluded.
- [x] Publish tab lists business facts with source (your details / missing).
- [x] Jarvis funnel summary includes builds waiting on AI capacity + soonest retry.
- [x] Guest (anonymous) sign-in turned off; leaked-password check on; security scan clean.
- [x] Last code warning fixed (demo pump hook moved to its own file); lint 0 warnings.

## Jarvis fix pass 2026-10-21
- [x] Whole app was failing to load: the new Quotes/Services pages referenced two database tables that did not exist. Tables created with the same workspace-only access rules as the other app data; build is green again.
- [x] Builds stuck "kept" forever: a failed retry never recorded when the attempt stopped, so every later retry failed the same way. The end marker is now written on that path too.
- [x] Wrong owner guidance: a build refused for thin business facts told the owner it "resumes automatically". It now says to add business details and retry; real structure problems stay retryable.
- [ ] Open: free AI providers still rate-limit/timeout under load (environmental, not a code bug); 28 generated images await owner approval (by design); no live successful end-to-end build yet.

## Database optimization 2026-10-21
- [x] Cost baseline measured: database is ~2.4 credits over 14 days (pico, 31 instance-hours); build-mode chat is ~99% of project spend.
- [x] Added composite index for analytics funnel reads (event + time); verified ~26 ms to ~2 ms with query plans.
- [x] Refreshed stale table statistics on marketing conversions, visual reports, AI usage.
- [ ] Open: scheduled jobs wake the database every 10-15 min even when idle; reducing that cadence is a freshness trade-off needing owner approval.

## Perplexity Agent research in Jarvis (2026-10-21)
- [x] research.ask proposal (approval-gated, audit-logged), citations card, reload-safe result memory; 69 tests pass, build OK; signed-in Jarvis page loads without errors.
- [ ] First real approved research call not yet exercised in chat (would spend owner's Perplexity credits; needs owner tap).

- [x] Connectors: Calendly "Book a call" on contact page; Logo.dev fallback for imported customer logos (own domain only)
- [x] Search Console: local page titles now name a third city (e.g. Huntsville); existing Search Growth panel reused instead of a duplicate card
- [x] Business Profile description replaced with truthful text
- [ ] Business Profile hours: waiting on owner's real reply hours
- [x] Redesign phase 3 (part): serif page titles across signed-in and admin pages; checked 5 pages signed in, no errors
- [ ] Redesign: deeper restyle of signed-in cards/tables and sidebar

## Model-routing audit follow-up (2026-10-22)
- [x] Honest health labels: "not used yet" for unexercised models; static fallback marked unverified
- [x] Video tiers: same model must not imply premium quality
- [x] Builder progress shows actual per-step models from recorded usage
- [x] Reviewer diversity/bounded repair audit
- [ ] Lovable speech for Jarvis voice (only if supported) / embeddings, music, live voice labelled not integrated
- [x] Prospect/outreach admin drafts: decide router vs free-only
- [ ] Maps → fact review/edit → first build handoff, official-site enrichment, provenance
- [x] Durable build worker/cancellation audit

- [x] AI City sales pipeline strip (Found → Demo ready → Awaiting approval → Sent → Replied) with approval-gated Scout/Demo/Pitch missions
- [x] AI City district inspector panel (bottom sheet on phone, side panel on desktop)

## Website Factory finish rate (2026-10-27)
- [x] Unsaved picture repaired per section instead of failing the site
- [x] Reviewer notes that clear themselves ("Not a violation") count as advice
- [x] September design-setting spellings confirmed tolerated
- [ ] Signup brief carry-through audit (homepage → builder)
- [ ] Completeness + craft score gate (≥8) with one improvement round
- [ ] Approved paid test builds for 2–3 business types (needs owner approval)

## Primitive inventory (2026-10-28)
Counted from the code, not from audits.
- **Composition primitives (30):** stack, grid, row, text, heading, media, button, link, card, list, divider, spacer, icon, tabs, toggle, accordion, compare, marquee, gallery, quote, widget, before_after_slider (slider or `revealMode: "brush"`), faq_accordion, tab_group, mobile_sticky_bar, scene, scroll_chapters, offer_card, spin_viewer, collection_row.
- **Working widgets (7):** booking_form, quote_calculator, enquiry_form, contact_details, direct_contact, service_menu, review_wall.
- **Custom blocks (15):** calculator, quiz, comparison, checklist, steps, tabs, metrics, accordion, timeline, filter, eligibility, booking, gauge (static progress strip), selector (chips + readout, owner figures only), freeform (validated free-form tree).
- **Home-page gate:** `design-quality.ts` flags `page_missing_interactive` when the home page has none of the INTERACTIVE_PRIMITIVES. Custom blocks do not count towards it.
- **Claimed gaps that already exist:** `interactive_reveal` = brush mode; `gauge_selector` = `selector`; `treatment_timeline` = custom `timeline`; reservation picker = custom `booking` (services × times, no invented availability); menu drawer = `service_menu` + custom `filter`; provider cards = `card` composition; video backdrop = `scene` media.
- **Real gaps, none buildable without owner data or third parties:** service-area map (needs a map provider, privacy review), verified-badge strip (needs owner-supplied credentials, never invented), live availability (needs a calendar connection).
- **Unproven:** which primitives Sol actually chooses per trade. Needs one live build.

## Lens, pinned story, review filter (2026-10-28)
- [x] `lens_magnifier`: loupe over one real photo (mediaRef only; generated/stock shows nothing); hover, arrow keys, "Magnify on touch" switch
- [x] `sticky_split_story`: pinned picture beside 2-6 scrolling phases; sticky on wide screens only
- [x] Review wall rating filter (All / 5 stars / 4 stars & up), only when it changes what is shown
- [ ] `model_3d_viewer`: not built. Owners have no way to upload a .glb (media is pictures only) and no business has supplied one; build the upload path first. three/R3F are already dependencies (admin AI City only).
- Not built on purpose: live booking ticker (invented social proof), soundboard, thermal overlay (invented findings), gravity badges.
- [x] `service_tier_fader`: slider cross-fading 2-4 offer cards (prices only from the Services tool); every package listed without JavaScript
- [x] `selector` gains `display: "dial"` (round gauge instead of a bar)
- [x] `scene` `scrub: true`: a video backdrop's playhead follows the scroll while the scene stays pinned (~3 screens); never plays, no sound; first frame without JS or for reduced motion; not allowed inside scroll_chapters. Replaces the frame-sequence idea: owners upload one short video, no frames needed.
