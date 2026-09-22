# Remove the pre-AI rule-based builder from every live path

The original engine built websites from fixed rules: an intent parser, an industry playbook that decided which sections a business "should" have, lookup-table layout decisions, and canned wording. Those rules are still reachable in the running app. This removes their authority everywhere, so the AI models are the only thing that ever decides structure, layout, wording, colour, typography or imagery.

Safety machinery that only *checks* work — truth/claim gates, prompt security, style sanitisation, the native quality review, rollback — stays exactly as it is. Only the rule-based *authoring* goes.

## What changes

1. **Chat/edit requests** — the server planner currently tries the rule-based brain first and escalates to the models only when it can't cope. That first attempt is removed: every request goes to the model team, and when the models can't answer, the owner is told plainly and nothing changes (the behaviour the main builder path already has).

2. **First build** — AI page architecture becomes the only source of pages and sections. The industry playbook no longer orders the home page, and no rule-based section list can stand in for it. If the models don't produce an architecture, the build stops with a clear message instead of falling back to a generic layout.

3. **Rule-based authoring modules retired** — the fixed layout tables, canned copy/FAQ/CTA library, industry section playbooks and the two rule-based compilers are removed from the app, along with the tests that assert that behaviour. Anything still needed for reading a request's *intent* (which page/section the owner is pointing at) is kept, because that is targeting, not design.

4. **Onboarding summary** — the goal/checklist summary shown during onboarding keeps working, but it stops being treated as a website design and is no longer fed into the builder as structure.

5. **No silent gaps** — after removal, every path either produces AI-authored output or reports an honest failure. No path may quietly emit a default page, default section set, default palette or default wording.

## Technical detail

- `src/lib/site-agent.server.ts` → `planChanges`: delete the `buildAutonomousPlan` fast path and its early return; keep the model call, attachment handling and picture-intent detection.
- Remove: `src/lib/builder/deterministic.ts`, `master-engine.ts`, `autonomous-brain.ts`, `autonomous-loop.ts`, `design.ts`, `copy.ts`, `archetype-playbook.ts`, `literal.ts`, `site-upgrade.ts` rule planner, plus their `*.test.ts` siblings and the `plan-quality.ts` type import.
- Keep `interpreter.ts` (used by `context-targeting`, `visual-composition`, `visual-intelligence`, `autopilot` for target resolution only).
- `industry.ts`: keep it only as descriptive industry metadata for prompts/SEO; remove `homeSections` consumption in `site-materialize.server.ts` and the `playbookFor` ordering in `site-engine.worker.server.ts`.
- `site-engine.worker.server.ts`: make `ai-page-architecture.server` outcome required — throw with the existing failure surface when `architecture` is null or rejected; keep `synthesizeNativeFirstBuild` as the post-hoc quality gate and keep `ai_generations` logging.
- `website-plan.ts` / `generateWebsitePlan`: retained for onboarding and `queries.ts` summaries; remove its use as builder input.
- Follow-up checks after the edits: full vitest suite, typecheck, lint, build, then a preview rebuild request to confirm an AI-authored result and an honest failure when the models are unavailable.
- Nothing about RLS, tenant isolation, Stripe, publishing or custom domains is touched. Publishing stays on your Publish button.
