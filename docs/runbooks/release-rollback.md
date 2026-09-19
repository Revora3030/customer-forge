# Release and rollback runbook

## Before release

- Confirm review and required CI checks.
- Confirm typecheck, lint, security audit, tests and production build.
- Review every database migration and its recovery strategy.
- Confirm a known-good application version for high-risk changes.
- Confirm security changes were verified in the owning environment.

## Rollback order

1. Stop further rollout.
2. Roll back the application when the defect is application-level.
3. If a migration is involved, follow its recovery plan; do not improvise destructive production SQL.
4. Verify authentication, tenant isolation, publishing, leads, appointments and billing.
5. Re-run focused tests and health checks.
6. Record the exact version restored and remaining risk.

Rollback is an operational capability, not merely a Git command.
