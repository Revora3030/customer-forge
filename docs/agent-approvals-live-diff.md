# agent_approvals: what to diff against live (read-only)

Manager reported that the live `agent_approval_consume` differs from
`supabase/migrations/20261103020000_agent_approvals.sql`. The repo cannot see the live
database, so nothing here was compared against it, and no fix migration is included.
Run these on live (SELECT only) and diff against the repo file.

```sql
-- 1. Which overloads exist? The repo has exactly one of each.
select p.oid::regprocedure::text as signature, p.prosecdef as security_definer, p.proconfig as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'agent_approval%' order by 1;

-- 2. The live body of consume (compare to the repo function line by line).
select pg_get_functiondef('public.agent_approval_consume(uuid,text,text,text,uuid)'::regprocedure);

-- 3. Who can run it? Repo: service_role only (nothing for PUBLIC, anon, authenticated).
select grantee, privilege_type from information_schema.routine_privileges
where routine_schema = 'public' and routine_name like 'agent_approval%' order by 1, 2;

-- 4. Table shape, statuses and the one-live-approval index.
select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.agent_approvals'::regclass;
select indexdef from pg_indexes where tablename = 'agent_approvals';
```

## Intended behaviour of `agent_approval_consume(_org, _scope, _tool, _hash, _id default null)`

| Situation                                                                            | outcome                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| approved, unexpired, same workspace + scope + tool + argument hash (and id if given) | `consumed` (row becomes `consumed`, `consumed_at` set) |
| same call again                                                                      | `used`                                                 |
| still pending                                                                        | `not_approved`                                         |
| rejected                                                                             | `rejected`                                             |
| approved but past `expires_at` (or cancelled/expired)                                | `expired`                                              |
| `_id` given but the row has a different tool or hash                                 | `changed`                                              |
| nothing matches in this workspace                                                    | `not_found`                                            |

It must never consume another workspace's row, a changed argument, another tool, an expired,
rejected or already-consumed row, and two concurrent calls must not both succeed
(`FOR UPDATE SKIP LOCKED`). Typical drift to look for: a different argument list (the app
calls it with five named args), a missing `expires_at > now()` check, a missing org match,
a non-locking select, or extra grants to `authenticated`.

If live differs, the fix goes in a NEW migration (`CREATE OR REPLACE FUNCTION` with the repo
body), not an edit to the applied file, and needs Manager review before it is applied.

## How the repo version was checked

`/workspace/revora/qa/nb4-approvals-sql-check.mjs` applies the migration to a throwaway
in-memory Postgres (PGlite, stub org/membership tables) and runs 18 scenarios: idempotent
request, owner-only decide, exact-match consume, single use, changed args, other tool, other
workspace, wrong id, rejected, expired, admin scope. All pass. Contract tests for the same
rules are in `src/lib/agent/approvals-migration.contract.test.ts`.
