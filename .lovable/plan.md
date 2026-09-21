# Close the remaining premium-site generation gaps

## Outcome

Make Customer Forge consistently produce distinctive, image-led, industry-appropriate websites with the visual confidence shown in the reference screenshots—without copying their brands, wording, exact colors, or proprietary assets.

The plain first screenshot is not one isolated styling defect. The creative pipeline currently describes a much richer site than the public renderer can express, while the visual score mainly proves that the page is usable and unbroken.

## Confirmed diagnosis

- The current first build uses fixed page recipes: hero, trust strip, about, service grid, benefits, forms, FAQ, CTA. Reordering those blocks does not create a genuinely new composition.
- The public renderer supports only a few broad visual variants. Many of the builder’s named options collapse into the same four generic treatments.
- Sol and Terra can change a rich creative fingerprint, but several changed values never alter the rendered page.
- The 320–1440 gate checks overflow, clipping, broken images, navigation, controls, accessibility, and loading behavior. It does not judge art direction, visual hierarchy, image storytelling, originality, or resemblance to the approved reference quality.
- The reported “ultimate” scores are largely predetermined values or action-count heuristics, not scores derived from screenshots.
- The customer build had one existing photo. Current first-build logic treats any owner photo as sufficient and generates no supporting imagery, leaving the site visually sparse.
- Placeholder intake such as “Wieueueu / Ueueueu” can still become the dominant brand and headline. The builder protects against fabricated claims, but does not yet stop meaningless supplied content from producing an unfinished site.

## Remaining gaps

### A. Creative decisions that do not reach the page

1. **Color-system execution:** Sol/Terra may change `colorSystem`, but the public theme is still driven by saved profile colors; the creative color decision can be invisible.
2. **Typography-system execution:** the fingerprint emits a type-system class, but the actual site uses one saved heading font and one shared body font. Pairing, weight, case, scale ratio, measure, italics, and accent type are not fully rendered.
3. **Creative-brief execution:** personality, section rhythm, card language, CTA language, background treatment, mobile strategy, and industry conventions are mostly descriptive text rather than executable design data.
4. **Screenshot-reference fidelity:** reference observations are reduced by keyword rules to a small token patch. Composition proportions, focal placement, whitespace, image cadence, headline geometry, and section-to-section relationships are lost.
5. **Vocabulary collapse:** dozens of fingerprint choices map into four hero, four card, four proof, four gallery, four FAQ, and four form buckets.
6. **Unused fingerprint fields:** pricing, statistics, process/timeline, and parts of form layout are selected and stored but lack dedicated rendered implementations.
7. **Creative review without rendered review:** Terra approves proposed fields before seeing the final browser output, so it cannot reject a technically valid but visually weak composition.
8. **No composition-level repair:** repair handles measurable breakage, not “this page is visually flat,” “the image hierarchy is weak,” or “three sections repeat the same silhouette.”

### B. Page and section composition

9. **One dominant page recipe:** industries receive different labels and ordering, but too often share the same underlying section sequence and geometry.
10. **Fixed hero anatomy:** the hero remains a text block beside or above a separate media frame. It cannot truly render cinematic full-bleed imagery, editorial overlays, portrait-led framing, collage, image masks, offset layers, or integrated proof.
11. **No art-directed headline markup:** headlines are plain strings, preventing safe highlighted words, italic contrast, line-break control, kicker labels, supersized words, and mixed display treatments like the luxury references.
12. **Generic section shell:** most sections use the same centered container, border, heading stack, spacing, and body measure.
13. **Detached imagery:** non-hero media is generally placed in a uniform grid above the section instead of composing with that section’s text and actions.
14. **Insufficient section silhouettes:** no robust library of image-left editorial stories, image-right stories, feature spreads, quote interludes, horizontal bands, oversized typographic breaks, offset mosaics, sticky narratives, or immersive image chapters.
15. **Fallback sections are plain prose:** offer, guarantee, intro, area, policy, and lead-magnet sections have no dedicated visual composition.
16. **Service layouts are shallow:** service cards vary mostly by border/shadow/grid span, not by true list, editorial feature, alternating media, package, comparison, or story layouts.
17. **Pricing layouts are not real:** “tier,” “package,” “featured,” “matrix,” “range,” and “most booked” choices collapse to flat label/price rows.
18. **Process layouts are not real:** timelines, rails, numbered journeys, before/during/after, and phase treatments collapse to a static grid.
19. **Statistics layouts are not real:** large-number bands, paired metrics, rings, counters, and proof-linked figures collapse to small panels.
20. **FAQ layouts are mostly cosmetic:** standard FAQs are static definition lists; the existing accordion is isolated in custom blocks.
21. **Review layouts lack editorial impact:** there is no real full-screen pull quote, anchored testimonial story, portrait proof, review rail, or mixed proof composition.
22. **Gallery layouts are limited:** no lightbox, before/after interaction, category filtering, true masonry, or purposeful image sequencing for standard gallery sections.
23. **CTA layouts are thin:** CTAs do not consistently integrate imagery, proof, contact context, or strong full-width composition.
24. **Generic inner pages:** service, pricing, about, booking, and contact pages are much thinner than the home page and do not receive page-specific openings or visual narratives.
25. **Plain footer:** the footer is essentially copyright and city, despite the fingerprint promising richer footer systems.

