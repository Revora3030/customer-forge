# Customer Forge incident response

## P0 — security or broad data-isolation incident

Examples include cross-tenant access, a leaked privileged credential, or an unauthorized payment operation.

1. Stop the affected rollout or entry point.
2. Preserve timestamps and relevant logs.
3. Rotate compromised credentials when applicable.
4. Determine affected tenants and scope.
5. Patch and add a regression test.
6. Verify isolation and critical flows before restoring traffic.

## P1 — broad production outage

Examples include publishing, authentication, or payment/webhook failures affecting many customers.

1. Identify the failing dependency and affected path.
2. Roll back when the latest release is implicated.
3. Preserve failed workflow/build identifiers.
4. Verify health and critical journeys.
5. Document root cause and prevention work.

## P2 — isolated functional defect

Reproduce, add a focused regression test, patch through a pull request, and verify affected browser/server paths.

Never put secrets or unnecessary customer data in incident records.
