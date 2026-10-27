# Make test-build sites match the video-reference quality

Goal: the mobile detailing test build (and every first build) comes out finished and at the level of the reference videos (CarVault, Vice Key, Regent): real photos, full-width cinematic sections, bespoke interactive pieces, no generic text-only openings.

## Starting point (from the last test build, to be re-confirmed first)
- The build finished, but pages were missing photos and full-width layouts.
- An old estimate form from earlier builds was still showing.
- The workspace carries the detailing business details (Revora backup saved).

## Steps
1. **Confirm the causes.** Re-read the saved test site's sections and the build job's stage checkpoints to see exactly where pictures and full-width layouts were dropped (image step, missing-picture repair, or section design choice). No fix is chosen until the data shows the cause.
2. **Remove the leftover estimate form** from the test workspace only.
3. **Fix photo delivery.** Make sure the per-section shot list reaches the image step and generated pictures are saved before sections reference them, so the repair step no longer strips them.
4. **Fix full-width layouts.** Ensure the cinematic pieces (scene, scroll chapters, offer cards, collection rows) are offered to Sol and render edge-to-edge on phone and desktop.
5. **Add a quality gate before "complete".** A build is not marked finished if the opening has no picture, most sections are text-only, or pieces from the reference look are absent; it goes back to Sol for repair instead. Never invents facts, prices or reviews.
6. **Carry the homepage signup brief** (business type, goals, style wishes) into the build so customer direction shapes the design.
7. **Run one more approved test build** of the same detailing business, then check every page at phone (390px) and desktop widths with screenshots. Nothing is published.
8. **Restore the Revora workspace details** from the backup afterward, if you want.

## Approvals
- Step 7 spends AI credits for one test build; approving this plan approves that single build.
- No publishing, emails or live-site changes.

## Technical notes
- Work in existing builder files (first-build coverage repair, composition renderer, design-quality repair loop); no second pipeline.
- Add focused tests for the new quality gate and photo-save ordering.
