# Migration history reconciliation (operator runbook)

Two migration folders exist:

- `supabase/migrations/` — the canonical chain. `scripts/apply-pending-migrations.mjs`
  (workflow `apply-pending-migrations.yml`, manual only) and the drift audit
  (`supabase-migration-drift.yml`, `npm run supabase:drift`) read only this folder.
- `drizzle/migrations/` — written by the Lovable database migration tool and
  applied directly to the live database. No repository script or CI job runs it.

## Known correspondence (SQL compared, comments/whitespace ignored)

| Drizzle | supabase/migrations | Status |
|---|---|---|
| 0000 lead_delivery_telemetry | 20260928052000 | identical |
| 0001 builder_restore_point_fix | 20260928190000 | identical |
| 0002 membership_role_guard | 20261003010000 | identical |
| 0003 setup_price_350 | none complete (related: 20261004090000) | **gap** |
| 0004 publish_lock_message_350 | superseded by 20261016120000 (different SQL) | **gap** |
| 0005 jarvis_messages (CREATE TABLE) | none; 20261015180000 references the table | **gap — standalone replay would fail** |
| 0006 generation_jobs_stage_checkpoints | 20261020140000 (`ADD COLUMN IF NOT EXISTS`) | identical, idempotent |

No checked-in workflow runs the Supabase CLI or prints "Remote migration versions not
found in local migrations directory". That message comes from a CLI run outside this
repository (or an older workflow revision); get the failing log before acting on it.

## Safe steps (read-only first; nothing here deletes or resets)

1. `node scripts/apply-pending-migrations.mjs plan` with the read-only target configured.
   Record every remote version not present locally and every local version not applied.
2. For each remote-only version, find the SQL that produced it (Drizzle folder, Lovable
   history, or the failing CI log). Never invent a file for an unknown version.
3. For gaps 0003–0005: add idempotent mirrors to `supabase/migrations/` (e.g.
   `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, guarded constraint
   changes) and run `dry-run` before anything else. Pricing SQL (0003/0004) must
   match the owner's current offer decision first.
4. Use the script's allow-listed `record` mode only for versions whose schema the probe
   confirms is already present — it records history without running SQL.
5. Re-run `npm run supabase:drift` and attach its output as evidence.

Do not run `supabase db reset`, `migration repair --status reverted`, or delete files.
