# 10/10 Autonomous Production Max

## Release operating system

**Understand → Plan → Build → Inspect → Verify → Repair → Reinspect → Publish**

The new layer turns the existing builder intelligence into an evidence-driven release contract. It deliberately separates deterministic evidence from runtime and human evidence.

## Real browser verification

The repository now has a browser QA workflow that installs Chromium and the Playwright CLI, starts the app, opens configured routes, captures accessibility snapshots and full-page screenshots, and uploads the evidence as workflow artifacts. Playwright documents screenshots as visual evidence and accessibility snapshots as interaction-oriented evidence. citeturn1search0turn1search4

This is intentionally a **read-only smoke/inspection layer**. It does not click customer-affecting controls, submit payments, send email/SMS, mutate customer records, or publish sites.

## Publication contract

Generated sites must have evidence for:
- route integrity
- links/forms
- meaningful content
- placeholder removal
- metadata
- accessibility
- mobile layout
- performance
- runtime cleanliness
- tenant safety

Missing evidence is a blocker rather than a reason to guess.

## Security

Builder prompts are checked for common instruction-override, secret-extraction, security-bypass, and cross-tenant patterns. This is defense-in-depth; authorization remains server-side and authoritative.

## SaaS lifecycle

Canonical lifecycle and webhook contracts provide explicit boundaries for:
- account creation
- trial start
- active trial
- paid subscription
- cancellation
- reactivation
- idempotent webhook processing
- tenant resolution

## Recovery and operations

Destructive, tenant-data, billing, and production operations require restore-point evidence. Recovery states are explicit and bounded.

Telemetry is sanitized against secret-bearing property names.

## SEO, accessibility, performance

Dedicated contracts cover:
- title/meta bounds
- H1 uniqueness
- image alt coverage
- internal linking
- structured data
- noindex detection
- labels
- contrast
- keyboard/focus
- touch targets
- reduced motion
- payload/request budgets
- LCP/CLS/INP when runtime evidence is available

## Change impact

Auth, schema, RLS, billing, and publishing changes are automatically classified as higher-risk and require extra verification.

## What this does not falsely claim

Repository code cannot prove:
- live two-tenant isolation
- live Supabase Advisor remediation
- backup/restore success
- Sentry delivery
- Stripe webhook delivery in production
- production rollback execution
- human accessibility review
- complete browser coverage of every route

Those remain environment-owned verification tasks. The goal is to make the system **fail closed on missing evidence instead of manufacturing a 10/10 score**.

## Evidence artifacts

Browser QA artifacts include snapshots, screenshots, and a machine-readable report. GitHub Actions supports storing screenshots, logs, test results, and other workflow artifacts for later inspection. citeturn2search0
