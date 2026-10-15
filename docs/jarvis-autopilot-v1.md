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
