# Phase 6 — Finish the AI-as-sole-creative-authority migration

## What you get
- Every first build, redesign and edit uses the AI's own custom layouts by default, not just the builder chat.
- When you have told the AI to build on its own, ordinary design changes run without asking you. Approval stays for removing pages or sections, billing and account actions.
- Proof, through tests, that when a model fails the job only passes to another model and never to old design rules.
- Leftover old design code that no longer makes choices is retired, while existing customer sites keep showing exactly as they do now.
- A full quality check at the end.

## Steps
1. **AI layouts by default.** The builder's planning instructions (first build, redesign, edit) will ask the AI for custom layouts for every new or restructured section. The old fixed section types stay only so existing sites keep displaying. A check will reject a plan that falls back to a fixed section type for a new section when a custom layout was requested, and the AI will be asked to fix it.
2. **Autonomous approval.** The approval step in the site agent and the autonomous release loop will be limited to destructive, billing and account actions. When autonomous mode is explicitly on, creative changes run straight away. Restore points are saved before every change, so undo keeps working.
3. **Fallback proof.** The path goes: main specialist, then alternate specialist, then no-cost models, then free providers, then a clear "try again" state. Tests will cover each handover, including cut-off, empty and 401/429 replies.
4. **Retire leftover modules.** The fingerprint, story, motion-pack and first-build-creative helpers still used by live pages will become read-only compatibility readers for stored site data. Their decision logic will be deleted, and the firewall test will stop it from coming back.
5. **Quality check.** Typecheck, lint, all tests and a production build. I'll also do a quick check that an existing site still shows at phone and desktop sizes.

## Not in this phase (blocked on you)
- PR #175: I need write access to the godbody4040-oss repository.
- Terra (gpt-5.6-terra): its access needs to be turned on for your OpenAI key.
- Live runs (redesign retry, video clip, voice note, Astra conversation, health report email) need you to try them in the app.

## Technical details
- Files: `ai-agent-plan.server.ts` (prompt default + composition-required check), `elite-plan-guard.ts`, `site-agent.ts` / `site-agent.server.ts` / `site-agent.functions.ts`, `autonomous-release-loop.ts`, `execution-blueprint.ts`, `router.server.ts` / `luna.server.ts` / `hall-of-fame.server.ts` (fallback tests), `authority-firewall.test.ts`.
- There are no database migrations. Stored component data stays compatible, and the renderer keeps its legacy cases.
- `roadmap.md` will be updated to mark Phase 5c and Phase 6.
