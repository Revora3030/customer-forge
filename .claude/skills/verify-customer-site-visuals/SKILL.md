---
name: verify-customer-site-visuals
description: Measure a generated customer website against the Revora dark-obsidian, full-bleed cinematic standard at every width from 320px to 2560px with a real browser (Playwright MCP or scripts). Use after builder, renderer or styling changes, or when asked to check how a customer site looks.
---

# Verify customer-site visuals

Evidence only: every finding comes from a measured page and a screenshot, never from reading code. Missing measurements are reported as "not measured", never as passed.

## The standard (what "good" means here)
- **Dark obsidian canvas** when the site's AI-chosen direction is the studio/cinematic look: page background is the obsidian token (`--obsidian`, ≈ `#0a0d10`), no stray light bands between sections, body text passes WCAG AA on its background. Sites whose AI direction chose a light canvas are judged on their own canvas; never force obsidian onto them (see `src/lib/builder/AGENTS.md`: creative choices are AI-authored).
- **Full-bleed cinematic**: hero and `scene` sections span the full viewport width with no side gutter or horizontal scroll; full-bleed images are at least 1280px wide (`FULL_BLEED_MIN_WIDTH`), not stretched or pixelated; the scene scrim keeps overlaid text at AA contrast.
- **Every width**: no horizontal scroll, no clipped headings, tap targets ≥ 44px on phones, primary CTA visible without overlap, nothing covering a control at 390px (P0).

## Widths to measure
`320, 375, 390, 414, 768, 1024, 1280, 1440, 1920, 2560` (height 900; phones also at full page).

## How
1. Get a URL: a running dev server (`npm run dev -- --host 127.0.0.1 --port 8080`) with a tenant preview, or a published customer site the owner names.
2. With the Playwright MCP server: for each width, `browser_resize`, `browser_navigate`, `browser_take_screenshot` (full page), and `browser_evaluate` for:
   - `document.documentElement.scrollWidth > innerWidth` (horizontal scroll),
   - `getComputedStyle(document.body).backgroundColor` and each `section`'s background,
   - hero/scene `getBoundingClientRect().width` vs `innerWidth`,
   - `naturalWidth` of full-bleed images,
   - console errors (`browser_console_messages`): any runtime script error is P0.
3. Without MCP, use the repo scripts: `node scripts/page-sweep.mjs <baseUrl> --a11y` (overflow, tap targets, alt text, axe) and `python3 scripts/visual-qa.py` for the visual benchmark.

## Report
A table: width × check → pass / fail / not measured, with the screenshot path for every failure and the P0 list first. Do not "fix" by adding deterministic templates or seeded styles; route fixes through the existing composition primitives and AI repair loop (`qa-loop.server.ts`).
