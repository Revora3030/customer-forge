# Security Operations Runbook

## Release blockers

Treat any of these as a release blocker:
- Cross-tenant read, write, publish, invite, portal or preview access.
- Privileged server credentials reachable from browser bundles.
- Unverified payment or webhook state changing entitlements.
- Broken authentication/session boundary.
- Secret material in source, logs, telemetry or client responses.
- A generated site with a broken route, empty conversion path, placeholder copy, inaccessible critical control or unsafe tenant reference.
- A production migration without a tested rollback path.

## Security evidence

Every high-risk change records:
1. affected trust boundary;
2. exact tests run;
3. migration/recovery strategy;
4. runtime evidence or explicit evidence gap;
5. rollback result or reason it cannot yet be exercised.

Static code inspection is not proof of tenant isolation. Authenticated adversarial tests must be executed against a non-production environment before declaring that domain verified.

## Secret handling

Never print credentials in CI output. Redact values before telemetry and do not include prompts, generated customer content, authorization headers, cookies, passwords or personal contact fields in diagnostic dimensions.

## Live Supabase controls

The Supabase project must keep:
- leaked-password protection enabled;
- privileged provisioning callable only through the intended server trust boundary;
- RLS enabled for exposed tenant tables;
- tenant predicates tied to authenticated identity/membership;
- high-risk SECURITY DEFINER functions restricted from public roles.

Re-run Security and Performance Advisors after applying database migrations.
