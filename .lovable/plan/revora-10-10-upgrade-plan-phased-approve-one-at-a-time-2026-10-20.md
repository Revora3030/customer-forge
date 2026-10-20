# Revora 10/10 Upgrade Plan (phased, approve one at a time)

## 1. Audit: what exists vs what is missing

Evidence comes from file reads and searches this turn. "Exists" means the code is there. It does not prove the feature works live.

### A. AI builder
| Area | Exists | Missing / weak |
|---|---|---|
| Conversational edits + request-ID progress | `builder-requests.hooks.ts`, `site-engine-request-id.test.ts`, `site-engine.hooks.ts`, builder chat in `routes/_authenticated/app.website.tsx` | Edits are not shown as a small reviewed diff before they apply |
| Undo / history | `builder-history.ts`, `version-snapshot.ts`, `version-restore.test.ts`, `backup.server.ts` | No visual before/after compare between versions; redo is partial |
| Point-and-edit | `builder/inline-edit.functions.ts`, `builder/preview-bridge.ts`, `components/site/PreviewSelectBridge.tsx`, `BuilderCanvas.tsx`, `direct-manipulation.test.ts` | Image swap and "ask AI about this section" from the selected element are incomplete |
| Art direction / responsive QA | AI-authored motion/layout (roadmap phases 3–4), 5-width visual review, "Fix with AI" | 2560 width not in the review set (it checks 320/390/768/1024/1440); no Core Web Vitals budget on generated sites |
| Truth / provenance | `site-import.ts`, truth safeguards, `content-completeness` | No per-fact "where this came from" record shown to the owner |
| Resilient builds | Stage checkpoints (`job-stage-checkpoints.ts`, `first-build-section-checkpoints`), circuit skips in `hall-of-fame.server.ts`, layout-rescue rounds | Builds still fail at 18% (concept) and 74% (layouts) when free providers throttle; the owner sees no "waiting for AI capacity, resumes at HH:MM" (no `resumes_at` field found) |
| Launch | `site-head.ts` LocalBusiness schema, `tenant-sitemap`, `launch-review`, `app.launch.tsx`, `app.domain.tsx`, quotes/booking libs | No single pre-publish checklist joining forms→CRM, call bar, domain/SSL and analytics |
| Images | `stock-photos.functions.ts`, `image-studio`, `image-records`, `media/image-edit-state.ts`, alt text | AI images are not consistently labelled "illustration" or blocked from proof-of-work sections |

### B. Jarvis
| Area | Exists | Missing |
|---|---|---|
| Visibility | `jarvis-diagnostic-tools.server.ts`, `jarvis-diagnostic-engine`, `jarvis-capability-scorecard.ts`, admin AI/monitoring pages | No single funnel view (Discovered → Converted) by state; MRR is not in Jarvis context |
| Actions + approval | `jarvis-actions.ts` with `JARVIS_ACTION_CLASSES`, `jarvis-tool-registry.ts`, demo builds, send queue | Approvals are not durable (roadmap open item); no GitHub PR action |
| Daily brief | none found | "Engine today" brief + dashboard card |
| 48h engagement follow-up | Follow-up logic exists only for replies (`prospect-replies.server.ts`); views are tracked in `preview-telemetry` | View-based single follow-up |
| Voice / page context | ElevenLabs config, admin Jarvis page | Page-aware context passing; "why it failed / what happens next" explanations |

### C. Platform
Marketing pages, consent, mobile drawers and private metadata were upgraded in recent waves. Still open: authenticated journey evidence (blank/timeout loads), an end-to-end test of the claim → signup → checkout flow, onboarding time-to-first-value, and CRM polish. City/industry pages exist (`seo-growth`, `guides.ts`), but their content still needs a truth review.

## 2. Phases (ordered by impact on revenue, conversion and build reliability)

### Phase 1 — Builds that never stall silently (recommended first)
- **Goal:** A build always ends one of three ways: completed, resumable with a visible resume time, or failed with a clear reason and next step. It never sits at 18% or 74% with no explanation.
- **Files:**
  - `site-engine.worker.server.ts`, `builder/collective-first-build*`, `first-build-compositions.server.ts`, `ai/router.server.ts`, `ai/durable-health*`, `hall-of-fame.server.ts`: compute capacity windows from provider reset and Retry-After data.
  - Concept and section-layout stages: AI-only rescue that splits work into smaller per-section requests with exponential backoff across the healthy pool (no deterministic fallback).
  - Job states `waiting_capacity` with `resumes_at`; the cron re-queues jobs when they are due.
  - UI: `BuilderPreview.tsx`, Jarvis build card, `site-engine.hooks.ts`.
- **Migration (additive):** `generation_jobs` gets `resumes_at timestamptz`, `wait_reason text` and an index on `(status, resumes_at)`.
- **Tests:** compute the capacity window from mocked 429/Retry-After; a job parks and then resumes from checkpoints; layout batching; stale-attempt fencing kept; router isolation helper used.
- **Risks:** more retries could add paid spend. The paid daily cap stays enforced in `spend-scope`, and free providers are tried first.
- **Verify:** offline lifecycle test, then one live build only with your approval. The daily site cap stays at 5 and goes to 20 only after a full build succeeds.