### C. Imagery and brand presence

26. **Any-photo short circuit:** one owner image disables all generated supporting visuals instead of filling only the missing safe slots.
27. **Low image volume:** first build is capped at four generated images, which is insufficient for a polished multi-page site.
28. **No page-level image plan:** generated imagery is not allocated across every important page with intentional reuse limits and narrative sequencing.
29. **Weak visual image QA:** image checks verify storage, labels, provenance, slots, and duplicate paths—not composition quality, subject relevance, bad anatomy, text artifacts, visual similarity, focal safety, or mobile crop quality.
30. **No automatic image reroll from rendered evidence:** a technically valid but weak or repetitive image can pass and remain.
31. **No responsive image derivatives:** generated images need suitable phone/tablet/desktop crops, sizes, and modern delivery rather than one asset forced into every frame.
32. **No true image-to-layout coupling:** image negative space and focal point are described in the brief, but layout does not reliably place text in that space.
33. **No coherent campaign set:** individual images can vary in lighting, lens, palette, and realism instead of reading as one art-directed shoot.
34. **No brand-mark solution:** the renderer primarily shows the business name as text; it lacks a complete, truthful owner-logo/import/monogram fallback system comparable to the references.
35. **Abstract-art fallback looks unfinished:** when photography is absent or blocked, the generic abstract frame can dominate the first screen and read like a placeholder.
36. **No image-led trust distinction:** generated marketing visuals, owner work, and verified proof are safely separated in data, but the visual design does not clearly distinguish them for visitors.

### D. Content, hierarchy, and conversion

37. **Meaningless-input gate:** syntactically supplied but obviously placeholder-like names, taglines, services, and descriptions do not block or pause first build.
38. **Thin factual intake recovery:** when facts are insufficient, the system builds a sparse generic site instead of asking the minimum targeted questions needed for a credible result.
39. **Generic headings remain:** fixed labels such as “What we do,” “Why customers choose us,” “Pricing,” and “Common questions” repeat across sites.
40. **No structured editorial copy roles:** the data model lacks explicit eyebrow, display line, emphasized phrase, supporting line, caption, feature label, duration, package badge, and micro-proof fields.
41. **Limited service storytelling:** cards do not naturally support inclusions, duration, ideal-for, process, expected experience, or verified price framing.
42. **Weak trust when reviews are unavailable:** fact safety correctly removes invented reviews, but the builder needs richer truthful alternatives such as process transparency, materials, owner-provided credentials, policies, service detail, and direct contact reassurance.
43. **No conversion hierarchy by page stage:** repeated CTA buttons exist, but awareness, evaluation, and decision sections do not receive distinct next actions.
44. **Mobile action bar is fixed-format:** it supports call plus one action, not industry-aware combinations such as call / quote / directions or booking / menu / map.
45. **No contextual floating action:** chat, directions, booking, or enquiry affordances are not selected by verified business capability.
46. **Navigation brand hierarchy is weak:** logo, descriptor, location, primary action, and menu composition do not adapt enough to the visual direction.

### E. Interaction and motion

47. **Motion vocabulary without implementations:** counter count-up, marquee, parallax, border draw, sticky reveal, and step highlighting are named but largely not implemented.
48. **No standard carousel/rail behavior:** gallery and proof vocabularies mention rails/carousels but the standard renderer lacks complete interaction.
49. **No standard before/after interaction:** important for detailing, trades, beauty, fitness, and restoration, while still requiring owner-provided evidence.
50. **Limited tactile states:** buttons, cards, images, and navigation do not receive a cohesive industry-specific hover/press/focus language.
51. **No section-specific mobile transformation:** layouts mostly stack to one column rather than becoming intentional mobile compositions with reordered evidence, controlled crops, rails, and condensed hierarchy.
52. **No progressive image storytelling:** the references use image rhythm and deliberate reveal; current sections appear as independent blocks.

### F. Quality gates and false confidence

