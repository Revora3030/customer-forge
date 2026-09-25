# Finish the 6 open items

## 1. Real builds and edits use the full AI team
- The first build, redesigns, section redesigns, visual repair and style changes all go through the same team process:
  advisers in parallel -> Sol decides -> site is built -> screenshots -> Terra reviews -> Sol picks repairs -> repeat until checks pass.
- Small edits keep using one suitable model, with no fan-out.
- Advisers can only make suggestions. Only Sol's decisions change the site. Disagreements are settled by checking facts and screenshots, never by majority vote.

## 2. Honest record of every model's abilities
- Scan every connected provider's full model list.
- Test models on the real jobs they could do and save the results per job, with the date each was checked.
- Mark models that are unavailable, retired, duplicates or safety-only, and keep them out of normal work.
- Choose models by tested results first. Cost is the last thing considered.

## 3. Record of which models built each site
- Save one entry per model call: build, stage, job, model, why it was picked or skipped, speed, success, whether it passed checks, cost, and what it changed.
- Add an admin view showing: models found, tested, healthy, used, contribution per model, failures and cost.
- Nothing says "all models took part" unless the record proves it.

## 4. Revora site to 95 and published
- Make the two small header buttons at least 44px tall on phones.
- Check whether the slow-load and big-download warnings only happen on the test server. If they do, stop them counting against the score there.
- Re-run the visual check, approve, publish, then check the live site on phone and desktop.

## 5. Second, different industry build (needs you)
- Needs one real business's name, services, contact details and hours. I won't invent them.
- Once you send them, it runs through the full team process, visual check and approval.

## 6. Northline rebuild and final review
- Rebuild Northline through the new team process and pass its visual check.
- Full security scan and database checks. Review of billing, trials, checkout and publishing locks.
- Run the full test suite and type checks.

## Technical details
- Connect `buildOrchestrationPlan` into `router.server.ts` / `ensemble.server.ts` for build and redesign purposes, replacing the single-chain path for those jobs.
- New tables `ai_model_registry` (per model and per ability, with scores) and `ai_team_trace` (per call, per build). Admin-only access, with grants and row security.
- Extend `benchmark.server.ts` to write per-ability results. The scan runs as an admin action and on a schedule.
- Header button change in the site header link styles (min-height 44px).
- Order of work: 4 -> 3 -> 2 -> 1 -> 6. Item 5 starts when your details arrive.