### Phase 2 — Claim → signup → checkout conversion path
- **Goal:** A prospect who opens a demo can claim it, sign up and reach the existing Stripe checkout with no dead ends.
- **Files:** `prospect-claim*`, `demo-launch-gate.server.ts`, the `p.$token*` routes, the signup/onboarding routes, `app.billing.tsx`. Prices and products stay unchanged.
- **Migration:** none expected.
- **Tests:** claim token through workspace link (tenant scoped), idempotent claim, expired or revoked token, checkout session created with the existing price IDs (mocked Stripe).
- **Verify:** browser run on a test demo up to the Stripe sandbox page, without paying.

### Phase 3 — Engine Today brief + 48h engagement follow-up
- **Goal:** Funnel counts by state, a Jarvis daily brief and a dashboard card. One follow-up goes out when a preview was viewed at least twice, was not claimed, and 48h have passed.
- **Files:**
  - New `lib/engine-funnel.ts` (pure aggregation) plus a server function.
  - Follow-up queueing through `prospect-send-queue.server.ts` with every gate: do-not-contact, unsubscribe, footer, autopilot switch, daily cap.
  - Cron in the existing autopilot route; card in `admin.outreach.tsx` / `admin.jarvis.tsx`; Jarvis tool registry entry (read class).
- **Migration:** `prospect_followups` (prospect_id unique, reason, queued_at) with RLS for super_admin only, plus grants.
- **Tests:** funnel math; follow-up eligibility (exactly one, blocked by do-not-contact, opt-out, claimed or quiet hours); no duplicate on cron rerun.

### Phase 4 — Durable Jarvis approvals and full operator visibility
- **Goal:** Risky Jarvis actions need a stored, single-use approval tied to the exact action payload. Jarvis can see health, the provider pool, builds, MRR (read from existing billing tables) and site scores. Failure explanations say what happened and what comes next.
- **Files:** `jarvis-actions.ts`, `jarvis-agent.server.ts`, `jarvis.functions.ts`, `components/app/jarvis/*`. Page-aware context is passed from the current route. Admin Jarvis stays on the shared conversation helper and router.
- **Migration:** `jarvis_approvals` (payload hash, actor, expires_at, consumed_at), super_admin RLS.
- **Tests:** replayed or altered payload rejected; expired approval rejected; read actions need no approval.
- **GitHub PR action:** added only if a GitHub connection exists. Otherwise it is reported as blocked.

### Phase 5 — Reviewed edits, visual compare, point-and-edit completion
- **Goal:** Each chat edit shows a section-level diff with Apply / Undo, plus redo. History shows side-by-side screenshots of two versions. Selecting an element allows image swap and "ask AI about this section".
- **Files:** `builder-history.ts`, `version-snapshot.ts`, `inline-edit.functions.ts`, `preview-bridge.ts`, `PreviewSelectBridge.tsx`, `BuilderCanvas.tsx`, builder chat.
- **Migration:** a nullable `screenshot_path` column on the existing version table, if it is missing.
- **Tests:** diff computation, undo/redo stack, tenant check on inline edits, request ID carried through scoped edits.

### Phase 6 — Truth provenance, image honesty, launch checklist
- **Goal:**
  - Every fact keeps its source (Google listing, imported site, owner entry).
  - AI images are labelled illustrations and blocked from gallery or proof sections.
  - One pre-publish checklist: SEO/schema, forms→CRM test submit, call bar, booking/quote, analytics, domain + SSL.
  - Visual review adds the 2560 width and a performance budget.
- **Files:** `site-import.ts`, `content-completeness`, `launch-review`, `image-records`, `first-build-images.server.ts`, `app.launch.tsx`.
- **Migration:** a `fact_sources jsonb` column on site content (additive).
- **Tests:** provenance kept through edits; illustration blocked from proof sections; checklist blocks publish only on real failures.

### Phase 7 — Platform polish
- **Goal:**
  - Authenticated journey audit, fixing the blank/timeout loads.
  - Onboarding reaches a first preview in minutes.
  - CRM empty/error states.
  - Truth review of city/industry pages.
  - Accessibility and performance passes.
- **Tests:** onboarding, quote/booking and CRM regression tests; the existing consent and head tests stay green.

## 3. Recommendation and what I need from you
- **Start with Phase 1:** stalled builds block every demo, outreach send and conversion.
- **I need from you:**
  1. Approval to spend AI budget on one live verification build after Phase 1 (within the existing $5/day paid cap, free pool first).
  2. One real business's details for the second-industry build.
  3. For Phase 2: confirm the canonical offer. Code and the database say $350 setup plus a 3-day trial; your brief and older notes say $750. I will not change anything without your word.
  4. For Phase 4: whether a GitHub connection should be added for Jarvis PRs.
- **No new secrets are needed** for Phases 1–3.

## Technical notes
- Every phase: additive migrations with GRANT → RLS → policies; `tsgo`, eslint and vitest stay green; live integration tests stay disabled unless explicitly selected.
- No deterministic creative templates or fallback copy. Outreach compliance gates and the launch quality gate are untouched or tightened only.
