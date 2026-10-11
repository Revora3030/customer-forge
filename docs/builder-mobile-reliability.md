# Builder mobile reliability: scoped repair and rollout

## Changes in this PR

- Add a standalone Bun generation runner that calls the existing database-leased drain directly, outside a browser request or serverless HTTP response.
- Await each drain; preserve the existing queue pause, lease, cancellation, attempt fences, tenant boundaries and build pipeline.
- Add validated idle polling, bounded error backoff and graceful signal handling. No hard timeout kills an in-flight build or starts overlapping work.
- Re-read persisted builder queries on visibility, focus, pageshow and online events. Resume refresh does not enqueue builds, replay edits or bypass approvals. Inactive queries are marked stale without being fetched.
- Add unit tests for resume event handling, listener cleanup, query filtering, polling validation, sequential execution and retry backoff.

## Required deployment step

Merging this PR alone does not start the standalone worker. Run it on a supervised, always-on server with Bun, the repository dependencies and the same backend/provider configuration as the application. Do not deploy it as a GitHub Pages script or a short-lived background HTTP task.

From the repository root, after installing dependencies:

```sh
bun run src/lib/builder/standalone-worker.server.ts
```

Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY through the host secret manager. Include the existing AI provider configuration used by generation. BUILD_WORKER_POLL_MS is optional; default 2000, accepted range 1000-60000. Never put service-role keys or provider credentials in frontend variables, repository files or PR comments.

Verify the Supabase project matches the application's configured project before starting the worker. Start one runner initially, configure supervisor restart on process failure, and allow a shutdown grace period long enough for an active build. A hard process termination relies on the existing database lease/reclaim behavior; this PR does not add per-stage durable checkpoints. Keep existing scheduler/HTTP paths available as fallbacks; database claim fences arbitrate concurrent runners.

## Verification required before merge

```sh
npm run typecheck
npm run lint
npx vitest run src/lib/builder/resume-sync.test.ts src/lib/builder/worker-loop.server.test.ts
npm test
npm run build
```

These checks have not been executed in the assistant environment. Review CI before merge. Test the worker's dynamic imports and provider calls on the target Bun host before production rollout.

Acceptance test: queue a real authorized build, switch to another phone app, confirm job progress continues in the database with no browser connection, then reopen the builder and confirm the preview refreshes without a second job. Also test network loss, worker shutdown, expired leases, operator queue pause and a legitimate expired subscription.

## Known limitations / remaining work

This is not an 'everything fixed' certification. It does not establish the cause of the reported 14-minute build, shorten AI provider execution, remove the chat's 15-minute first-build wait, or make chat planning/apply batches server-owned. The standalone runner processes generation_jobs, not the browser-managed chat request queue. Durable chat orchestration, per-stage generation checkpoints, measured latency budgets and live job-stage diagnostics remain separate work. Preserve billing, authorization, creative-AI and content-integrity gates. No production migration, deployment or merge is performed by this PR.
