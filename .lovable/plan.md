# Whole team improves every site, and nothing makes it worse

## Goal
Every AI model on your roster helps improve each customer site. A change goes live only when it measurably beats the current version. Sol stays the only writer and designer, so the site keeps one voice and one look.

## How the team will work together

```text
Astra (understands the request)
   -> Sol drafts the site or the change
   -> Review panel (runs in parallel, each with its own job):
        gpt-5.5 / gpt-5.4 ... design and layout critique
        o3 ...................... logic, structure, conversion flow
        search model ............ checks the facts against the owner's real info
        Luna .................... SEO, metadata, page speed
        free minis .............. accessibility, phone layout, spelling
   -> Sol revises using the panel's notes (it does not paste their text in)
   -> Terra scores old vs new and picks the winner
   -> Only the winner is saved (with a restore point)
```

## Guarantee that nothing gets downgraded
- **Side-by-side gate:** Terra scores the current and proposed versions on design, clarity, conversion, SEO, accessibility, phone layout and truthfulness. The new version must win overall and must not lose on any safety area (truthfulness, accessibility, phone layout).
- **If it loses:** the site stays exactly as it is, and the chat says why.
- **Automatic checks still run:** real screenshots at phone and desktop sizes, broken-link and contrast checks, and the fact checks. A failure blocks the change.
- **Restore point before every save**, with one-tap undo in chat.

## Improvement rounds
- First builds and "Redesign with AI" run up to 2 panel rounds. A round only continues while scores keep going up.
- Small chat edits get a light panel (Luna plus the free minis) so they stay quick and cheap.

## Cost control
- Panel reviewers get short outputs (critique notes only).
- Everything stays inside the existing monthly caps, including Luna's $100. When a cap is reached, the panel shrinks to the free models. It never skips Terra's gate.

## Technical details
- New `src/lib/builder/review-panel.server.ts`: runs reviewers in parallel with `Promise.allSettled`, each with a fixed role prompt and a strict JSON schema `{area, issues[], severity}`. Failed reviewers are skipped and logged.
- New `src/lib/builder/improvement-gate.server.ts`: Terra compares the two versions using a rubric and returns per-area scores. The gate accepts only if the total rises and no protected area drops.
- Wire into `first-build-compositions.server.ts`, the redesign path, and the edit apply path in `site-agent.functions.ts`, before persistence and after the existing validators.
- Record model usage for every reviewer through the existing usage recorder. Honor the existing router failover and caps.
- Save a gate report (scores, reviewers used, accepted or rejected) with each run, so the Orchestration Center shows it.
- Tests: the gate rejects a lower-scoring version, rejects a drop in a protected area, keeps the site unchanged on rejection, and still works when every reviewer fails.
