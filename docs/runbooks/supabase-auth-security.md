# Supabase Auth & Performance Hardening Runbook

## Leaked-password protection

This is an Auth project setting, not a PostgreSQL migration. It must be enabled in the Supabase Dashboard:

1. Open the Supabase Dashboard.
2. Select **Revora Growth Systems**.
3. Open **Authentication**.
4. Open the password/security settings for the Email provider.
5. Enable **leaked-password protection / Have I Been Pwned password checking**.
6. Save.
7. Re-run Security Advisor and record the result in the release checklist.

Also review, without changing existing behavior unless intentionally approved:
- minimum password length and password-strength requirements;
- email confirmation behavior;
- password-reset redirect allowlist;
- Auth rate limits / abuse protection;
- MFA options for privileged/admin users;
- session lifetime and refresh behavior;
- recent-authentication/reauthentication requirements for sensitive admin operations.


## New-device sign-in email (LOV-13)

Optional email when an owner signs in from a hashed device id or country we have not seen. Ships **OFF**.

**Enable (Manager):** set the server env `REVORA_NEW_DEVICE_EMAIL=1` (Lovable / hosting secrets). Restart/redeploy. Leave unset or any other value to keep it off.

**Migration:** `20261105120000_owner_sign_in_devices.sql` — tables `owner_sign_in_devices` (hash + country only) and `owner_sign_in_alert_state` (one email per account per day). Apply before turning the flag on.

**Behavior:**
- First device ever for an account is recorded and never emails (covers new sign-ups).
- Known device + same country: quiet update of `last_seen`.
- New device or new country: emails via the existing `automation-message` template, at most once per 24 hours.
- No IP, user-agent, or raw device id is stored. Country comes from Cloudflare `cf-ipcountry` when present.

## Workspace provisioning trust boundary

The browser no longer receives EXECUTE on the legacy `public.provision_workspace(text,text,jsonb,integer)` RPC. The authenticated server handler verifies the current user through the existing auth middleware, then invokes the service-role-only `public.provision_workspace_server` function with that verified user id.

The privileged function:
- accepts only the server-supplied user id;
- never accepts a caller-selected organization id or role;
- always creates the owner membership for that same user;
- stamps the full-access trial at exactly 3 days (`FULL_ACCESS_TRIAL_DAYS` in `src/lib/offer.ts`; DB side in migration `20261004090000_restore_three_day_full_access_trial.sql`);
- validates name, industry and profile shape;
- serializes retries for the same user;
- remains inaccessible to anon/authenticated database roles.

Service-role credentials remain server-only.

## Outcome RLS performance

Seven existing policies retain their organization-membership authorization semantics. Only `auth.uid()` evaluation was changed to `(select auth.uid())` so PostgreSQL can initialize the value once per statement instead of repeatedly evaluating it per row.

No RLS policy was weakened.

## Foreign-key indexes

Added only the three indexes reported by Performance Advisor:
- `improvement_recommendations(created_by)`
- `outcome_evidence(created_by)`
- `outcome_snapshots(created_by)`

No constraints or table data are changed.

## Unused-index review

The current advisor reports many unused indexes. This change intentionally does **not** remove them.

Categorization for future review:
1. **Foreign-key support / integrity** — keep until FK workload and delete/update behavior are measured.
2. **Core product query path** — keep until production query statistics prove otherwise.
3. **Low-frequency admin/support operation** — zero usage in the current observation window is not proof of redundancy.
4. **New feature / insufficient traffic** — retain until representative traffic exists.
5. **Future removal candidate** — require production `pg_stat_statements`/query evidence, EXPLAIN ANALYZE for representative queries, and a rollback plan before removal.

## Verification limitation

This PR was created without applying the migration to production. The repository-connected tooling available in this session can inspect the live project and GitHub source, but it does not provide a local shell execution surface for `bun run typecheck`, the full test suite, lint, or production build before PR creation. Therefore those checks are deliberately not represented as passed here.

After the PR branch is pushed, GitHub Actions should be allowed to run the repository's required checks. The migration should be applied to a non-production Supabase branch/staging database, then Security Advisor and Performance Advisor should be re-run before production rollout.

## Rollback

- Drop the three new FK indexes.
- Restore the seven policy predicates to their prior `auth.uid()` expressions if measured behavior requires it.
- Restore the authenticated grant on the legacy provisioning RPC only together with the browser RPC call path; otherwise leave it revoked.
- If the server provisioning path is rolled back, remove the server-only function only after the caller has been restored.
