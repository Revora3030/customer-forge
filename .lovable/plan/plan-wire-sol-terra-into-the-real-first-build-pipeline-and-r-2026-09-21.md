# Plan: Wire Sol/Terra into the real first-build pipeline and run a fresh visual build

## Goal
Make the first-build path use the full creative pipeline, not just image generation:

```text
business facts
→ Sol creative strategy
→ deterministic safety + fingerprint
→ screenshot reference fingerprint when supplied
→ page architecture + copy + image briefs
→ image generation/selection
→ image-aware layout
→ materialized pages
→ 320–1440 visual QA
→ Terra critique/repair plan
→ rerender + final evidence
```

## What I confirmed from the code
- The queued first-build worker already creates deterministic strategy, copy, a creative brief, generated image slots, and then writes real page/section/component rows.
- The paid Sol/Terra/Luna collective currently refines first-build wording and metadata; Sol is not yet shaping the full creative direction before page materialization.
- The builder already has a large deterministic design fingerprint and section-design mapping that can be extended rather than replaced.
- Screenshot review exists for visual page review, but reference screenshots are not yet converted into a reusable design fingerprint for future builds.
- The visual QA script already covers 320, 375, 390, 414, 768, 1024, 1280, and 1440 widths.
- The current materializer intentionally skips workspaces that already have pages, so your fresh first-build needs an explicit, protected rebuild path with a restore point.

## Implementation
1. **Add Sol Creative Direction as a first-class stage**
   - Add a server-only Sol pass before page structure/copy/materialization.
   - Have Sol return a strict, bounded creative direction object: archetype, personality, typography, palette, spacing/grid, hero composition, section rhythm, card/button/background/motion language, mobile strategy, conversion strategy, and image language.
   - Validate the Sol output against allowed enums and safe lengths.
   - Fall back to the deterministic native creative direction if Sol is off, blocked, over budget, malformed, or refused.

2. **Add Terra critique before content is written**
   - Add a Terra pass that reviews Sol’s creative direction against the supplied business facts, industry, conversion goal, and safety rules.
   - Terra can approve, reject fields, or request deterministic fallback for unsafe/generic parts.
   - Only approved design fields reach the builder; Terra cannot add business facts or bypass the deterministic safety gate.

3. **Make creative direction shape the whole page**
   - Feed the approved Sol/Terra creative brief into the first-build worker before `generateWebsitePlan`, image inventory, copy, and materialization.
   - Extend the materializer so the creative brief affects page order, section rhythm, hero layout, card language, CTA placement, image treatment, motion level, and mobile composition.
   - Preserve existing tenant isolation, auth, billing, versioning, publishing, domain, analytics, and fact-protection boundaries.

4. **Add screenshot reference brief support**
   - Add a reference-screenshot extractor that reads layout, hierarchy, typography, spacing, color, imagery, and interaction patterns from an uploaded screenshot.
   - Convert that into an original Revora design fingerprint, not copied branding/assets/content.
   - Store the derived reference fingerprint in the site generation metadata and merge it with business/industry strategy during future builds.
   - If screenshot interpretation is unavailable, show a clear blocker and continue with the native fingerprint.

5. **Connect image-first layout intelligence**
   - After generated or owner images are selected, analyze image signals where available and fall back to image briefs when pixels are unavailable.
   - Persist layout settings such as focal position, overlay strength, text placement, mobile crop, and safe text area on the relevant sections/components.
   - Keep generated imagery tagged as marketing visuals, never proof of real work, reviews, awards, certifications, licenses, statistics, or results.

6. **Add first-build visual QA gate and repair loop**
   - Run the real rendered draft at 320, 375, 390, 414, 768, 1024, 1280, and 1440 widths.
   - Fail the gate on critical overflow, overlap, broken imagery, unusable buttons/forms, severe crop issues, or contrast failures.
   - Feed the measured findings into a safe repair pass, re-render, and only report success after the second measurement passes.
   - Store the final evidence in the existing generation/report records.

7. **Fresh first-build on your own site**
   - Before touching your existing draft, save a restore point.
   - Run the new first-build pipeline against your real saved business content.
   - Because this replaces current draft pages, keep rollback available through version history.
   - Capture browser screenshots/results for your draft at the required viewport range.

## Tests and proof
- Add unit tests for Sol creative parsing/validation, Terra approval/rejection, screenshot-reference fingerprint extraction, creative-to-materialization mapping, image-to-layout persistence, paid budget fail-closed behavior, and fact/exact-wording protection.
- Run the relevant automated tests, type checks, lint, production build, and security audit.
- Run one scratch first-build from a fresh test workspace through the new pipeline.
- Run your own fresh first-build after the code path is proven.
- Run the 320–1440 visual QA gate on the rebuilt pages and report exact pass/fail evidence.

## Final report
I will report:
- model stages actually used for Sol and Terra
- which image models generated or edited assets
- exact QA widths tested
- test/build/security results
- whether the scratch build and your fresh build completed
- any genuine blocker, without pretending success
- preview URL and current version identifier
