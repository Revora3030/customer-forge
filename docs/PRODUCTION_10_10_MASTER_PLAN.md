# Customer Forge production-grade 10/10 contract

This is the evidence contract for production readiness. It distinguishes implemented code from behavior that has actually been verified in the environment that owns it.

## Required evidence domains

1. Tenant isolation — authenticated and adversarial cross-organization reads/writes are denied.
2. Authentication boundary — privileged operations are server-only, identity comes from verified auth context, and secrets never reach browser code.
3. Generated-site verification — served pages are checked for broken routes, placeholder content, metadata, conversion paths, accessibility and responsive behavior before publish.
4. Rollback — a known-good application/database recovery path exists and has been exercised where practical.
5. Observability — important errors, failed webhooks, publishing failures and background work have actionable telemetry.
6. Backup/restore — backups exist and a restore has been exercised in a non-production environment.
7. Activation measurement — the lifecycle funnel is defined consistently and events cannot double-count transitions.

## Evidence states

- verified: relevant evidence was executed against the correct environment.
- partial: some evidence exists, but an important runtime check remains.
- unverified: trustworthy evidence has not been collected.

A green static test must never be used as proof of a missing runtime or database authorization test.

## Builder publication contract

Generated websites should not silently publish when required evidence is missing. The publication contract covers:

- route integrity;
- meaningful headings and content;
- no unresolved placeholder/template text;
- working internal conversion destinations;
- useful title and meta description;
- accessible names and keyboard/focus behavior;
- mobile layout and touch-target behavior;
- image/resource loading;
- console/runtime errors;
- performance signals;
- tenant-safe data access.

If a runtime check cannot execute, record it as unverified rather than inventing a pass.

## Release evidence

Minimum evidence for a release:

1. typecheck;
2. lint;
3. security audit;
4. full unit/integration suite;
5. production build;
6. focused tests for changed features;
7. browser/E2E checks for changed critical flows;
8. Supabase Security and Performance Advisor review after database changes;
9. rollback/recovery evidence for high-risk changes.

## Change discipline

- Branch from main and use a pull request.
- Do not apply unreviewed production migrations.
- Prefer additive and reversible database changes.
- Keep generated database types synchronized with approved migrations.
- Record exact commands and real results in the PR.
- Never commit secrets, credentials, customer data or sensitive logs.

## Known evidence gaps

This contract does not claim live browser-agent execution, adversarial cross-tenant database tests, backup/restore drills, or production observability are already proven. Those require their owning runtime environments and real evidence.
