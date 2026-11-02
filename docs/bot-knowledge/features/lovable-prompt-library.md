# Lovable Prompt Library research (builder craft bar v3)

Research source: Lovable's public Prompt Library (https://prompt.lovable.app, © Lovable), 149 prompts across design (78), functionality (54) and prompt strategy (17). The full capture and the mapping to Revora live in the bot knowledge folder (`builder/lovable-prompt-library/`: `library.md`, `raw.json`, `APPLY.md`), not in this repository, so nothing is copied verbatim into product code.

What shipped (builder craft bar v3, `src/lib/builder/world-class-craft.ts`):
- A style-neutral "finished states" block for the layout and polish teammates: loading timing and content-shaped placeholders, empty-state anatomy, form validation timing and ARIA, overlay focus rules, a motion budget with reduced-motion fallback, and no body copy on translucent surfaces.
- The visual craft critic now also checks that loading, empty, error and overlay states and motion timing look finished.
- It never names a font, colour, layout or section, so creative choices stay AI-authored (test: `world-class-craft.test.ts`).

Not adopted: the library's global styles as defaults, GSAP, and any paid component library.
