# Continue Part 1 blockers, then the builder upgrade

## Current result
Targeted repairs are in the preview; 79 tests across 13 files passed. Signed-in client detail and Jarvis, server-rendered sign-in, mobile overflow and pre-consent Google-tag suppression were checked. Nothing was published, deleted, billed or sent. Pricing, Stripe settings, auth providers and RLS policies are unchanged.

## Phase A — finish the remaining Part 1 blockers
1. **Permanent www redirect:** hosting currently returns 302 before application code. The apex HTTP redirect already returns 301. Preserve the primary domain; do not change DNS or claim an app patch fixes the upstream response. Hosting must expose or apply a 301/308 redirect.
2. **Correct site identity:** the two Elite slugs belong to different organizations. Keep them separate. Use the existing gated publishing path for the real draft only with founder approval; add historical aliases only after verifying a genuinely old, unoccupied slug and its organization.
3. **Demo deduplication:** propose an additive owner-and-source-identity reservation with atomic provisioning. Preserve organization-scoped access; present exact schema/policy changes before applying. Produce a duplicate-reference dry run; founder selects survivors before any cleanup. Do not merge on name alone.
4. **Payment lifecycle:** add fault-injection tests for webhook claim, processing, settlement and release. Repair proven bookkeeping failures without altering prices, Stripe products, webhook configuration or entitlements. Real checkout/confirmation requires separate authorization.
5. **Live evidence:** inspect missing historical demo jobs, reported React stacks and published performance. A retry/build or deployment requires founder approval. Never erase historical failed jobs to make health appear successful.

## Phase B — builder audit and creative-direction continuity
- Compare the current saved Elite draft against uploaded references at phone and desktop widths; inspect each page, FAQ, service selection, contact evidence, imagery and navigation.
- Trace the saved brief through analysis, identity, architecture, wording, imagery, composition and QA. Preserve buyer strategy and neighboring-section context in single-section calls.
- Strengthen original AI-authored identity and composition, not fixed trade templates, forced dark themes or mandatory widget counts.
- Preserve existing forms/primitives, price provenance, owner-photo-only before/after proof and truthful contact use.

## Phase C — measured craft and performance
- Extend existing QA with explicit missing-evidence states, first-screen headline checks, image/anchor/content checks and accessibility measurements.
- Evaluate the requested 8/10 benchmark only with actual rendered evidence and a disclosed rubric. Never equate structural validity with reference-quality output.
- Reuse existing motion, gallery, quote and cinematic primitives before adding anything new. Keep reduced-motion/static fallbacks and private/public gates.

## Phase D — approved proof build
- Only after approval, run one real build with verified business facts and owner media.
- Measure saved output, every page, forms, navigation, mobile overlap, runtime errors, latency and spend.
- Report failures and missing checks explicitly; do not auto-publish or initiate outreach.

## Technical boundaries
- TanStack Start, React and Workers-safe runtime; no new paid provider or dependency.
- Lovable-only model rosters and existing Luna/daily budgets remain authoritative.
- Preserve job/input-matched checkpoints, bounded section concurrency, attempt fences and sole-AI creative authority; no deterministic template fallback.
- Keep `publishSiteNow` as the sole publishing path; no generated-file edits or manual Git operations.
- Existing implementation map and all 15 item statuses are documented in `docs/part1-error-fixes.md`.

## Acceptance and approval
Approve this continuation plan before the uploaded builder brief's next implementation phase. Migration/RLS changes, duplicate cleanup, real payments, paid builds, publishing and outbound messages remain individually disclosed/approved actions.