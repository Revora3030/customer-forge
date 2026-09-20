# Massive builder upgrade — Lovable-grade planning and premium site output

Full creative control, one big pass. Stays $0-AI (native engine only), preserves the current apply/verify/publish pipeline, adds no new external dependencies.

## What changes for the owner

- Type loose requests like "make it premium", "modernize the whole site", "rebuild for conversions", "give it a fresh look" and the builder does a real designer pass end-to-end, not a single edit.
- Every generated site picks a distinct designer-grade look based on the business — colour direction, typography pair, section rhythm, backdrop, motion — instead of the same shell with different words.
- The builder chat shows what it's doing while it works — "Choosing a look… Rewriting your headline… Adding a proof strip… Ordering for conversions… Checking mobile" — so the wait feels like a real teammate, not a spinner.
- Three big one-click actions above the request box: "Redesign it premium", "Rebuild for conversions", "Refresh the look" — plus the free-text box.

## What changes under the hood

- New **Premium Theme Library** (`src/lib/builder/premium-themes.ts`): 16 designer themes (colours, font pair, backdrop, hero/CTA/form/body effects), each labelled with the industries it fits. Selection is deterministic per business (industry + name hash) so the same workspace gets a coherent look across turns unless the owner asks to change it.
- New **Whole-site upgrade planner** (`src/lib/builder/site-upgrade.ts`): given an existing workspace, produces a bounded plan that picks a theme, rewrites weak headlines toward strong hierarchy, adds missing high-converting sections (proof, FAQ, CTA, contact) using existing kinds, and reorders sections in the proven conversion sequence — all as existing `AgentAction`s, so the current apply/verify/rollback pipeline keeps guarding it.
- **Interpreter widened** (`src/lib/builder/interpreter.ts`): new verb families for redesign/modernize/premium/convert/rebuild/refresh/overhaul, mapped to the whole-site upgrade intent. Existing narrow intents (rewrite one headline, change one colour) stay untouched.
- **Deterministic planner extended** (`src/lib/builder/deterministic.ts`): when the interpreter reports a whole-site intent, delegate to the new upgrade planner instead of the per-section rules. Never fabricates facts — headlines are rewritten only from existing business facts (name, tagline, services, city).
- **AiRequestPanel** (`src/components/app/AiRequestPanel.tsx`): three preset chips above the box that submit the matching request; the timeline line already exists — extend its stages so the owner sees the real steps.

## Guardrails (unchanged, re-verified)

- $0 external AI — no Lovable AI, no Gemini, no OpenAI calls added; native engine only.
- No fabricated facts, reviews, awards, prices, credentials, results.
- Uses only existing `AgentAction` kinds — the existing apply/verify/rollback path guards everything.
- Preserves owner-authored content: rewrites a headline only when it is empty or a template default, never overwrites a headline the owner wrote.
- Publishing readiness gate (≥95) still gates going live.

## Tests

- `premium-themes.test.ts` — every theme passes contrast, every industry maps to at least one theme, selection is stable per (industry, name).
- `site-upgrade.test.ts` — a bare workspace gets a full upgrade plan; an already-polished workspace gets a small refinement plan; owner-authored headlines are preserved; no action targets a missing id.
- `interpreter.test.ts` additions — "make it premium", "modernize the whole site", "rebuild for conversions" all resolve to the whole-site intent; "change the hero headline to X" still resolves to a single-section edit.

## Not in this pass

- No LLM planner (would violate the $0-AI rule).
- No new database tables, no schema migrations, no billing/auth changes.
- No changes to publishing, custom domains, RLS, Stripe, or the funnel.
