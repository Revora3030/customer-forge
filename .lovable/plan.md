# Fix why builds get cut off, and keep GPT-6.1 Sol as the planner

## What the records show
- The "Elite mobile detail" build has started 3 times. Each run died about 3 minutes in, always while the page plan was being written. It is waiting to retry at 15:10 UTC.
- No AI model failed. GPT-6.1 Sol answered every time, but a full page plan takes it about 90 seconds.
- The AI time limit is 90 seconds per answer. On one run it stopped an answer that was almost finished. On another, the answer arrived but the run had already been shut down, so the saved progress never moved.
- The open builder page usually starts the build itself, so the build runs inside the page's connection. When that connection drops (phone locks, the page reloads, the host closes it), the build dies with it. The 10-minute background check then takes over and the build restarts.
- The screen said "generating your pictures" during page planning. No pictures were being made.
- Each message you sent got the same "your AI team is finishing…" reply twice.

## Changes
1. **Undo my model change.** Page planning goes back to the normal list, with GPT-6.1 Sol first.
2. **Builds no longer depend on the open page.** The builder page only asks the background worker to start. It never runs the build itself. The background check goes from every 10 minutes to every minute, and starts work as soon as a build is queued.
3. **Builds work in short, saved turns.** Each worker turn stops before the host can cut it off. It saves what is done and hands the rest to the next turn right away. Slow answers then finish across turns instead of starting over. Steps that are already done are never paid for again.
4. **Long answers get enough time.** The time limit grows with how long the answer will be: about 3 minutes for a full page plan, and still 90 seconds for short answers. If an answer stops arriving partway, the time limit cuts it off.
5. **Honest progress.** The screen shows "planning your pages" while the plan is being written. "Generating your pictures" only shows when pictures are actually being made. Progress no longer sits at a stale 46%.
6. **One reply per message.** Find out why the chat posts the waiting reply twice, and fix it so you get one reply.
7. **Better records.** Each build attempt records who started it, when it ended and why. Future problems can then be traced straight away.
8. **Finish the current build.** Once these fixes are live, the "Elite mobile detail" build continues from its last saved step. Before I call it done, I check that it finishes with saved pages that open again.

## Stays the same
- Your spending caps, 5 builds per day, approvals, no invented facts and the $350 setup price.
- Cancelled builds never restart on their own, and nothing is published without your approval.

## Verification
- Tests for: turn handoff and resuming, time limits based on answer length, the page never running a build itself, the stage names, single replies, and cancelled builds staying stopped.
- Run the full test suite, type checks and build. Then read back the live build's attempts, model calls and saved pages from the records.

## Technical details
- Revert `PAGE_PLAN_MODELS` / `preferModels` in `ai-page-architecture.server.ts`.
- `pumpSiteEngineQueue` and `site-engine.hooks.ts`: stop calling `drainSiteEngineQueue` from browser requests. Replace it with a non-blocking kick to `/api/public/jobs/site-engine` through `runInBackground`. Keep the membership check.
- `revora-site-engine-backstop` schedule: `*/10` becomes `* * * * *` through `update_http_schedule`. The single-flight lease prevents overlapping runs.
- `executeJob`: add a soft wall-clock budget (about 150s, set by env). At a stage boundary or between AI calls, save the stage checkpoint, set the job to `queued` with the lease released, and leave `attempts` unchanged. Add a `yield` outcome so a handoff is not counted as a failure, then kick the next turn.
- `thinker.server.ts` / `router.server.ts`: per-attempt `timeoutMs` scales with `maxOutputTokens`, capped by the chain deadline. Streaming responses also get an idle timeout.
- `noteStage`: add an "architecture" stage label. Only the picture runner reports "generating your pictures".
- Builder chat defer path: dedupe the deferral reply per user message by request ID.
- `build_attempt_lost` / new `build_attempt_started` rows: record the executing invoker and start time.
- Update `AGENTS.md`: the rule that builds run only in worker turns and never inside a browser request.
