# Five-Phase Root-Level Blocker Elimination

Goal: the AI-authored design contract plus composition tree becomes the only creative source of truth, from first build through edits, redesigns, visual QA, and publish. Safety, security, tenant isolation, accessibility, billing, and spending caps stay unchanged.

This is a large migration. It will be delivered in five checkpoints, each ending with tests, typecheck, and build passing, plus a short evidence report.

## Phase 1 — Full trace and blocker inventory
- Map every path that can create or change a site: first build, retry/continuation, chat edit, redesign, restyle, upgrade, and publish.
- For each module that makes a creative decision (for example the design fingerprint, creative-authority, site-style, site-effects, visual-composition, materializer), record who calls it and whether it is still reachable.
- Look for hidden limits too: `.slice()` caps, filters, or truncation that silently drop AI content, forced defaults, and switches that could turn AI off.
- Output: a written blocker inventory covering the root cause, where it is called, whether it is reachable, and what to do (delete, replace, or keep as safety).

## Phase 2 — Lossless AI to browser pipeline
- Delete or disconnect every reachable creative authority found in Phase 1. Where old fields are still needed, replace them with AI-authored data.
- Materializer and renderer only translate: no automatic CTA, hero, overlay, radius, shadow, typography, or layout changes. A default applies only when the AI left a field blank, and it must be neutral.
- Add round-trip tests: an AI-authored contract plus tree goes through materialization and rendering, and every field survives (pages, order, roles, layout, type, spacing, color, imagery, motion, responsive rules, links, forms).
- Add regression tests (extending the authority firewall) that fail if any removed module is imported again from a generation path.

## Phase 3 — Remove expressive ceilings, keep safety
- Extend the composition tree vocabulary: grid areas, layering, sticky and scroll regions, per-breakpoint overrides, richer image treatment, and declarative motion (timing, easing, trigger, and a reduced-motion fallback).
- Keep all safety in validation: markup sanitizing, allowed CSS properties, and size limits. Size limits must fail loudly, never trim silently.

## Phase 4 — Unified visual QA and repair loop
- One loop for first builds, redesigns, and large edits: render, capture in a real browser, measure, Sol critiques, Terra reviews adversarially, apply repairs through the composition tree, render again, compare. The improvement gate still rejects any weaker version.
- Capture every page at phone (390), tablet (768), and desktop (1440), reusing the existing visual-check grader and its per-page storage.
- Link browser evidence to the exact design revision (a content hash), so publishing is blocked when evidence is stale or missing, or when objective failures remain.

## Phase 5 — Production proof
- Run the full chain on the QA workspace, then on a second business in a different industry: build, QA, repair, edit, redesign, and approve.
- Run typecheck, lint, all tests, build, security scan, database linter, and Playwright at all three sizes.
- Final report covering items A to N from the directive, including anything still unresolved.

## Technical details
- Real-browser capture cannot run inside the server worker, which has no headless browser. Options, in order: (a) the owner's builder page renders each page in a hidden frame and sends measurements plus a screenshot (extends the current visual-check flow; the server re-grades and never trusts browser-computed scores); (b) an external screenshot service, which would need a key. Plan uses (a) unless the user picks (b).
- Sol and Terra read screenshots through their image input. Repairs are patches to the composition tree and are validated by the existing composition-tree validator.
- Revision binding: store a `composition_hash` on each visual report; the publish guard compares it with the live tree hash.
- Migrations only add columns or tables. No data is destroyed, and RLS and grants are kept.
- Spending stays under the Luna $100/month cap. QA rounds are limited by time and spend, not by a fixed count.

## Known limits
- Security scan items that already existed are reported, not hidden.
- Free models remain backup only.
