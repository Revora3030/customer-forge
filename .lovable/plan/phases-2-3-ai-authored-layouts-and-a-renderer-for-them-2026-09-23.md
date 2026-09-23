# Phases 2–3: AI-authored layouts and a renderer for them

Right now, every section on a customer site has to be one of a fixed list of section types: hero, services, pricing, and so on. The AI can only pick from that list. This step lets the AI describe any layout it invents, and lets live sites display it. Existing sites keep looking exactly as they do today.

## What changes for you
- The AI can create sections that don't match any old section type, for example a split story, an asymmetric grid of offers, or a custom booking band.
- Every existing section keeps rendering the same way, with nothing to migrate.
- Unsafe layouts (bad links, scripts, unreadable contrast, tiny tap targets) are rejected and sent back to the AI to fix. The system never quietly swaps in a design of its own.

## Plan
1. **Composition tree format.** A new section kind, `composition`, stores a validated tree in the section's existing settings field. Each node has a building-block type, its content, style values, overrides for phone, tablet and desktop, motion, and child nodes.
   - Building blocks: stack, grid, row, text, heading, media, button, link, form, card, list, divider, spacer, embed-safe icon.
   - These are building blocks only. The AI decides how they're arranged and nested.
2. **Validator (safety only).**
   - Checks the structure, depth and size limits needed for performance.
   - Allows only safe web addresses (https, internal pages, `tel:`, `mailto:`).
   - Treats text as plain text, never code.
   - Checks colour contrast and a minimum tap-target size.
   - Checks that motion respects visitors' reduced-motion settings.
   - Runs the existing truth screen on all text.
   - Returns either "valid" or a list of issues for the AI to repair. It never returns a substitute design.
3. **Renderer.** A new component draws any valid tree using the site's design tokens, with the phone, tablet and desktop overrides. The main section switch sends `composition` sections to it. Every existing section type stays as it is, as the compatibility layer for older sites.
4. **Builder hookup.** Add two actions to the site agent's plan: `upsert_composition` and `replace_section_with_composition`. They go through the validator, save a restore point, then save.
5. **Proof tests.**
   - A novel page and section structure renders.
   - Sections can be reordered, added and removed with no automatic override.
   - Phone, tablet and desktop overrides apply.
   - Unsafe trees are rejected and nothing replaces them.
   - Snapshots of existing section types are unchanged.
   - The rule-free firewall tests still pass.
6. **Quality gate.** Type checks, tests and production build must pass. Check the preview visually at 390px and 1280px widths.

## Technical details
- No database change: `kind` is already free text and `settings` is already JSON.
- New files:
  - `src/lib/builder/composition-tree.ts`: types and validator, shared by the server and the browser.
  - `src/components/site/CompositionRenderer.tsx`.
- Changes to existing files:
  - `SiteSections.tsx`: one added case.
  - The site agent's action schema and installer: the two new actions.
- Phases 4–5 come after this and are unchanged:
  - Move first build, redesign and edits onto compositions by default.
  - Remove keyword-based request sorting and the approval gate for autonomous builds.
  - Audit the model fallback chain and delete dead modules.
