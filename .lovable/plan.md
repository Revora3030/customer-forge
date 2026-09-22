# Remove legacy picture fallbacks from AI image changes

## Goal
Make every builder request to create, replace, or change a website picture produce and attach a real AI-generated image. The gray abstract designs shown in the first two screenshots must never appear as a creative fallback.

## Changes
- Trace and unify picture requests from builder chat, Image Studio, starter images, and first builds into one authenticated image pipeline.
- Route new images by purpose to the image specialists and route edits to the precision-edit specialist; keep capability, budget, tenant, and content-safety gates.
- Save every successful result in the correct workspace and attach it to the exact page/section requested. A successful generation that is merely added to the library will no longer count as a completed change.
- Remove deterministic `DecorativeArt` and abstract generated-art rendering from public and preview website media slots. If a required image cannot be produced or attached, stop the change/build with the real error instead of showing template artwork.
- Remove “Revora artwork” fallback states and status values from the first-build image path; preserve owner-uploaded photos and safe no-image redesigns where the AI contract marks media optional.
- Ensure regeneration replaces the selected website image reversibly, with the original retained for rollback.
- Add tests proving image-change requests persist and attach generated media, edit requests use an edit-capable specialist, missing generation cannot produce abstract artwork, and required media failures block publishing.

## Validation
- Run focused image-flow and renderer tests, then the full test suite and lint/type validation through the project harness.
- Verify a real mobile preview has no gray circle artwork, empty image frame, or broken media at 390px and 430px.

## Safety retained
Tenant isolation, authentication, asset validation, truthful-content rules, spending controls, image provenance, rollback, and publishing checks remain enforced. Only deterministic creative fallback artwork is removed.
