# Jarvis Autopilot v1 — rollout and safety contract

## Added in this change
- Deterministic server-owned policy distinguishes low-risk autonomous writes from actions requiring approval.
- Fail-closed checks cover authentication, super-admin status, kill switch, migration and preflight verification, connector readiness, action budgets, and idempotency.
- A bounded redaction helper and durable run/action/audit tables; browser roles have no direct access.
- Unit tests cover denial cases, risk escalation, idempotency, redaction, and terminal statuses.

## Honest scope
This is the policy and persistence foundation, not a fully wired autonomous executor. A registry entry does not prove a tool is operational. Each executor still needs a concrete implementation, permission scope, runtime health verification, independent postcondition verification, and audit integration. Do not enable unattended production writes until the server runner and connector preflight are implemented and tested.

## Required runner contract
1. Freshly authenticate and assert super-admin on every request.
2. Check server-owned kill switch, durable budgets, migration state, and connector runtime health.
3. Request a structured plan from the AI router. Model output may reference registered tool IDs only; never accept model-provided code, SQL, shell commands, URLs, credentials, or executor definitions.
4. Validate IDs and strict input schemas server-side.
5. Persist proposals before execution with idempotency keys and concurrency leases.
6. Execute code-owned allowlisted tools with timeouts and bounded inputs/outputs.
7. Independently verify postconditions; model narrative alone never means success.
8. Persist state transitions and append audit events; bound retries and stop on failed verification.
9. Auto-run only low-risk, reversible, idempotent writes when preconditions pass. Require approval for security/RLS findings, migrations, publishing/deployment, billing, customer-data changes, and external messages.
10. Stop on kill switch, exhausted budgets, verification failure, or degraded connector.

## Rollout
- Apply the migration through the reviewed Supabase migration workflow; do not run migrations from model output.
- Implement the runner, durable settings, and leases before enabling execution.
- Add negative tests for non-admins, missing connectors, RLS isolation, replay/concurrency, failed verification, and paid-provider fallback.
- Runtime-verify each connector with bounded non-mutating checks; expose missing credential names only, never values.
- Keep production execution disabled until migration and preflight pass. Keep irreversible actions approval-gated.

## Read-only diagnostic toolbench

The authenticated super-admin UI exposes a fixed catalogue through server functions that accept only known tool IDs. The executor contains no generic SQL, shell, arbitrary HTTP, GitHub write, send-message, billing, or publishing pathway.

| Tool ID | Evidence | Limitation |
|---|---|---|
| `platform.errors.summary` | Sanitized seven-day error sample | Bounded sample, may truncate |
| `builder.health.summary` | Build, publish, and image aggregates | Does not prove root cause of a specific failure |
| `database.contracts.probe` | Read-only expected-column probes | Not migration history or RLS coverage |
| `website.public.seo-smoke` | Homepage, robots.txt, sitemap.xml HTTP/metadata checks | Not browser rendering, mobile, accessibility, all-page, or Search Console QA |
| `ai.providers.snapshot` | Provider configuration and coarse runtime evidence | Not proof of quota, licensing, billing eligibility, or future availability |
| `connectors.permissions.snapshot` | Declared permissions and missing-credential counts | Does not grant connector permissions |
| `growth.funnel.summary` | Aggregate account, trial, active-subscription-record, and seven-day lead counts | No individual customer or prospect rows; null means unknown |
| `release.ci.evidence` | Up to five workflow summaries for the fixed public repository and branch | CI does not prove the production release revision |
| `security.posture.summary` | Explicit report of evidence gaps | Partial; not a complete RLS/auth/dependency audit |

Each tool has a bounded output-size declaration and strict identifier. Public HTTP targets and GitHub REST targets are fixed, redirects are rejected, responses are bounded, and connector failures return unknown/needs-verification states instead of fabricated success.

## Mandatory approvals and durable fail-closed defaults

Every write requires explicit administrator approval, even if the operation is low-risk, reversible, or idempotent. The pure approval validator requires a super-admin, exact tool ID, exact SHA-256 hash of canonical validated arguments, an unexpired approval, matching approver identity, and unused approval state. The persistence layer must atomically consume that approval before execution; the pure validator alone never grants execution.

The safety migration creates a server-only settings row with autopilot disabled and the kill switch engaged by default. It binds approval hashes to actions, requires independent verification before a write can be marked successful, and prevents UPDATE/DELETE on the audit-event table through both grants and a trigger. This migration has not been applied by this PR. The new toolbench contains read-only diagnostic executors only; no write executor is exposed.
