# Jarvis access-control matrix and rollout contract

## Objective

Give Jarvis the broadest useful operational visibility while preserving tenant isolation, explicit human control of consequential changes, and verifiable evidence. "Top-tier access" means a broad, audited set of narrow tools—not raw database, shell, token, or service-role credentials.

## Capability tiers

| Tier | Capability | Runtime permission | Default |
|---|---|---|---|
| 0 | Explain, summarize, draft, classify | No external side effects | Enabled |
| 1 | Registered platform diagnostics | Fixed read-only server tools, bounded output | Enabled for authenticated super-admin |
| 2 | Prepare remediation proposals | Persist a proposal and evidence; no execution | Disabled until proposal queue is implemented |
| 3 | Reversible low-risk mutation | Strict schema, explicit approval, idempotency, postcondition check | Disabled |
| 4 | High-impact operation | Explicit approval for each exact payload plus independent verification | Disabled |
| 5 | Prohibited generic capability | Arbitrary shell/SQL/URL, credential retrieval, policy bypass | Never available |

## Implemented diagnostic tool IDs

- `platform.errors.summary`: bounded, sanitized error groups.
- `builder.health.summary`: aggregate builder, publishing, and asset health.
- `database.contracts.probe`: fixed read-only expected-column probes.
- `website.public.seo-smoke`: fixed public origin homepage, robots, and sitemap smoke checks.
- `ai.providers.snapshot`: configuration/process-local provider evidence; not a paid-provider guarantee.
- `connectors.permissions.snapshot`: declared integration scope and readiness evidence, without credential values.
- `growth.funnel.summary`: aggregate counts only; no lead or customer rows.
- `release.ci.evidence`: fixed repository/branch CI summaries; not deployment proof.
- `security.posture.summary`: explicitly partial security evidence and remaining gaps.

Every tool must be registered in `src/lib/jarvis-tool-registry.ts`, have a server-side implementation, use fixed arguments where possible, and return bounded sanitized output with evidence status and limitations. Model-generated text never creates or grants a tool.

## Approval matrix

| Action family | Read/prepare | Execute |
|---|---|---|
| Repository/code review | Allowed with connected repository permission | Human-reviewed PR; no direct production push |
| Build and publishing diagnostics | Allowed | Draft/preview first; explicit approval before publish |
| Database/schema/RLS | Read-only probes and proposed migration draft | Explicit approval, reviewed migration, backup/rollback plan, post-migration verification |
| Domain/DNS | Status inspection where integration permits | Explicit approval for each exact change |
| Billing/subscriptions/refunds | Explain state and draft a plan | Explicit approval and provider-side authorization |
| Email, outreach, SMS, webhook retry | Draft and inspect aggregate delivery evidence | Explicit approval, recipient/tenant scope, rate limits, idempotency |
| AI provider use | Read declared configuration and sanitized failure categories | Paid calls require explicit cost authorization and budgets |
| Roles, membership, permissions, RLS | Detect and explain | Explicit approval; never bypass existing controls |
| Delete customer data/history | Explain dependencies and draft retention-safe plan | Explicit approval, recovery plan, audit event |
| Secrets/credentials | Report whether a connection is missing or unavailable | Never return raw values or give the model secret-read access |
| Arbitrary SQL, shell, code, or URL execution | Not available as generic tools | Prohibited |

## Required safeguards for every future mutation executor

1. Authenticate the request and verify super-admin status server-side on every call.
2. Use a code-owned allowlist and strict schema for each operation; reject unknown fields.
3. Keep tenant/organization scope explicit and derive it from authorized server context, never model text.
4. Validate the exact canonical argument digest; approval is bound to the digest, tool ID, approver, and expiry.
5. Atomically consume a single-use approval and acquire an idempotency/lease record before execution.
6. Check the durable kill switch, run/action/time/output budgets, migration version, and connector health.
7. Never send raw credentials, full customer records, or unbounded logs to the model.
8. Execute with bounded timeouts, retries, request sizes, and output sizes.
9. Independently verify the postcondition from trusted system state; model claims are not verification.
10. Append an audit event for proposal, approval, denial, execution, verification, rollback, and failure.
11. Stop on timeout, failed verification, authorization mismatch, budget exhaustion, connector degradation, or kill switch.
12. Require human review for publish/deploy, billing, customer messaging, permission/RLS changes, destructive actions, and production migrations.

## Evidence labels

- **Observed**: returned by a live check during this run.
- **Configured**: present in application configuration or registry.
- **Failed**: a check was attempted and returned a failure.
- **Unknown**: no reliable evidence is available.
- **Needs verification**: evidence is incomplete or indirect.

A code path, environment-variable name, configured connector, green CI run, or provider catalog entry is not proof of live production behavior.

## Rollout checklist

- [ ] Review PR and ensure it is based on the current `lovable-sync` head.
- [ ] Wait for TypeScript, lint, full tests, production build, browser QA, and security scans to finish on the same head.
- [ ] Review SQL migration in a disposable Supabase branch; verify migration history, grants, trigger semantics, and schema drift.
- [ ] Run RLS/tenant-isolation negative tests with two organizations and non-admin users.
- [ ] Verify all diagnostic outputs are bounded, redacted, and contain no direct customer/prospect rows.
- [ ] Add durable proposal queue and atomic approval consumption before any write executor.
- [ ] Test duplicate requests, approval replay, expired approvals, concurrent runs, kill switch, connector outage, and failed postcondition.
- [ ] Confirm backups and rollback procedure before production schema changes.
- [ ] Keep production writes disabled until the full checklist is reviewed and signed off.

## Current boundary

The diagnostic toolbench is read-only. The durable safety settings default to autopilot disabled and kill switch engaged. The approval policy is a guard, not an executor. The migration is a proposal and must not be applied automatically. No statement in this document implies the application has inherited the current ChatGPT workspace's connectors or credentials.
