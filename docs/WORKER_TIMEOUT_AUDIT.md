# Worker slice vs edge-timeout audit (B14-1)

Date: 2026-10-31 (America/New_York). Method: read the code on `lovable-sync`. No live data was read for this audit (see "Not measured").

## Question
Can any caller or proxy cut a worker response that is held for more than ~100 s, and if it does, does the slice die or keep going?

## What the code does today (read, not measured)

| Piece | Value | Where |
|---|---|---|
| Platform request limit assumed | 300 s | `PLATFORM_REQUEST_LIMIT_MS` in `site-engine.worker.server.ts` |
| Slice budget | 240 s (0.8 x 300 s) | `RUN_BUDGET_MS` |
| No new stage starts with less than | 90 s left | `NEXT_STAGE_RESERVE_MS` |
| In-process kick slice | 20 s | `KICK_SLICE_BUDGET_MS` (`kickWorker` fallback in `site-engine.functions.ts`) |
| Lease length / heartbeat | 300 s lease, renewed on an interval | `LEASE_SECONDS`, `heartbeatIntervalMs()` |
| Stalled-lease grace | 60 s | `STALLED_LEASE_GRACE_MS` in `job-liveness.ts` |
| Worker route response | one slice per request (`max: 1`), body is `keepAliveJsonResponse`: one space at once, then one every 15 s until the JSON result | `src/routes/api/public/jobs/site-engine.ts`, `builder/keep-alive-response.ts` |
| pg_net caller | `call_revora_job(path, timeout_ms = 900000)` from `requestDurableWorkerRun`; the cron backstop uses the same function (cron entry lives only in the live DB, not in the repo) | `durable-worker-kick.server.ts` |
| GitHub runner | opt-in (`SITE_ENGINE_RUNNER_ENABLED=1`), every 5 min, client abort at 25 min, job `timeout-minutes: 27` | `.github/workflows/site-engine-worker.yml`, `scripts/run-site-engine.mjs` |
| Post-enqueue kick | tries pg_net first (RPC returns at once, the DB holds the connection); only if that fails, an HTTP POST that awaits the whole response inside `runInBackground`/`waitUntil`; last resort is a 20 s in-process slice | `kickWorker` |

## Findings

1. **The 100 s idle cut-off is already handled on the worker route.** Every caller that holds the worker response (pg_net, runner, HTTP kick, pump) receives a byte every 15 s from the first moment, so the connection is never idle for 100 s. A 240 s slice is therefore not an idle-timeout case. This is established from code. It was not observed on live traffic in this audit.
2. **The cut-off was real once.** The comment on `keepAliveJsonResponse` records three builds cut off ~90-110 s into a page plan before the keep-alive existed. That is the repo's own note; this audit could not re-measure it.
3. **Total-duration limits are not covered by the keep-alive.** Whitespace does not extend a platform wall-clock limit. The design answer is the slice budget: 240 s of an assumed 300 s, hand-back to the queue at stage boundaries, and a 90 s reserve before a new stage. The 300 s figure is an assumption in code; this audit did not confirm the live platform limit.
4. **The one path that can drop a held connection is the HTTP kick fallback.** It awaits the full response inside `waitUntil`, and a `waitUntil` promise on Workers only gets a short grace after the originating response. It runs only when the pg_net RPC fails. If it is dropped, the slice's outcome depends on how the platform treats the closed request. The code does not assume it keeps going: the lease, its heartbeat, `stage_checkpoints` and `section_checkpoints` let the next slice (pg_net backstop, runner, or the owner's pump) resume after the 60 s stalled-lease grace.
5. **Whether a disconnected slice dies or continues was not verified.** `keepAliveJsonResponse` catches a closed stream and says the lease and checkpoints carry the build. Nothing in the repo proves the isolate keeps running after the client disconnects.

## Conclusion
No real cut-off was shown. No code was changed: no early return, no lower budget, no new keep-alive (the existing one is enough for the idle case). If live data later shows slices ending without a hand-back or a completed stage, the next step is to lower `RUN_BUDGET_MS` or return early through the existing hand-back, not to add streaming.

## Not measured (no invented numbers)
- **Slice duration p50 / p95: not available.** `generation_jobs.stage_timings` stores per-stage milliseconds on the job. It does not store one value per slice, and no slice log exists in the repo. Reading real rows needs the live database. This audit had no sanctioned read path: the Lovable connector cannot see the live project (`project_not_found`), and the agent gateway (`/api/public/agent/builds`) needs `REVORA_AGENT_API_KEY`, which only the owner holds.
- Live platform wall-clock limit, the live `cron.job` entry for `call_revora_job('site-engine', 900000)`, and Cloudflare/proxy logs.

## How to get the numbers (read-only)
Run as an owner with the agent key, per stage:
`select id, status, stage_timings, started_at, completed_at from generation_jobs where completed_at is not null order by created_at desc limit 200;`
Sum or take each stage and compute p50/p95. For per-slice counts, read the `handback` checkpoint (`{count, point}`, capped by `MAX_HAND_BACKS` = 12) in `stage_checkpoints`. Treat any slice over 100 s with no hand-back and no completed stage as the sign of a real cut-off.
