# World-Class AI Team — Craft Bar Upgrade

Date: 2026-09-27

## Why

Revora's AI team already owns every creative decision (see `ai-design-contract.ts`
and `creative-quality-matrix.ts`). The prompts gave the models strong safety and
truth rules, but almost no **execution bar**. Frontier models told only what not
to do fall back to the most common shapes in their training data: centred hero,
two buttons, three icon cards, a soft gradient. That is the "generic AI site"
look customers notice ([SiteCritic](https://www.sitecritic.ai/blog/why-ai-website-builders-produce-generic-designs),
[Palate](https://palatemcp.com/why-ai-sites-look-generic)).

This upgrade raises the bar the models hold themselves to without taking
creative authority away from them.

## What changed

| Area | Change |
|---|---|
| `src/lib/builder/world-class-craft.ts` (new) | Role-specific **craft bar** prompt: studio-grade standard, one-sentence concept, question-your-first-instinct, execution principles (hierarchy, type scale, spacing rhythm, grid, colour discipline, art-directed imagery, detail, motion, designed mobile, performance), a list of common generated-site defaults framed as questions, and a mandatory self-critique before answering. No fonts, colours, layouts, sections or effects are chosen. |
| Sol — creative direction (`collective-first-build.server.ts`) | Craft bar (`creative_direction`) appended. |
| Content strategist + section copywriter | Craft bar (`copy`) appended. |
| Page architect (`ai-page-architecture.server.ts`) | Craft bar (`page_architecture`) appended. |
| Section layout art director (`first-build-compositions.server.ts`) | Craft bar (`layout`) appended to RULES — used by the first build and every revision pass. |
| Edit polish (`edit-polish.server.ts`) | Craft bar (`polish`): improve, never flatten a distinctive decision. |
| Brand identity (`ai-brand-identity.server.ts`) | Craft bar (`brand_identity`). |
| Site-wide redesign (`ai-redesign-direction.server.ts`) | Craft bar (`redesign`). |
| Review panel (`review-panel.server.ts`) | Two new **independent** critics: `visual_craft` (routes to `visual_review`, Terra tier — never the model that authored the layout) and `distinctiveness` (`design_alternative`). `visual_craft` also runs on the light panel used for edits. Distinctiveness sees industry evidence. |
| Screenshot review (`vision-review.ts`) | Judges against an award-winning studio bar; six new craft findings (`weak_visual_hierarchy`, `misaligned_elements`, `poor_typography`, `generic_look`, `low_quality_imagery`, `unfinished_detail`). Composition findings that used to be "needs a human eye" (`unbalanced_layout`, `heading_too_small`, `inconsistent_style`) now go to the AI team for a redesign instead. |

Authority rules are unchanged: every design decision is still AI-authored,
deterministic code still only rejects unsafe output, and all existing firewall
tests pass. New tests: `world-class-craft.test.ts`, extra cases in
`vision-review.test.ts`.

## Cost note

Full review panels gain two reviewers (one high, one medium complexity); light
panels gain one. `visual_craft` and `distinctiveness` are not in the free-first
`DIVERSE_AREAS` set so they use the paid independent tier for quality. Move them
into `DIVERSE_AREAS` if spend needs to come down.

## Competitive gaps (next PRs)

Features top builders ship in 2026 that Revora does not yet have:

1. **Visual design mode** — direct manipulation of spacing, colour and type on the canvas without a prompt ([v0 Design Mode](https://vercel.com/i/v0-vs-lovable), [Ploy review of v0](https://ploy.ai/blog/v0-review)).
2. **Click-to-annotate, batched to the AI** — click elements, leave notes, send them all as one request ([AlphaSignal on v0](https://alphasignal.ai/news/vercel-s-v0-adds-drag-and-drop-design-to-kill-the-figma-handoff)). Revora has element selection (`PreviewSelectBridge`) but no multi-note batch.
3. **Hybrid AI + drag-and-drop editor** with built-in blog/CMS, ecommerce and scheduling ([Wix Harmony](https://www.wix.com/blog/what-is-wix-harmony)). Revora has booking and quotes; blog/CMS is the biggest missing content surface for customer SEO.
4. **AI canvas agent creating editable sections and CMS-ready content** ([Framer AI](https://www.framer.com/ai/)).
5. **Figma import / code export** — neither exists today.
