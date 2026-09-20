# Revora / Customer Forge — read-only improvement audit

Audit of the current code as it stands. Nothing was changed. Every finding below was confirmed by reading the actual files, not inferred.

## The headline finding

The full autonomous loop you designed — understand, plan, apply, QA in a browser-style pass, auto-repair, re-test, report — exists in code but **is not connected to the builder your customers use**.

Evidence: the live request path is `src/lib/site-agent.functions.ts` → `buildAutonomousPlan` (`src/lib/builder/deterministic.ts`) → `src/lib/builder/apply-plan.ts` → `verifyWorkspaceSite`. The QA/repair/re-test modules (`qa-auto-repair.ts`, `qa-retest-loop.ts`, `autonomous-builder-intelligence.ts`, `autonomous-verification.ts`) are imported **only** by `src/lib/builder/master-engine.ts`, and `master-engine.ts` is imported by nothing except its own tests. So findings are detected in tests, never in production, and nothing is auto-repaired or re-tested after a real edit.

A scan for builder modules that no shipped file imports found 19, roughly 4,000 lines, including `master-engine.ts` (1,998 lines), `visual-intelligence.ts` (858), `launch-quality-gate.ts`, `prepublish-checklist.ts`, `cross-page-consistency.ts`, `reversible-change-set.ts`, `outcome-evidence.ts`, `improvement-history.ts`, `conversion-blueprint.ts`, `experience-audit.ts`, `visual-director.ts`, `asset-intelligence.ts`, `autonomous-loop.ts`, `quality-improvement-plan.ts`, `intelligence-profile.ts`, `launch-quality-signals.ts`, `prompt-site-blueprint.ts`, `actionable-recommendations.ts`, `context-target.ts`. The tests pass, so this is invisible from the suite.

## Findings

### 1. Autonomous QA and repair are unreachable — CRITICAL
Area: `src/lib/site-agent.functions.ts`, `src/lib/builder/master-engine.ts`, `qa-auto-repair.ts`, `qa-retest-loop.ts`.
Why it matters: the product's core promise (it checks its own work and fixes what it broke) is not running. Deterministic-safe: yes — the repairs `qa-auto-repair.ts` emits are already restricted to source-derived actions with ambiguous findings left as findings. Fix: after a successful apply, run the browser-style QA pass, convert safe findings to actions, apply them through the same `apply-plan.ts` pipeline with its own operation keys and rollback, re-run QA, and report both passes in the reply. Evidence needed: an integration test asserting a seeded broken link/missing alt/missing SEO title is repaired and the second pass is clean, plus one asserting an unsafe finding is reported and not "fixed". Priority 1.

### 2. Retire or wire the 19 orphan modules — HIGH
Why it matters: 4k lines of tested-but-dead code make the system look more capable than it is and make every future change ambiguous ("is this the live path?"). Deterministic-safe: yes. Fix: for each, either wire it into the live path (start with `launch-quality-gate`, `prepublish-checklist`, `cross-page-consistency`, `reversible-change-set`, `outcome-evidence`) or delete it with its tests. Evidence: a repository test that fails when a `src/lib/builder` module is imported only by tests. Priority 2.

### 3. Exact-wording directives are wired, but only on one branch — MEDIUM
`readLiteralDirectives` is genuinely called in production (`deterministic.ts:682`), highest priority, before other passes — this one checks out. Gap: it runs inside `buildAutonomousPlan` only; the whole-site upgrade branch (`site-upgrade.ts`) can rewrite hero headings in the same request. Deterministic-safe: yes. Fix: pass the literal targets into `planWholeSiteUpgrade` as a do-not-touch set. Evidence: a test where "change the headline to X" plus "upgrade the site" keeps X verbatim. Priority 3.

### 4. Quality score integrity is largely sound — LOW, with one gap
Confirmed good: `quality.server.ts` re-grades from raw stored measurements, treats a report older than the newest content edit as stale, and requires per-page evidence (`freshSiteVisualReport`); `production.functions.ts` blocks launch unless `productionReady` (content + measured 95+). `runtimeClean` is explicitly evidence-gated. Gap: the real-browser measurement is only produced when a person opens `VisualCheckPanel.tsx` and clicks — so the gate's usual state is "not measured yet", which reads as a builder failure to the owner. Fix: trigger the measurement automatically after an apply and before the launch check, with the manual run kept as a retry. Evidence: test that an apply invalidates the stored report and schedules a fresh one. Priority 4.

### 5. Free-AI routing state is per-isolate — HIGH for correctness of the caps
Area: `src/lib/ai/free.ts` (daily budget Map), `router.server.ts` (circuit breaker Map, in-flight concurrency Map), `cache.server.ts` (result cache and dedupe Maps). On Cloudflare each isolate has its own copy, so the daily free caps, the breaker cooldown, per-workspace concurrency and the cache are all enforced per instance, not globally — with six providers this can silently exceed a provider's free allowance and keeps calling a provider another isolate already parked. Deterministic-safe: yes. Fix: back budget counters, breaker state and the response cache with a small backend table (or Durable-Object-style single writer), keeping the in-memory maps as a fast path. Evidence: tests for cross-instance counting and a stale-day reset; admin page shows shared counts. Priority 2.

