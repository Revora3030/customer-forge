# Builder speed, vision QA and worker lease hardening

This change fixes the root causes behind slow first builds (12m+), visual review failures and builds stuck on
"Finishing your first website…". Pricing, trial, tenant isolation/RLS and schemas are unchanged. Sol still authors,
Terra still audits and Luna still verifies.

## 1. Vision payload serialization
- New `toImageDataUrl()` (`src/lib/ai/data-url.ts`) turns raw base64 into `data:<mime>;base64,<payload>`. It also
  normalizes existing data URLs and passes `http(s)` URLs through untouched.
- `inspectPhoto` always sends a full data URL. The OpenAI-compatible adapter (Cloudflare, OpenRouter, NVIDIA, Groq,
  Hugging Face, and others) also normalizes every image part, so raw base64 can no longer cause
  `400 invalid image URL`.

## 2. Vision model pool purification and fast routing
- `visionCapableModel()` (`src/lib/ai/vision-models.ts`) is a strict capability gate. Text-only families (`glm`, `gpt-oss`,
  `nemotron`, coders, image generators, and others) are never sent a picture.
- The router enforces the gate for every `role: "vision"` call (`roleCapability`), covering both configured defaults
  and live-discovered models, so text-only models can no longer enter the vision chain.
- Preferred fast vision endpoints go first in the free group (`fastVisionFirst`): NVIDIA NIM
  `meta/llama-3.2-11b-vision-instruct`, then Workers AI `@cf/meta/llama-3.2-11b-vision-instruct` and
  `llama-4-scout`, then Gemini Flash.
- `AiRequest` accepts `timeoutMs` and `chainDeadlineMs`. Both can only lower the router's ceilings. Visual review uses
  **9s per attempt** and a **25s** chain budget.

## 3. Infrastructure glitches no longer cause reshoots
- `PhotoVerdict` now has `contentRejected` (Terra saw the pixels and found a defect) and `reviewFailed`
  (timeout, network, 5xx or adapter error).
- When a review fails for infrastructure reasons, the review alone is retried once. The picture is never regenerated.
- `shouldReshoot(verdict)` is the only gate for reshoots. `acceptedForUse(verdict)` keeps a picture whose review was
  unavailable under the safe fallback. That picture was still made from a brief that forbids text, logos and claims,
  and it still has to pass the deterministic first-build image QA gate.
- Set `VISUAL_REVIEW_UNAVAILABLE_POLICY=reject` to leave such slots empty instead (still with no reshoot).
- A genuine rejection now gets **one** corrected reshoot (it used to be up to two).

## 4. Bounded concurrent image generation
- `mapConcurrent()` (`src/lib/concurrency.ts`) runs first-build pictures in parallel, 3 at a time by default
  (`FIRST_BUILD_IMAGE_CONCURRENCY`, max 6). Results keep campaign order.
- A shared `createBackoffGate()` makes every lane pause after a 429. It never fans out retries.

## 5. Worker lease heartbeat and deadlock recovery
- The heartbeat fires every `heartbeatIntervalMs()` (45s for the 180s lease, always under half the lease). It logs
  every renewal error, skips overlapping beats, and detects a lost lease (the fenced update matches no row). It then
  stops, and the failed run does not requeue or fail a job that a newer attempt owns.
- `closeAbandonedJobs` also recovers `processing` rows that have no lease at all. These used to be unclaimable
  because `NULL < now` is false. Such a row is re-queued if it has attempts left, otherwise it is failed with
  a plain "press Build to try again" message.
- Reclaiming an expired-lease job is logged and tags the row with a recovery message. A successful run clears it.
- `src/lib/builder/job-liveness.ts` is the shared definition of a **stalled** job: `processing` whose lease lapsed
  more than 60s ago with no row updates.
  - `useLatestGenerationJob` keeps nudging the worker every 15s while a job is stalled, so the sweep re-queues or
    closes it promptly. This also releases the chat agent, which defers edits while a build is queued or processing.
  - The live build panel (`BuildLive`) shows "Reconnecting to your build…" with a clear explanation instead of an
    endless shimmer.

## Settings
| Variable | Default | Purpose |
| --- | --- | --- |
| `FIRST_BUILD_IMAGE_CONCURRENCY` | `3` | Parallel first-build pictures (1–6) |
| `VISUAL_REVIEW_UNAVAILABLE_POLICY` | `accept` | `reject` leaves slots empty when review is down (no reshoot) |

## Tests
`vision-hardening.test.ts`, `first-build-images.pipeline.test.ts`, `concurrency.test.ts`, `job-liveness.test.ts`,
`site-engine.lease.test.ts`.
