# supabase/ — Claude Code notes

Postgres schema for every workspace. RLS is the tenant boundary: a mistake here leaks one customer's data to another. Use the `add-supabase-migration` skill for any schema change.

## Layout
- `migrations/` — 180+ timestamped SQL files, applied in filename order. Never `cat` the folder; `ls migrations | tail -5` to see the latest, `rg -n -m 5 'table_name' migrations/` to find history.
- `config.toml` — project config (project id only; no secrets).
- `src/integrations/supabase/types.ts` is generated from the live schema; never hand-edit it.

## Migration rules
- New file: `migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql`, timestamp strictly later than the latest existing file. Never rename or edit an applied migration; write a new one.
- Additive only: `CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`. No `DROP TABLE/COLUMN/SCHEMA/TYPE`, `TRUNCATE`, or destructive `ALTER ... TYPE`. The only accepted `DROP` is `DROP POLICY|TRIGGER IF EXISTS x` immediately followed by recreating `x` in the same file.
- Every new table with tenant data: `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE`, `ENABLE ROW LEVEL SECURITY`, and policies using `private.is_org_member(organization_id)`. Writes from browsers need an explicit policy; otherwise grant only `SELECT` to `authenticated` and write via service-role functions.
- `SECURITY DEFINER` functions must `SET search_path = public` (or empty) and check membership themselves.
- Never put keys, tokens or real customer data in SQL.

## Checks
- `node scripts/apply-pending-migrations.contract.mjs` (runs in CI)
- `node scripts/website-rpc-security.contract.mjs` (RPC exposure, runs in CI)
- `npm run supabase:drift` needs database credentials; CI runs it (`supabase-migration-drift.yml`), don't run it locally without them.