Also in this area, all verified-correct and worth keeping: free-only default ON (`freeAiOnly`), paid names rejected per provider, live model discovery re-checked against `isFreeEligibleModel`, malformed structured output failing over to the next free provider, and last-outcome reporting without key material.

### 6. Free AI is gated off by default for the builder — HIGH, config not code
`zeroAiCostMode()` defaults ON and `builderExternalAiAllowed()` defaults off, so unless `ZERO_AI_COST_MODE=false` **and** `BUILDER_EXTERNAL_AI_ALLOWED=true` are set on the server, none of the six live free providers can be used by the builder. The verification run reported availability true, so they appear set in this environment — but nothing tests it, and a future environment will silently fall back to deterministic-only. Fix: surface this on the admin AI page as an explicit "builder may use free AI: yes/no, because…" line, and add a startup self-check. Priority 3.

### 7. AI entry points — no bypasses found
Confirmed: no direct provider URL fetches outside `src/lib/ai/providers`; the only callers of the router are `site-agent.server.ts`, `site-engine.server.ts`, `image-studio.server.ts`, `tools.server.ts` and `health.functions.ts`, and a regression test already enforces that. Gap: `streamResponse` exists in the router but no builder path uses it, so long generations give the owner no progressive output. Priority 5.

### 8. Generated-website quality — MEDIUM
The upgrade passes are strong (industry playbooks, variants, SEO/alt/composition passes) but `cross-page-consistency.ts` is orphaned, so nothing checks that pages agree on tone, CTA wording, nav or theme after a multi-page upgrade. Deterministic-safe: yes. Fix: run it as a post-apply pass feeding the same safe-repair channel as finding 1. Evidence: a test over a 5-page site with a deliberately inconsistent CTA. Priority 3.

### 9. Safety and reversibility — mostly strong, one gap
Confirmed: operation keys, stale-plan rebase, rollback on fatal, action caps, guarded production activation, tenant-host separation, the `isRevoraOnlyPath` guard. Gap: `reversible-change-set.ts` is orphaned, and the owner sees no preview of what will change before a destructive plan runs beyond the "Build it" confirmation. Fix: render a change preview from the plan (page/section/field level) before apply. Priority 4.

### 10. Observability — MEDIUM
Per-attempt AI telemetry exists, but QA findings, repair outcomes and re-test results have nowhere to be stored (the loop isn't running), so there is no trend of "what the builder breaks and fixes". Fix: persist one row per build attempt with findings, repairs, re-test verdict and provider used; add it to the admin analytics page beside the drop-off funnel. Priority 4.

### 11. Tests — the suite is large but misses the wiring
896 tests pass, yet none would fail if the whole QA/repair loop were deleted. Missing: an end-to-end test from natural-language request to persisted rows to QA verdict; a test that each `src/lib/builder` module is reachable from a shipped entry point; a browser test (Playwright) that a generated site renders, has no console errors, and submits its contact form; a cross-instance free-budget test. Priority 2.

### 12. Builder UX — MEDIUM
Today the owner gets a reply and a summary. With the loop connected, show the three phases (planned, applied, checked and repaired) with per-item outcomes, the measured score, and one clear retry action when a phase fails. Priority 3.

## Top 10, in order

1. Connect the QA → safe auto-repair → re-test loop to the live apply path and report it.
2. Make free-AI budgets, breaker state and cache shared across instances instead of per isolate.
3. Add the wiring tests (end-to-end request→rows→QA, no-orphan-module rule, browser render/console/form test).
4. Retire or wire the 19 orphan builder modules, starting with the launch gate, prepublish checklist and cross-page consistency.
5. Run the real-browser measurement automatically after each apply so the launch gate is normally already measured.
6. Protect exact-wording directives from the whole-site upgrade pass in the same request.
7. Persist per-build QA/repair/re-test evidence and show it in admin analytics.
8. Show a change preview before destructive plans, using the existing reversible change-set model.
9. Surface on the admin AI page whether the builder is actually allowed to use free AI, and why.
10. Stream long generations to the builder UI using the router's existing streaming support.

**The single biggest next upgrade: item 1** — connecting the autonomous QA, safe repair and re-test loop to the live builder path. Everything else improves a system that currently cannot check its own work.

## Technical notes

- Live path: `site-agent.functions.ts` (`planImpl`/`applyImpl`) → `builder/deterministic.ts` (`buildAutonomousPlan`, literal directives first, whole-site branch delegating to `builder/site-upgrade.ts`) → `builder/apply-plan.ts` → `agent/verify.server.ts`.
- Unreachable path: `builder/master-engine.ts` → `autonomous-builder-intelligence.ts` → `browser-qa-intelligence.ts` / `qa-retest-loop.ts` / `qa-auto-repair.ts` / `autonomous-verification.ts`.
- Free-AI layer: `ai/router.server.ts` (chain build, breaker, concurrency, last-outcome), `ai/free.ts` (provider list, eligibility, budgets), `ai/free-models.server.ts` (live discovery), `ai/providers/*`, `ai/cache.server.ts`, `ai/availability.ts`, `routes/_authenticated/admin.ai.tsx`.
- Quality/evidence: `builder/quality.server.ts` (freshness + per-page evidence), `builder/visual.ts` (`gradeVisual`/`gradeSite`), `visual-check.functions.ts` (server-side re-grade of client measurements), `production.functions.ts` (launch checks).
