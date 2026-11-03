---
name: add-supabase-migration
description: Create a safe, additive Supabase migration for this repo with correct timestamp ordering, no destructive DROP, and organization-scoped RLS. Use for any new table, column, index, policy, function or trigger under supabase/migrations.
---

# Add a Supabase migration

Read `supabase/CLAUDE.md` first. The supabase-postgres-best-practices skill covers general Postgres performance; this skill covers this repo's rules.

## 1. Pick the filename
```bash
ls supabase/migrations | tail -3
date -u +%Y%m%d%H%M%S
```
Name it `supabase/migrations/<timestamp>_<snake_case_purpose>.sql`. The timestamp must sort after the latest file; if the clock is earlier than the latest file, use latest + 1 second. Never rename, reorder or edit an existing migration (it may already be applied in production).

## 2. Write it additively
Start with a header comment saying what it adds and that nothing existing is altered or dropped.

```sql
CREATE TABLE IF NOT EXISTS public.example_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS example_items_org_idx ON public.example_items (organization_id, created_at DESC);

ALTER TABLE public.example_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.example_items TO authenticated;
GRANT ALL ON public.example_items TO service_role;

DROP POLICY IF EXISTS example_items_member_read ON public.example_items;
CREATE POLICY example_items_member_read ON public.example_items
  FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
```

Forbidden: `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP TYPE`, `DROP FUNCTION` (without an immediate replacement), `TRUNCATE`, `DELETE` without a tight `WHERE`, `ALTER COLUMN ... TYPE` that can lose data, `DISABLE ROW LEVEL SECURITY`, policies `USING (true)` on tenant data. Allowed `DROP`: only `DROP POLICY|TRIGGER IF EXISTS x` immediately followed by `CREATE` of the same `x` (makes the file re-runnable).

## 3. RLS checklist
- Every table holding workspace data has `organization_id` and RLS enabled in the same file.
- Read policies use `private.is_org_member(organization_id)`; write policies also need `WITH CHECK` on the same expression.
- If browsers should never write, grant only `SELECT` to `authenticated`; do writes in functions run by the service role.
- `SECURITY DEFINER` functions: `SET search_path = public`, check membership inside, `REVOKE ALL ... FROM public` then grant to the roles that need it.
- New column on an existing table: `ADD COLUMN IF NOT EXISTS`, nullable or with a default (no table rewrite on large tables).

## 4. Verify
```bash
node scripts/apply-pending-migrations.contract.mjs
node scripts/website-rpc-security.contract.mjs
rg -n -i '\b(drop (table|column|schema|type)|truncate|disable row level security)\b' supabase/migrations/<new file>
```
The last command must print nothing. Do not edit `src/integrations/supabase/types.ts` by hand; it regenerates from the live schema after the migration is applied.
