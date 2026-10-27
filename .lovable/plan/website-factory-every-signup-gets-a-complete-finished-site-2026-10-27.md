# Website Factory: every signup gets a complete, finished site

## What the records show today
- Only **5 of 25** website builds ever finished. In the last 30 days, **0 finished**: 2 failed and 3 were cancelled.
- The 22 Oct build failed at the last check. A section pointed at a picture that was never saved, so the site was blocked even though everything else was done.
- The other 22 Oct build failed at page planning. Terra (the reviewer) rejected Sol's plan, yet her own note said "Not a violation". It was a false rejection that stopped the whole build.
- The September failures were Sol using design settings the page renderer doesn't support. Examples: font settings in the menu, padding written the wrong way, image shapes not written as "16:9".

So the first problem isn't looks. Sites aren't finishing at all. A 10/10 site has to be finished first, then excellent.

## Phase 1: builds finish
1. **Pictures:** before the final check, every picture a section uses must be saved. If one is missing, regenerate or re-pick that one picture (up to two tries). If that fails, swap the section to a matching layout with no picture, and log it for review. One picture should never block a whole site.
2. **Reviewer:** Terra's rejections must name a real rule that was broken. A note that says "not a violation", or names nothing, counts as a pass with advice. Real rejections send Sol back once with the exact problem, instead of failing the build.
3. **Design settings:** Sol is told exactly which settings the renderer accepts. Small spelling mistakes (padding as "24px", "16/9", font settings in the menu) are cleaned automatically before checking. Anything still unknown is removed with a note, not failed.
4. **Resume, not restart:** cut-off builds already save their progress. Make sure every failure above resumes from the saved step, not from zero.

## Phase 2: signups from your homepage and pages get the best brief
5. Whatever a visitor types or picks during signup (business, services, location, style, goals) goes straight into the saved brief Sol starts from. Nothing is lost between your homepage and the builder.
6. If something important is missing, the builder asks one short question. For example: "What are your top 3 services?" or "Do you have photos?" It never makes facts up.

## Phase 3: 10/10 quality bar before a site counts as done
7. A **completeness check** runs on every page: a real opening section with a photo or visual (no text-only opening), services from the brief, a working contact or quote form, a clear call to action, menu and footer links that work, and phone layout with no overflow.
8. A **craft score** compares the site with your reference-quality standard (CarVault, Vice Key, Regent level). Below 8, Sol gets one improvement round on the weakest sections. The score and any gaps are shown to you, never hidden.
9. **Facts:** no invented reviews, awards, prices or results. This stays enforced.

## Phase 4: prove it
10. Run real test builds for 2–3 different business types. This uses AI credits. I'll ask before each run, with a cost estimate.
11. Open each finished site at phone and desktop sizes and record what passed or failed. Show the finish rate in your admin and in AI City's Website Factory.

## Safeguards (unchanged)
Nothing is published to a customer's live site without the existing publish checks. The daily limit of 5 sites, the monthly AI spend cap and the $350 / $100 offer all stay as they are.

## Technical details
- Picture coverage: `first-build-saved-coverage.server.ts` and `first-build-images.server.ts`. Add per-slot repair, then a no-picture variant chosen from the existing composition primitives (no new templates).
- Reviewer: `review-panel.server.ts` and `review-dependency`. Require rule-coded rejections; treat empty or contradicting rejections as advisory, with one bounded revise cycle.
- Style normalization: a pre-validation pass in the composition validator for known variants (px strings, `16/9`, header/footer font properties). Add the allowed-property list to Sol's prompt.
- Brief carry-through: check `onboarding.tsx` → `site-brief.server.ts` → `first-build-request.ts`, with tests.
- Completeness and craft: extend `content-completeness.ts`, `launch-quality-gate.ts` and `world-class-craft.ts`. Missing measurements report "not measured", never "passed".
- Tests: one for each failure seen in the real records (missing picture, contradicting rejection, style spellings), plus brief carry-through and the craft threshold.
