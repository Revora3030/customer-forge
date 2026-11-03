# src/lib/builder — Claude Code notes

Read `./AGENTS.md` (builder invariants) before editing. 389 files; never list or read them all. Use the `builder-pipeline-map` skill to find the one stage you need.

## Pipeline in one line each
- **First build** (durable worker `src/lib/site-engine.worker.server.ts`): intake (`intake-sanitize`, `first-build-request`) → page architecture (`ai-page-architecture.server`) → collective passes (`collective-first-build.server`, `collective-sections.server`, `ai-brand-identity.server`) → section designs (`first-build-compositions.server`) → images (`first-build-images.server`, `first-build-image-qa`, `first-build-picture-gate`) → chrome (`first-build-chrome.server`) → gates (`quality/generated-site-gate.server`, `content-integrity`, `link-integrity.server`) → QA repair (`qa-loop.server`). Each finished stage checkpoints (`job-stage-checkpoints`, `first-build-section-checkpoints`, `wording-checkpoint`, `resume-stage`).
- **Chat edits**: `chat-jobs.server` (durable job, owner session) → `ai-agent-plan.server` (`planWebsiteChangesWithAi`) → `edit-scope` (drop out-of-scope actions, fail-open) → `apply-plan` / `apply-diff` → `apply-report`.
- **Composition model**: `composition-tree.ts` (types, `COMPOSITION_PRIMITIVES`, `validateComposition`) rendered only by `src/components/site/CompositionRenderer.tsx`.
- **AI calls**: `src/lib/ai/thinker.server.ts` (`callBestThinker`) through the shared router; never add a second paid-reservation path.

## Never read whole
- `playbook-catalog.generated.ts` (142 KB, generated from playbook configs; edit the source and regenerate).
- `composition-tree.ts`: `PRIMITIVE_GUIDE` (lines ~76–111) has 1 KB lines; `validateComposition` spans ~740–1215. `rg -n` the symbol, then read ~40 lines around it.
- `collective-first-build.server.ts`, `first-build-compositions.server.ts`, `visual.ts` (65–70 KB each): read by range.
- `prompt-regression/snapshots/*.txt` and `__snapshots__/`: diff them, don't read them.

## Tests
- Each module has a sibling `*.test.ts`; run just that file: `npx vitest run src/lib/builder/<name>.test.ts`.
- Prompt snapshots: `npm run test:prompts`. A prompt change shows as a snapshot diff; update with `npx vitest run src/lib/builder/prompt-regression/prompt-regression.test.ts -u` only when the prompt change is intended (see the `fix-snapshot-tests` skill). `*.live.test.ts` calls real models: never run it unless asked.
- Visual standard checks: `verify-customer-site-visuals` skill.

## Rules that bite
- Creative choices are AI-authored; never seed deterministic templates or keyword-classify requests.
- Never invent prices, phone numbers, ratings or statistics; offer cards price only from a real named service.
- Saves must return exactly the requested tenant-scoped row; zero-row writes are failures.
