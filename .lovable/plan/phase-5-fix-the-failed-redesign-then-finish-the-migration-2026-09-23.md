# Phase 5 — fix the failed redesign, then finish the migration

Your screenshot shows "Redesign it premium" on Supreme detailing failing with "I couldn't design this change right now." The site was left untouched, which is the correct safe behaviour. But the redesign should have worked, and the cause is not confirmed yet.

## 1. Find and fix why the redesign failed (first)
- Read the builder's recent run records and AI request logs for this site to see which model was called, what it sent back, and which check rejected it.
- Likely causes to confirm or rule out:
  - Sol answered, but the reply was rejected. Possible reasons: a malformed layout, a failed safety check, or the old "pick a look" wording now having nothing to pick from.
  - Sol, Terra or the backup models errored or ran out of time, and the free squad never got the request.
  - Earlier phases removed the ready-made design options, and the redesign step still expects one.
- Fix only the confirmed cause. The redesign must come from the AI, never from a stock layout.
- Rerun the same request on the preview and confirm the site visibly changes.

## 2. Make sure a failed model only hands over to another model
- Trace the redesign, first-build, edit and picture steps through the backup order: main specialist → alternate specialist → zero-cost allowance models → free squad → clear "try again" message.
- Add tests showing each step moves to the next model when one fails, and never uses old design rules.
- Improve the failure message so it says what happened, for example "all design models are busy", instead of a generic line.

## 3. Make the AI's own layouts the default
- First builds, site-wide redesigns and section edits ask the AI for its own layouts by default. The old fixed section types stay only so existing sites still display correctly.

## 4. Delete leftover old code
- Remove the unused archetype, fingerprint, story/motion pass, conversion engine and first-build compiler parts, plus their tests. Keep the safety guard tests so these can't come back.

## 5. Full quality check
- Type check, lint, all tests and production build.
- Run a real redesign on the preview and look at it on phone and desktop.

## Not changing
- Approval is still required for removals, billing and account actions.
- Truth checks, security, tenant isolation, rollback and publishing stay as they are.
- Nothing reaches revoragrowthsystems.com until you publish.

## Still blocked
- PR #175 still needs write access to the godbody4040-oss GitHub account.
