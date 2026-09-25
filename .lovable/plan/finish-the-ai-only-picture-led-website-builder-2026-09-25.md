# Finish the AI-only, picture-led website builder

## Outcome
Every new customer website will be authored by the AI team from business facts through page architecture, copy, art direction, generated pictures, responsive compositions, review, repair, and publish readiness. Safety, truthfulness, tenant isolation, billing controls, accessibility, backups, and owner-upload precedence remain enforced.

## Build plan

1. **Replace the remaining old planner**
   - Remove `generateWebsitePlan()` and its industry/template-derived copy from the live generation worker.
   - Replace `planSiteContent()` as creative source with a facts-only material inventory: real services, prices, contact routes, forms, bookings, owner media, and supplied proof.
   - Let Sol author the complete page set, page purposes, section material, headings, body copy, actions, visual needs, and order. A missing or rejected AI plan stops the build instead of restoring a built-in site.
   - Remove stale `template`, neutral fingerprint, deterministic CTA, page-count, service-count, and invented-page ceilings from new-build paths.

2. **Unify creative direction into one AI contract**
   - Replace blank/default fingerprint values and the compiled fixed grid, spacing, responsive, media, and CTA assumptions with values Sol explicitly authors.
   - Keep validators as rejection-only safety boundaries; they may clamp unsafe numeric values but may not choose a design.
   - Make Terra return actionable repairs and let Sol repair rejected architecture or creative fields before the build fails.

3. **Make generated pictures part of the design, not an afterthought**
   - Remove fixed `ShotSlot`, `planShots()`, `CANDIDATE_STYLES`, rotating photo styles, fixed service/image limits, and generic alt-text templates from first builds.
   - Have Sol produce a page-aware image campaign after the final architecture: each image gets its subject, purpose, framing, focal point, negative space, mobile crop, aspect ratio, placement, and truthful alt text.
   - Use Sunburst for hero/editorial master images and Flare for supporting/service images, with the existing standard image lane only as capability-aware failover.
   - Preserve owner photos first, generated-media provenance, the $100 monthly cap, and the prohibition against generated proof, staff, reviews, awards, results, or real-customer impersonation.
   - Treat missing required imagery as a repair job: retry the image, redesign the section to need no image, or stop. Never substitute generic artwork.

4. **Expand composition quality and remove repeated-page anatomy**
   - Feed Sol the final page plan and final image campaign together so each composition uses the correct picture rather than repeating one asset.
   - Add safe primitives and style capabilities only where needed for editorial media, layered hero treatments, metrics from supplied facts, process storytelling, and richer mobile navigation.
   - Stop requiring every page to share a hero/body/closing pattern. Require instead a deliberate opening, useful content, and a real conversion path appropriate to that page.
   - Redesign AI-authored navigation for mobile so it is compact by default and does not occupy most of the viewport, as shown in the uploaded screenshots.

5. **Add real review and repair before readiness**
   - Run structural and fact validation, then rendered checks at 320, 375, 390, 430, 768, 1024, 1280, and 1440 pixels.
   - Measure overflow, overlap, obscured content, text fit, touch targets, image loading/cropping, missing media, duplicated visual treatments, and menu height.
   - Give the measurements and screenshots to Terra for adversarial critique; let Sol repair the affected compositions/chrome and rerun the checks with bounded attempts.
   - Keep publish readiness false until all required rendered checks pass; preserve the prior site through the existing backup/rollback path on failure.

6. **Remove remnants and prove the full flow**
   - Delete unused old-engine modules, comments, tests, fields, stored template writes, and compatibility labels that can still misrepresent a non-AI path as active.
   - Add regression tests that fail if deterministic page copy, preset image styles, neutral design defaults, template authority, or silent creative fallbacks return.
   - Run type checks, lint, the full test suite, build validation, and one complete authenticated customer build with generated pictures.
   - Inspect the finished site visually on phone, tablet, and desktop and confirm Sol, Terra, Luna, Sunburst/Flare, storage, rendering, rollback, and readiness evidence all behaved truthfully.

## Technical notes
- This is an incremental migration of the live generation pipeline, not a second builder beside it.
- Existing customer data and the two retained sites remain intact. New writes use the unified AI contract; old fields are removed only after no live reader needs them.
- Functional quote, booking, contact, embed, CRM, analytics, SEO, domain, billing, authentication, RLS, and publishing paths stay unchanged unless required to consume the new contract safely.