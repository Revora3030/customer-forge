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

## PR 275 hardening
- Authorization flags must be actual booleans; truthy strings are not proof of authorization or preflight.
- Run budgets are capped at 20 to match the ledger. Tool IDs, access/risk enums, boolean metadata, timeouts and output limits are validated.
- High-risk reads and explicitly approval-gated reads cannot bypass approval through their access classification.
- Redaction covers recognized underscore credentials, bearer tokens, JWTs, URL credentials/query values and quoted JSON secret fields. It is defense in depth, not a guarantee of complete sensitive-data removal.
- This patch does not enable the executor, merge the PR, apply its migration, or weaken CI. Standalone runtime checks are separate from the repository's typecheck, lint, tests, build and security scans.

## Read-only diagnostic toolbench

The admin UI exposes these registered tools through authenticated server functions. Callers supply only a tool ID; there is no generic query, shell, arbitrary URL, commit, send, billing, or publish interface.

| Tool ID | Evidence returned | Important limitation |
|---|---|---|
| `platform.errors.summary` | Sanitized seven-day error sample | Bounded sample, not every event |
| `builder.health.summary` | Build, publish, and image aggregates | Does not establish a specific root cause |
| `database.contracts.probe` | Small read-only select-contract probes | Not a migration-history or RLS audit |
| `website.public.seo-smoke` | Homepage, robots.txt, sitemap.xml HTTP/metadata checks | Not browser, mobile, accessibility, all-pages, or Search Console verification |
| `ai.providers.snapshot` | Provider configuration, scope, cost class, coarse failure category, process-local success evidence | Key presence is not provider health, quota, or licensing |
| `connectors.permissions.snapshot` | Declared permission scopes and missing-credential counts | Does not give the tool new permissions |
| `growth.funnel.summary` | Aggregate account, trial, active-subscription-record, and recent-lead counts | Unavailable queries are unknown, not zero; records are not necessarily unique customers |
| `release.ci.evidence` | Last five workflow-run summaries for the fixed public repository branch | CI evidence does not prove which release is deployed |
| `security.posture.summary` | What limited evidence was observed and what still needs audit | Explicitly partial, never a complete security verdict |

Every tool has bounded output and a timeout declaration. HTTP calls use a fixed public origin or fixed GitHub API path, strict redirect behavior, and bounded responses. Tool metadata is not evidence that a connector is configured or healthy.

## Approval data contract and durable fail-closed defaults

A follow-up safety migration creates a server-only settings singleton with `enabled=false` and `kill_switch_engaged=true` by default. It adds input/approved-input SHA-256 digest columns, approval expiry, and independent verification status to proposed actions. A write cannot enter execution/terminal state unless approval is present, unexpired at start, bound to the same input digest, and recorded with an approver. A write cannot be marked successful unless independent verification passed.

The audit-event table has UPDATE/DELETE privileges revoked from application roles and a trigger rejects UPDATE/DELETE. This is defense in depth, not protection from database owners who can alter schema/triggers. The migration has not been applied by this code change; the reviewed migration pipeline must apply it before any approval/execution feature uses these columns.

The pure approval checker validates authentication, super-admin status, approval status, exact tool ID, SHA-256 format and digest equality, approver identity, expiry, and single-use state. The persistence layer must still atomically consume the approval and write audit entries in the same transaction as state changes. No write executor is currently exposed by the diagnostic toolbench.
