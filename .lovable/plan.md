# Plan: Finish the 30 builder quality gaps

## Goal
Make first-build sites look and feel premium from the first preview, especially when a customer has not uploaded photos, while preserving Revora's safety rules: no invented claims, no broken tenant isolation, no silent paid AI fallback, no publish-ready status without real evidence.

## Current-state evidence checked before this plan
- First-build jobs run through `src/lib/site-engine.worker.server.ts`, then call `materializeSiteContent(...)` in `src/lib/site-materialize.server.ts`.
- The current first-build materialization writes pages, sections and text components, but does not attach generated image components or set `business_profiles.hero_image_url` during first build.
- Public site rendering in `src/components/site/SiteSections.tsx` shows `profile.hero_image_url` in the hero; otherwise it renders deterministic abstract art.
- Section media rendering already exists for components with `media_url`, and private media is signed in `src/lib/public-site.server.ts`.
- The authenticated Image Studio already has generation, validation, storage upload, media-row creation, and tenant permission checks in `src/lib/image-studio.functions.ts` / `src/lib/image-studio.server.ts`.
- The asset planner in `src/lib/builder/asset-intelligence.ts` currently plans slots only; it does not create or attach assets.
- Visual QA already measures the site in real browser widths 320, 375, 390, 414, 768, 1024, 1280, and 1440 through `VisualCheckPanel` and `src/lib/builder/visual.ts`.

## What I will build

### 1. First-build image lane
- Add a server-only first-build asset generation module.
- For no-photo builds, create a starter image set from the existing visual direction and asset plan:
  - hero image,
  - service/process image set where appropriate,
  - optional OG/share image.
- Store generated images in the existing tenant media storage path and `media` rows.
- Attach the hero image to the profile and section images to `website_components.media_url` so the real visitor site renders them after refresh.
- Preserve owner uploads as highest priority; never overwrite an owner-selected image.

### 2. Free-first and paid-safe image routing
- Keep the source order explicit:
  1. owner-uploaded photos,
  2. verified free image generation when available,
  3. GPT image lane only when explicitly enabled and budget-safe,
  4. abstract generated artwork as last resort.
- Add truthful capability states for generated, skipped, blocked, budget-capped, provider-failed, and fallback-artwork outcomes.
- Never claim image editing is available unless the existing live edit probe passes.

### 3. Premium industry art direction
- Expand first-build image prompts using the existing `visual-direction` language.
- Add stronger industry-specific prompt patterns for automotive/detailing and reusable patterns for other verticals.
- Include rules that prevent fake logos, fake reviews, fake awards, embedded text, misleading before/after claims, and invented staff/customer proof.

### 4. Richer first-build composition
- Upgrade first-build section composition so generated pages do not feel like a flat stack.
- Use the persisted design fingerprint to drive:
  - immersive hero layout,
  - editorial service/pricing sections,
  - stronger contrast and spacing rhythm,
  - dark/black + gold premium variants where the brand direction fits,
  - image-first sections when generated or uploaded visuals exist.
- Improve pricing/package rendering when real prices exist; do not invent prices.
- Add non-fake proof sections when testimonials/reviews are missing, such as process, inspection checklist, FAQs, or what-to-expect content.

### 5. Copy cleanup and fact locks
- Add a deterministic cleanup pass to remove duplicate weak lines like repeated short taglines.
- Keep Sol/Terra/Luna as refinement only: they may improve phrasing but not invent facts.
- Preserve exact names, services, prices, contact details, locked wording, exclusions and unknown facts.
- Add regression tests proving invented phone/email/prices/reviews/awards cannot pass into first-build output.

### 6. Generated-image QA and repair loop
- Add image-level checks before attaching assets:
  - valid bytes and MIME,
  - correct slot category,
  - alt text present,
  - source/provider/model recorded,
  - no blank image placeholder.
- Add site-level checks after materialization:
  - hero visual present or explicitly justified,
  - section media attached where planned,
  - no broken images,
  - no sideways overflow,
  - no tiny text/tap targets,
  - CTA path works.
- Store evidence in existing quality/audit records and block “Ready” when visual evidence is missing.

### 7. Builder UX updates for the image gap
- Add clear customer-facing status in the Images/QA area:
  - using uploaded photos,
  - generated starter images ready,
  - free image generation unavailable,
  - paid image generation disabled,
  - budget reached,
  - fallback artwork used.
- Add actions to regenerate, replace with uploaded photos, remove, or mark inaccurate.
- Keep these changes reversible through the existing history/rollback path.

### 8. Button/link correctness
- Fix the remaining site button-link warning by validating generated CTA links against actual visible pages/forms before materialization.
- Ensure internal generated links resolve to visible generated pages, quote sections, booking pages, contact sections, or safe external/contact links.

### 9. Tests and verification
- Add focused tests for all new decision logic:
  - image source priority,
  - no paid image call when disabled,
  - budget fail-closed,
  - free fallback behavior,
  - generated media attachment,
  - no overwritten owner photos,
  - fact-lock preservation,
  - CTA link resolution,
  - visual evidence required before Ready.
- After approval and implementation, run focused tests first, then the existing validation set available in this project:
  - typecheck,
  - lint,
  - unit tests,
  - security audit,
  - production build,
  - browser journey / visual pass where credentials and preview access allow.

## How the 30 gaps will be closed
| Gap | Closure approach |
|---|---|
| 1 | Wire first-build image generation into the real build path. |
| 2 | Enforce owner photo → free AI → paid enabled/budgeted → abstract fallback order. |
| 3 | Add premium industry art direction prompts. |
| 4 | Generate and attach hero/service/process/share image slots. |
| 5 | Strengthen atmosphere, contrast, depth and section rhythm. |
| 6 | Improve first-build typography choices through the design fingerprint. |
| 7 | Make fingerprint drive actual composition, not only labels/settings. |
| 8 | Verify mobile-first layout at required widths. |
| 9 | Normalize one primary and one secondary CTA. |
| 10 | Add stronger positioning copy without inventing facts. |
| 11 | Keep testimonials/reviews absent unless supplied or verified. |
| 12 | Render pricing/package cards only from real service prices. |
| 13 | Deepen reusable industry playbooks, starting with auto detailing. |
| 14 | Persist a creative-director decision before materialization. |
| 15 | Use detailed safe image prompts per slot. |
| 16 | Reject invalid/blank/unsafe generated images. |
| 17 | Store generated images and attach them to rendered pages. |
| 18 | Show honest image status and next actions in the builder. |
| 19 | Add first-screen visual checks to readiness. |
| 20 | Use the existing repair/recheck loop for visual failures. |
| 21 | Replace duplicate/weak missing-data output with safe questions or omission. |
| 22 | Extend fact-lock tests for all model passes. |
| 23 | Improve page depth with real sections only. |
| 24 | Preserve black/gold premium direction while varying per business. |
| 25 | Keep subtle, accessible interaction polish. |
| 26 | Validate every generated button/link target. |
| 27 | Ensure SEO/AEO metadata and image alt text exist from first build. |
| 28 | Keep generated images performance-safe. |
| 29 | Add customer controls for generated starter images. |
| 30 | Report exact capability status instead of fake green states. |

## Safety limits
- I will not publish or connect external domains without a separate explicit publish/deploy request.
- I will not invent reviews, awards, certifications, prices, business history, results, contact details, or before/after proof.
- I will not expose private keys in browser code or logs.
- If GPT image generation or any provider is unavailable, the builder will report the exact blocker and use the safe fallback.
