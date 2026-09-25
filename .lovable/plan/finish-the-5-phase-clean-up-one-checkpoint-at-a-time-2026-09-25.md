# Finish the 5-phase clean-up, one checkpoint at a time

This directive covers the same ground as the last two. Much of it is already done: the AI-only first build, no automatic buttons or cards, the reviewer team, visual checks tied to a revision, and publish gates. This plan covers only the work still open. Each phase ends with passing tests and a short written report, so nothing is claimed without proof.

## Phase 1 — Find every place the code still makes design choices
- Trace every build, edit, redesign and repair path. List each place where code (not the AI) still picks a layout, order, heading, button, image look, animation or effect.
- Known item: the site-wide review can replace an empty main headline with the business name. It should only report that finding, not write the text.
- Sort each item into one of three groups: delete it, keep it only for old sites, or keep it because it protects safety, security or accessibility.
- Add tests that fail if any deleted rule comes back.

## Phase 2 — Make sure the AI's design reaches the browser unchanged
- Build a full check with a section type the AI invented: plan → layout → saved site → rendered page. The section must survive with nothing swapped in.
- Remove any leftover step that quietly cuts AI content down. Where a real size or safety limit is hit, send the AI a clear reason so it can redesign instead of losing content.

## Phase 3 — Give the AI more design freedom, safely
- Let the AI describe its own effects and motion (layering, positioning, grid areas, transforms, masks, gradients, filters, springs and staggered reveals, per-screen overrides) through a safe, checked vocabulary. No raw code.
- Keep the existing presets only as optional shortcuts.
- Reduced-motion support, content cleaning and performance limits stay.

## Phase 4 — Close the look-and-fix loop
- For every page at 320, 390, 768, 1024 and 1440 pixels wide: render the page, take screenshots, measure problems, then Sol critiques and Terra reviews against the real screenshots.
- Apply repairs, render again, compare with the previous round, and repeat until the site meets the quality bar or stops with an honest reason.
- Publishing accepts only evidence from the exact revision being published.

## Phase 5 — Proof and safety
- Check that editing, redesign and repair can use every design feature the first build can.
- Audit jobs: stable duplicate protection, no stale worker overwriting newer work, and cleanup limited to the exact job.
- Add automatic clean-up of old records so they can't pile up forever.
- Run a fresh security scan and database check, plus a review of billing and publishing.
- Run all tests, type checks and the build.

## Needs you
- **Second-industry proof site:** needs one real business's name, services, contact details and hours. The AI will not invent them.
- **Revora site going live:** waits on Stripe confirming the $750 setup payment.
- **AI spending:** live builds and screenshot reviews count against the $100 monthly AI allowance.

## Technical details
- Relevant files: builder/whole-repo-upgrade.ts, site-materialize.server.ts, the composition renderer and validator, site-effects.ts, visual-composition.ts, verify.server.ts, qa-loop.server.ts, and site-engine.worker.server.ts.
- Before the retention work, confirm whether ai_operation_claims exists; no migration mentions it yet. If it doesn't exist, the audit applies to the existing claim or lock mechanism instead.
- Reachability audit: search the whole repo for fingerprint, archetype, anatomy and fallback terms, and map every import that reaches build or edit entry points.
