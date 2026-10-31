---
name: Cinematic Creative Engine Master Build Plan & Acceptance Matrix
description: Definitive 6-phase dependency-ordered master implementation plan and acceptance-test matrix for Revora's video-grade website engine
type: reference
---

# Cinematic Creative Engine: Master Build Plan & Acceptance-Test Matrix

Architectural master plan for transforming Revora Growth Systems / Customer Forge into a video-grade, cinematic AI website builder.

## Core Invariants
1. **Zero Fake Completion**: No feature is marked complete based solely on AI assertions or HTTP 200s; verified against rendered DOM or database records.
2. **Absolute Grounded Truthfulness**: Zero invented reviews, testimonials, awards, certifications, partner badges, or fake pricing.
3. **Canonical Offer**: $350 setup, 1st month free (30-day deferred), $100/month, 3-day full-access trial; setup fee waiver strictly revorabusiness0@gmail.com.
4. **Tenant Isolation & RLS**: All mutations, views, media assets, and leads remain strictly scoped by `organization_id`.
5. **Production Publishing Safety**: Live custom-domain publishing, production releases, and financial mutations remain founder-authorized.

---

## Root Causes, Fixes, Risks & Baseline Proof

### Root Cause 1: Output Token Blowout from 4-Section Batching
- **Problem**: `BATCH = 4` in `first-build-compositions.server.ts:575` requests up to 4 complete composition trees in a single prompt. Output length regularly exceeds model limits, causing JSON parse errors and cascading failures across all 4 sections.
- **Fix**: Implement adaptive micro-batching (1 section for complex sections like hero, services, booking; max 2 for simple text/dividers).
- **Files**: `src/lib/builder/first-build-compositions.server.ts`.
- **Regression Risk**: Slight increase in number of model round-trips; mitigated by external reservation and parallel execution across pages.
- **Acceptance Criteria**: 100% of generated section trees parse valid JSON on first attempt; 0 JSON truncation errors in logs.
- **Verification**: Unit test in `first-build-compositions.test.ts` verifying batch splitting and token bounds.

### Root Cause 2: Overly Strict `requiredMediaRefs` Traps
- **Problem**: `mediaRefsFor()` in `first-build-compositions.server.ts:365` enforces that *every* attached image is required in the section layout. If Sol uses 2 out of 3 available gallery images, the validator rejects the entire layout.
- **Fix**: Distinguish `permittedMediaRefs` from `requiredMediaRefs`. Only primary hero media is strictly required; supporting gallery and content media are permitted but optional.
- **Files**: `src/lib/builder/first-build-compositions.server.ts`, `src/lib/builder/composition-tree.ts`.
- **Regression Risk**: Sections omitting all images. Mitigated by enforcing at least one media node when media parts exist for that section.
- **Acceptance Criteria**: Validator accepts trees utilizing any valid subset (>=1) of permitted media references.
- **Verification**: `src/lib/builder/composition-tree.test.ts` with partial media ref scenarios.

### Root Cause 3: Rigid `widgetPresentation` Failures
- **Problem**: Sol occasionally omits 1 of the 8 required theme colors or uses a slightly generic phrase in widget titles, causing `widgetPresentationProblem()` to fail the entire booking, quote, or contact section.
- **Fix**: Deterministic auto-repair for widget themes: inject missing theme tokens directly from the site's validated brand palette (`safeDesignTokens`) while preserving the functional widget requirement and copy validation.
- **Files**: `src/lib/builder/first-build-compositions.server.ts`, `src/lib/builder/design-tokens.ts`.
- **Regression Risk**: Incoherent widget themes. Mitigated by using the site's primary and secondary brand colors.
- **Acceptance Criteria**: Zero valid widget trees rejected due to missing theme fields; all functional widgets remain 100% operational.
- **Verification**: `src/lib/builder/composition-widget.test.ts`.

### Root Cause 4: Lease Expiry During Optional Review Rounds
- **Problem**: Optional quality rounds (`repairDesignQuality`, `improveWithTeam`) run sequentially without saving progress, causing Cloudflare worker lease timeouts and losing the base AI layout.
- **Fix**: Immediate durable checkpointing of accepted base layouts before optional rounds begin; strict per-round wall-clock timeouts that safely gracefully degrade without failing the build.
- **Files**: `src/lib/builder/first-build-compositions.server.ts`, `src/lib/site-engine.worker.server.ts`.
- **Regression Risk**: Sites shipping with base design rather than refined design if timeout occurs. Acceptable tradeoff to prevent hard failure.
- **Acceptance Criteria**: 100% of validated base layouts are persisted immediately; worker timeouts in optional rounds never fail the job.
- **Verification**: `src/lib/builder/first-build-section-checkpoints.test.ts`.

