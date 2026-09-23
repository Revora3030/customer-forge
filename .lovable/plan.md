# AI-as-sole-creative-authority migration

The scan found about 60 files still tied to the old rule-based design systems: archetypes, template gallery, design fingerprints, keyword intent routing, fixed section kinds, story pass, motion packs, conversion engine and auto-upgrade. Doing all of this in one step would put every live customer site at risk. The work is split into phases below. Each phase has to pass the full quality check before the next one starts.

## Phase 1 — Inventory and lock-in tests
- For every legacy module, trace each place it's used. Sort each use into one of two buckets: creative authority (remove it) or safety/rendering (keep it as a guardrail).
- Add an "authority firewall" test. It fails if production code imports `site-archetypes`, `template-gallery`, `design-fingerprint`, `interpreter` keyword routing, `story-pass`, `motion-pack` selection, `native-first-build` or `first-build-creative`.
- Add tests that capture how existing legacy sites render today, so we can prove later that they still render safely.

## Phase 2 — Canonical composition tree
- Extend the AI Design Contract with an open, validated node tree: `{ type: primitive, props, style tokens, responsive overrides, motion, children }`.
- Primitives (stack, grid, text, media, button, form, card, nav, and so on) are building blocks only. Section kinds become optional labels, not a closed list.
- Validation covers only schema, safe URLs, sanitised text, contrast, touch targets, reduced motion and truth gates. It can reject output or ask for a repair. It never swaps in a design of its own.

## Phase 3 — Renderer
- Add a tree renderer in the site sections code and the public site pages that renders any validated tree.
- Old section records go through a read-only compatibility adapter, so existing sites keep rendering unchanged.

## Phase 4 — Rewire the builder
- First build, redesign, site-wide edits and direct edits all go through: Sol authors the tree → validate → Terra repairs → apply → visual QA → repair → retest.
- Delete the deterministic callers: archetype recipes, gallery selection, fingerprint pools, section-role-to-layout maps, fixed ordering, the conversion-engine layout choices, auto-upgrade presets and keyword intent routing. Astra and Sol handle understanding requests instead.
- Remove the owner-approval gate for ordinary creative changes when a build is explicitly autonomous. Confirmation stays for billing, destructive and account-level actions.

## Phase 5 — Fallbacks and cleanup
- Fallback order is: primary model → alternate model → zero-cost allowance model → Hall of Fame free model → a clear failure you can retry. There is never a template fallback.
- Delete dead modules and their tests. Keep the database fields that old sites still read.

## Required proof tests
Each of these gets a test:
- a novel page structure
- a novel composition
- reorder, remove and add sections
- a full redesign with no template
- responsive typography, grid, navigation and motion changes
- site-wide edits
- model failover
- unsafe output is rejected with no substitute design
- legacy sites still render
- the firewall check

The full typecheck, lint, tests and production build must pass at the end of each phase.

## Retained compatibility shims
- The read-only renderer adapter for old section data.
- The old database columns, which stay readable and are no longer written.

## Delivery
Phases 1 to 3 in the first pass, then 4 and 5. Nothing reaches customers until you publish. PR #175 stays separate, because the connected GitHub account still can't write to it.
