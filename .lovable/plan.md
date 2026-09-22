# Finish the quality-first AI orchestration

The new orchestration layer (specialist six, capability contracts, quality-first scoring, gap detection, capability-aware failover, probes, telemetry, plan builder) is written but not yet connected to the live builder, not shown in the admin screens, and not yet verified. This finishes that work.

## 1. Connect it to the real model selection

- Order candidates by the quality-first score (capability, compatibility, quality, reliability, context, modality, safety, speed — cost last) instead of trying free options first.
- Keep every safety control exactly as it is: the zero-cost switch, spend caps, per-tenant cooldowns, the "free only" administrative mode, and the deterministic engine that takes over when no model is reachable.
- Remove the arbitrary limit of 4 candidate models per provider so the full discovered pool can be considered, while keeping a sensible retry depth for a single request so one call never turns into a long stall.

## 2. Scan the whole live catalogue

- Refresh the full discovered catalogue rather than a fixed sample, with no assumed model count.
- Record capabilities only from provider data or a real probe — never guessed from a model's name — with "unknown" kept distinct from "unsupported".

## 3. Specialist ownership stays first-class

- The six named specialists lead their own domains; any other model joins only when a probe proves it covers something the six genuinely cannot for that exact task.
- Existing first-build behaviour (creative direction, design fingerprint, screenshot reference, image lanes, transcription, checks and repair) keeps working and gains the explainability record.

## 4. Admin visibility

In the AI area of the admin screens, show honestly separated numbers: how many models were discovered, verified, currently healthy, eligible for a task, and actually used — plus per-model capabilities, last check time, provider health, recent routing decisions with the reason each model was chosen or skipped, failures, and cost. No "500+ models" marketing claim anywhere.

## 5. Verify

Run the full test suite, type check, lint and production build; fix everything that fails, then re-run. Report what is genuinely verified and what stays unverified (anything needing live third-party credentials or real-browser visual grading).

## Technical notes

- Wire `src/lib/ai/orchestration/{score,gap,plan,failover,telemetry,catalog.server,probe.server}.ts` into `src/lib/ai/router.server.ts` (`buildChain`), `src/lib/ai/free-models.server.ts` (`pickDiscoveredModels` limit), and `src/components/app/FreeModelCollective.tsx` / `src/routes/_authenticated/admin.ai.tsx`.
- Keep `ZERO_AI_COST_MODE`, `freeAiOnly()`, budget ledgers and breaker logic intact; `freeOnly` remains a request/admin flag, not the default quality rule.
- Add tests for score ordering, gap fanout, capability-aware failover, probe caching/backoff, and catalogue normalization; keep the existing ~1,455 tests green.
- No secret exposure, no RLS or tenant-isolation changes, provider keys stay server-only.