---

## The 6-Phase Dependency-Ordered Master Implementation Plan

### Phase 1: Section Composition Reliability (Immediate Foundation)
1. Refactor `first-build-compositions.server.ts` to use adaptive micro-batches (1-2 sections).
2. Update `composition-tree.ts` validation to decouple permitted media from required media.
3. Add deterministic widget theme auto-filling from site brand tokens.
4. Run unit and integration tests across section composition and checkpointing.

### Phase 2: Adaptive Checkpointing & Durable Recovery
1. Enforce atomic database save points after each accepted section tree.
2. Bound optional review rounds with explicit wall-clock timeouts (`LAYOUT_OPTIONAL_BUDGET_MS`).
3. Implement automatic resumption from existing checkpoints on job retries.
4. Verify edge worker lease renewal during long multi-page site builds.

### Phase 3: Customer-Specific Creative Direction Engine
1. Introduce pre-code Creative Brief generator in `collective-first-build.server.ts`.
2. Jarvis generates 2–3 competing visual concepts (e.g. Cinematic Product Showcase vs. Luxury Editorial vs. Minimalist High-Conversion) tailored to the specific business and industry.
3. Score and select the optimal concept with explicit rationale based on target audience and conversion goals.
4. Propagate selected art direction (typography pairings, density, lighting cues, motion intensity) into the composition pipeline.

### Phase 4: Extended Visual Primitives (3D, Animation & React Bits)
1. Extend `CompositionRenderer.tsx` and `composition-tree.ts` with new optional primitives:
   - `kinetic_text`: Shader and split-text reveals (React Bits patterns).
   - `ambient_canvas`: Lightweight shader backdrops for dark cinematic moments.
   - `interactive_3d`: Three.js / React Three Fiber v9 canvas for hero showcases (lazy-loaded behind `<ClientOnly>`).
2. Integrate Motion (Framer) and GSAP scroll-triggered timelines.
3. Enforce strict `prefers-reduced-motion` and GPU-safe static fallbacks for low-power mobile devices.

### Phase 5: Rendered DOM Visual & Functional Quality Gate
1. Automate Playwright headless browser rendering across 320px, 390px, 768px, and 1280px viewports.
2. Capture full-viewport and component screenshots for automated visual QA.
3. Terra visual review: compare rendered screenshots against the authored Creative Brief.
4. Automated audits: Core Web Vitals (LCP <= 2.5s, INP < 200ms, CLS < 0.1) and WCAG 2.2 AA contrast checks.

### Phase 6: Iterative Defect Repair Loop
1. Terra emits precise, machine-executable revision directives for detected visual or structural defects.
2. Sol performs targeted micro-edits on failing nodes rather than regenerating entire pages.
3. Re-verify rendered DOM with Playwright to prove defect resolution before marking site complete.

---

## Acceptance-Test Matrix

| Phase | Test Suite / Command | Verification Criteria | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `bunx vitest run src/lib/builder/first-build-compositions.test.ts` | Micro-batching, mediaRef decoupling, widget auto-repair | 100% pass, zero unhandled errors |
| **Phase 2** | `bunx vitest run src/lib/builder/first-build-section-checkpoints.test.ts` | Resumption from checkpoints, lease renewal | Verified checkpoint recovery across simulated retries |
| **Phase 3** | `bunx vitest run src/lib/builder/collective-first-build.test.ts` | 3 competing concepts generated, trade rationale evaluated | Selected brief matches industry archetype |
| **Phase 4** | `bunx vitest run src/lib/builder/composition-primitives.test.ts` | New primitives render cleanly, `<ClientOnly>` respected | Safe SSR fallback, zero hydration mismatches |
| **Phase 5** | `bun run scripts/browser-journey.mjs` | Multi-viewport rendering, booking/quote form tests | Clean DOM capture, zero console errors, valid forms |
| **Phase 6** | `bunx vitest run src/lib/builder/chrome-repair.test.ts` | Targeted defect repair on failing nodes | Successful patch apply, re-test passes |
