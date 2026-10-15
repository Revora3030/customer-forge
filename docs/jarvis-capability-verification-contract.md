# Jarvis capability verification contract

## Purpose

Jarvis is evaluated across the seven operational capability areas that matter to an autonomous business-growth operator: diagnostics, engineering, growth intelligence, acquisition tracking, autonomy, safety, and production reliability. The read-only diagnostic tool `jarvis.capabilities.scorecard` reports the evidence status and blockers for every area.

The scorecard is a release instrument, not a marketing score. It must never set a 10/10 from feature presence, a green-looking configuration flag, model confidence, or missing data.

## Scoring contract

- A check passes only when its status is `verified` and its evidence source is named.
- `configured` means the code or policy exists; it is not proof that the production path works.
- `unknown` means the check did not produce enough reliable evidence; it is not a pass or a failure verdict.
- `failed` means a test or direct observation found a gap.
- Missing, malformed, stale, or indirect evidence is scored as unknown.
- A capability reaches 10/10 only if every check in that capability is explicitly verified.
- Scores are advisory diagnostics. They never authorize tools, writes, sending, billing, publishing, or spending.

## Seven capability areas and required proof

| Area | Required evidence before 10/10 |
|---|---|
| Diagnostics and system awareness | Recent error sample, build/publish/image health, schema probes, adversarial redaction tests |
| Development and troubleshooting | Typecheck, lint, full tests, security gates, and browser journeys all pass on the scored commit |
| Business-growth intelligence | Defined funnel metrics, published offer matching provider checkout, trusted paid-conversion attribution, measured experiments |
| Lead scoring and acquisition tracking | Validated explainable scores, timestamped channel consent, suppression reconciliation, provider receipts, paid-conversion attribution |
| Autonomous execution | Live kill-switch check, atomic one-use approvals, idempotency/concurrency fencing, independent postcondition checks, exercised recovery |
| Safety and access governance | Server-side admin boundary, cross-tenant negative tests, redaction, append-only audit semantics, no model-accessible secrets |
| Verified production reliability | Required CI gates on one commit, deployed revision matches it, production synthetic journeys, migration/drift checks, exercised rollback |

## Current execution boundary

Jarvis diagnostics are read-only. Acquisition scoring and planning do not themselves send messages, scrape prospects, spend money, create appointments, publish production websites, or charge customers. Those actions require dedicated narrow executors with server-derived tenant scope, durable consent and suppression evidence, explicit approvals, bounded budgets, idempotency, append-only audit records, independent postcondition verification, and integration tests.

The capability scorecard deliberately leaves these items as configured or unknown unless it can establish stronger evidence. A source-code policy or test fixture does not prove production behavior. A public HTTP smoke check does not prove mobile usability, accessibility, payment health, or an actual conversion. Green CI does not prove that the same revision is deployed.

## Operational review

Before declaring a capability production-ready, attach the exact commit and workflow run, report checked-at timestamps, review unresolved blockers, and run the relevant end-to-end tests. Any missing required signal should keep the capability below 10/10. Re-run the scorecard after meaningful code, database, provider, or deployment changes.