53. **Technical pass mistaken for visual pass:** a page can score 85–91 while remaining generic because the browser gate is intentionally non-subjective.
54. **Hard-coded quality scores:** the “ultimate” module assigns values such as 97–99 without rendered evidence.
55. **Action-count scoring:** another quality score increases when visual actions exist, even if those actions produce little visible difference.
56. **No screenshot-based aesthetic rubric:** hierarchy, originality, composition, balance, image quality, typography, density, polish, and emotional fit are not graded from the rendered page.
57. **No reference-distance check:** the system does not verify that the result captured the requested structural qualities while remaining non-cloning.
58. **No multi-page visual consistency score:** the gate checks pages independently, not whether the entire site feels like one coherent art direction.
59. **No repetition detector for layouts:** repeated cards, repeated section silhouettes, repeated image crops, and repeated CTA patterns are not penalized.
60. **Genericity checker is copy-only and advisory:** it detects a small phrase list and repeated long text, not visual genericity, and it cannot block a weak first build.
61. **No minimum visual-content threshold:** a premium build can pass with too few meaningful images, too little section variety, or no standout composition.
62. **No real-device visual approval stage:** width checks exist, but there is no explicit owner-facing desktop/mobile contact sheet and approval before replacing or publishing a site.

## Implementation plan

### 1. Replace descriptive creativity with an executable page specification

Create a versioned, validated design document containing page shells, section compositions, structured text roles, media assignments, responsive behavior, interaction choices, and token values. Sol proposes it, Terra critiques it, deterministic validators enforce facts and supported capabilities, and the renderer consumes it directly.

### 2. Build a real composition renderer

Add dedicated, reusable compositions for cinematic/editorial/split/layered heroes; service stories; packages and pricing; process timelines; statistics; proof; galleries; FAQs; conversion bands; page openings; navigation; and footers. Each fingerprint choice must map to a visibly distinct implementation, not merely a class name.

### 3. Complete typography and color execution

Translate the approved type pairing, scale, weight, case, line treatment, surface palette, accent rules, borders, radii, and image grade into semantic site tokens. Support safe structured emphasis without allowing arbitrary generated markup.

### 4. Make image generation gap-aware and composition-aware

Inventory owner assets by usable role instead of raw count. Generate only missing safe marketing visuals, create a coherent art-directed set, validate actual pixels, produce responsive crops, attach images to exact page/section slots, and reroll weak results. Generated marketing visuals remain clearly separate from verified owner evidence.

### 5. Strengthen content readiness and page depth

Stop on meaningless placeholders, ask only the missing high-value questions, and generate richer truthful content structures. When proof is unavailable, use honest process and service detail rather than fabricated testimonials or empty space.

### 6. Add real interactions and mobile adaptations

Implement supported accordions, rails, lightboxes, owner-evidence before/after, industry-aware mobile actions, and restrained motion. Every desktop composition receives an intentional mobile transformation, not only a one-column fallback.

### 7. Replace inflated scores with rendered evidence

Separate technical QA from visual-quality scoring. Add screenshot-based grading for hierarchy, composition, typography, image quality, originality, business fit, repetition, polish, mobile crop, and cross-page coherence. Remove predetermined 97–99 claims and action-count proxies from user-facing quality reporting.

### 8. Prove the upgrade on real builds

Build multiple truthful fixtures across contrasting industries plus a guarded fresh rebuild of the owner’s site. Produce desktop/mobile contact sheets, compare against the selected structural reference qualities without cloning, automatically repair failures, and keep exact rollback evidence.

## Acceptance criteria

- The same business facts can produce at least three materially different approved directions whose screenshots differ in structure, not only colors.
- Every persisted creative choice has a tested renderer consumer or is removed from the offered vocabulary.
- A single owner photo no longer prevents safe supporting imagery from filling missing roles.
- Placeholder-like intake blocks first build and requests correction.
- Pricing, process, statistics, FAQ, proof, gallery, CTA, navigation, and footer choices render as genuinely different compositions.
- The customer site shows coherent art direction across all pages and passes technical QA at 320, 375, 390, 414, 768, 1024, 1280, and 1440px.
- Visual acceptance requires screenshot evidence, not hard-coded scores or counts of planned actions.
- No invented reviews, prices, credentials, results, business facts, or connected services appear.
- Authentication, tenant isolation, billing, publishing, domains, analytics, versioning, rollback, and free-first/paid-opt-in controls remain unchanged and are regression-tested.

## Technical details

The safest path is additive: introduce a versioned executable composition contract, keep existing stored sites backward compatible, and migrate the renderer section-by-section. Existing public sites continue using their current contract until rebuilt or explicitly upgraded. Every new composition remains data-only and allowlisted; generated code never runs in customer browsers.
