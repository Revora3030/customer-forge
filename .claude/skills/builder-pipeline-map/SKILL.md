---
name: builder-pipeline-map
description: Map of the Revora website builder (src/lib/builder) so you can jump to the one stage you need without reading 389 files. Use before changing or debugging first builds, chat edits, compositions, images, QA gates or publishing.
---

# Builder pipeline map

Start from the symptom, open only the file(s) in that row, and run that file's sibling test.

| Symptom / area | Files (src/lib/builder unless noted) | Test to run |
|---|---|---|
| Build never starts, stalls, or resumes wrong | `src/lib/site-engine.worker.server.ts` (read by range), `durable-worker-kick.server.ts`, `job-liveness.ts`, `resume-stage.ts`, `job-stage-checkpoints.ts`, `capacity-wait.ts` | `job-stage-checkpoints.test.ts`, `capacity-wait.test.ts` |
| Intake / brief | `intake-sanitize.ts`, `first-build-request.ts`, `business-facts-precheck.ts` | `first-build-request.test.ts` |
| Pages and outline | `ai-page-architecture.server.ts`, `ai-page-architecture.ts`, `page-depth.ts`, `site-plan-coverage.ts` | `ai-page-architecture.test.ts` |
| Brand, colour, concept, wording | `collective-first-build.server.ts`, `collective-sections.server.ts`, `ai-brand-identity.server.ts`, `collective-copy.ts`, `wording-checkpoint.ts` | `collective-first-build.*.test.ts` |
| Section designs (compositions) | `first-build-compositions.server.ts`, `first-build-section-checkpoints.ts`, `composition-tree.ts` (`validateComposition`), `cinematic-primitives.ts` | `first-build-compositions.test.ts`, `cinematic-gates.test.ts` |
| Rendering on the site | `src/components/site/CompositionRenderer.tsx`, `src/components/site/SitePageView.tsx` | nearest `*.test.tsx` |
| Pictures and hero video | `first-build-images.server.ts`, `first-build-image-qa.ts`, `first-build-picture-gate.ts`, `hero-stock-video.server.ts` | `first-build-images.test.ts`, `first-build-picture-gate.test.ts` |
| Header/footer chrome | `first-build-chrome.server.ts`, `site-chrome.ts`, `chrome-repair.ts` | `chrome-repair.test.ts` |
| Quality gates before completion | `quality/generated-site-gate.server.ts`, `content-integrity.ts`, `content-completeness.ts`, `link-integrity.server.ts`, `quality/mobile-390.ts`, `first-build-safety.ts` | `quality/generated-site-gate.test.ts` |
| QA repair loop | `qa-loop.server.ts` (`runQaRepairLoop`), `qa-auto-repair.ts`, `browser-qa-intelligence.ts` | `browser-qa-intelligence.test.ts` |
| Chat edit plans | `chat-jobs.server.ts`, `ai-agent-plan.server.ts` (`planWebsiteChangesWithAi`), `edit-scope.ts` | `chat-jobs.test.ts`, `edit-scope.test.ts` |
| Applying a plan | `apply-plan.ts`, `apply-diff.ts`, `apply-report.ts` | `apply-plan*.test.ts` |
| AI calls and spend | `src/lib/ai/thinker.server.ts`, `src/lib/ai/router.server.ts`, `build-spend.ts` | `build-spend.test.ts` |
| Prompts | `prompt-regression/` | `npm run test:prompts` |
| Trade playbooks | `playbook-catalog.ts` (+ generated `playbook-catalog.generated.ts`: never read whole), `reference-standard.ts` | `category-playbooks.test.ts`, `reference-standard.test.ts` |
| Publish | `src/lib/production.functions.ts` `publishSiteNow` (the only publish path) | `src/lib/production-*.test.ts` |

## How to use it
1. `rg -n -m 5 '<symbol>' src/lib/builder/<file>` to find the line; read ~60 lines around it.
2. Check `src/lib/builder/AGENTS.md` for the invariant that governs that stage before changing it.
3. Run only the sibling test, then `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`.

If a row's file has moved, find it with `rg --files src/lib | rg '<name>'` and update this map in the same change.
