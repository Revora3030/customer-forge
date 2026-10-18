// Applies repository migrations that are missing from
// supabase_migrations.schema_migrations, in version order.
//
//   MODE=plan (default)   : reads history only, never executes migration SQL.
//   MODE=dry-run          : runs pending SQL in a transaction, then ROLLS BACK.
//                          Can take locks; use staging first.
//   MODE=apply             : runs each pending migration in its own transaction
//                           and records it in schema_migrations. Stops at the
//                           first failure (that migration is rolled back; earlier
//                           ones stay applied and recorded).
//   MODE=record            : reconciles history WITHOUT executing any migration
//                           SQL. Only versions on RECORD_ALLOW_LIST below may be
//                           named (RECORD_VERSIONS=v1,v2 or RECORD_VERSIONS=all).
//                           Each one's read-only SELECT probe must prove its
//                           objects are already live; one failing probe or one
//                           unlisted version refuses the whole run, and nothing
//                           is written. Requires CONFIRM_RECORD=RECORD. This is
//                           a production write: owner approval only.
//
// Never deletes or edits recorded history. Never touches live-only migrations.
// Reads the connection string from SUPABASE_DB_URL (or DATABASE_URL) only.
// EXPECTED_SUPABASE_PROJECT_REF must match that connection before any I/O.

import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MIGRATIONS_DIR = "supabase/migrations";

/**
 * Remove top-level transaction control (BEGIN; / COMMIT; / START TRANSACTION;)
 * so the runner owns the transaction. Lines inside dollar-quoted bodies
 * ($$ ... $$, $fn$ ... $fn$) are never touched, so plpgsql BEGIN/END survive.
 */
export function stripTransactionControl(sql) {
  let openTag = null;
  const out = [];
  for (const line of sql.split("\n")) {
    const isTxn = /^\s*(BEGIN|COMMIT|START\s+TRANSACTION)\s*;\s*(--.*)?$/i.test(line);
    if (openTag === null && isTxn) continue;
    out.push(line);
    for (const match of line.matchAll(/\$([A-Za-z_]\w*)?\$/g)) {
      if (openTag === null) openTag = match[0];
      else if (match[0] === openTag) openTag = null;
    }
  }
  return out.join("\n");
}

/** Pure planner: which repo migrations are missing from the live history. */
export function planPending(repoNames, live) {
  const liveVersions = new Set(live.map((row) => String(row.version)));
  return repoNames
    .filter((name) => /^\d{14}_.+$/.test(name))
    .sort()
    .map((name) => ({ name, version: name.slice(0, 14), label: name.slice(15) }))
    .filter((m) => !liveVersions.has(m.version));
}

/** Refuse ambiguous histories instead of replaying differently-versioned SQL. */
export function migrationHistoryConflicts(repoNames, live) {
  const repo = repoNames.filter(name => /^\d{14}_.+$/.test(name));
  const versions = new Set(repo.map(name => name.slice(0, 14)));
  const conflicts = [];
  const normalize = name => String(name ?? "").replace(/\.sql$/, "").replace(/^\d{14}_/, "");
  for (const name of repo) {
    const version = name.slice(0, 14), label = name.slice(15);
    if (repo.filter(other => other.slice(0, 14) === version).length > 1)
      conflicts.push(`Duplicate local version: ${version}`);
    const sameVersion = live.find(row => String(row.version) === version);
    if (sameVersion?.name && normalize(sameVersion.name) !== label)
      conflicts.push(`Version ${version} has different local and remote names; reconcile before executing SQL.`);
    if (!sameVersion && live.some(row => normalize(row.name) === label))
      conflicts.push(`${name} is already named in remote history under another version; do not replay it.`);
  }
  for (const row of live) {
    if (!versions.has(String(row.version)))
      conflicts.push(`Remote-only migration ${row.version}: review its SQL and reconcile the repository first.`);
  }
  return [...new Set(conflicts)];
}

export function assertMigrationTarget(connectionUrl, expectedRef) {
  if (!/^[a-z0-9]{20}$/.test(expectedRef ?? ""))
    throw new Error("EXPECTED_SUPABASE_PROJECT_REF must be the confirmed 20-character project ref.");
  let connection;
  try { connection = new URL(connectionUrl); }
  catch { throw new Error("The database connection URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(connection.protocol))
    throw new Error("Use a PostgreSQL connection URL.");
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(connection.hostname)?.[1];
  let user;
  try { user = decodeURIComponent(connection.username); }
  catch { throw new Error("The database connection username is invalid."); }
  const pooled = /\.pooler\.supabase\.com$/.test(connection.hostname)
    ? /^postgres\.([a-z0-9]{20})$/.exec(user)?.[1] : undefined;
  if ((direct ?? pooled) !== expectedRef)
    throw new Error("Database target does not match EXPECTED_SUPABASE_PROJECT_REF. No connection was opened.");
  return expectedRef;
}

/** Statements that cannot run inside a transaction block. */
export function nonTransactionalStatements(sql) {
  return /\b(CREATE|DROP)\s+INDEX\s+CONCURRENTLY\b|\bVACUUM\b|\bALTER\s+SYSTEM\b/i.test(sql);
}

/* ------------------------------ MODE=record ------------------------------ */

const hasPolicy = (table, policy) =>
  `exists (select 1 from pg_policies where schemaname = 'public' and tablename = '${table}' and policyname = '${policy}')`;
const hasColumn = (table, column) =>
  `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '${table}' and column_name = '${column}')`;
const hasTrigger = (name) => `exists (select 1 from pg_trigger where tgname = '${name}' and not tgisinternal)`;
const hasProcNamed = (schema, name) =>
  `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '${schema}' and p.proname = '${name}')`;
const procBodyHas = (schema, name, text) =>
  `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '${schema}' and p.proname = '${name}' and p.prosrc like '%${text}%')`;
const probe = (...conditions) => `select (${conditions.join("\n  and ")}) as ok`;

const PLATFORM_LABEL_SQL =
  "btrim(regexp_replace(regexp_replace(regexp_replace(lower(name), '[\\u2019'']', '', 'g'), '[^a-z0-9/ ]+', ' ', 'g'), '\\s+', ' ', 'g'))";

/**
 * Versions whose effects a 2026-10-17 read-only audit found fully live although
 * schema_migrations has no row for them (17), plus the three files that were
 * neutralised because their targets never existed (3). Each probe is a single
 * read-only SELECT returning `ok`.
 */
export const RECORD_ALLOW_LIST = Object.freeze({
  "20260919000000": {
    name: "workspace_provisioning_and_outcome_rls_hardening",
    probe: probe(
      "to_regprocedure('public.provision_workspace_server(uuid, text, text, jsonb, integer)') is not null",
      "to_regclass('public.outcome_snapshots') is null",
      "case when to_regprocedure('public.provision_workspace(text, text, jsonb, integer)') is null then true else not has_function_privilege('authenticated', 'public.provision_workspace(text, text, jsonb, integer)', 'EXECUTE') end",
    ),
  },
  "20260919010000": {
    name: "final_production_hardening",
    probe: probe(
      "to_regprocedure('public.provision_workspace_server(uuid, text, text, jsonb, integer)') is not null",
      "to_regclass('public.outcome_snapshots') is null",
      "case when to_regprocedure('public.provision_workspace(text, text, jsonb, integer)') is null then true else not has_function_privilege('authenticated', 'public.provision_workspace(text, text, jsonb, integer)', 'EXECUTE') end",
    ),
  },
  "20261005000000": {
    name: "harden_website_rpc_execute",
    probe: probe(
      "to_regprocedure('public.apply_ai_website_changes(uuid, jsonb, uuid, text)') is null",
      "to_regprocedure('public.apply_website_theme(uuid, text, text, text, text, text)') is null",
      "to_regprocedure('public.create_website_snapshot(uuid)') is null",
      "to_regprocedure('public.generate_industry_website(uuid, text, text, text, text)') is null",
      "to_regprocedure('public.publish_website_draft(uuid, uuid)') is null",
    ),
  },
  "20260928052000": {
    name: "lead_delivery_telemetry",
    probe: probe(
      "to_regclass('public.lead_delivery_logs') is not null",
      "to_regclass('public.lead_delivery_logs_org_attempted_idx') is not null",
      hasPolicy("lead_delivery_logs", "lead_delivery_logs_member_select"),
    ),
  },
  "20260928190000": {
    name: "builder_restore_point_fix",
    probe: probe(hasPolicy("website_versions", "website_versions_write"), hasPolicy("website_versions", "website_versions_update")),
  },
  "20261003010000": {
    name: "membership_role_guard",
    probe: probe("to_regprocedure('private.guard_membership_change()') is not null", hasTrigger("memberships_role_guard")),
  },
  "20261004090000": {
    name: "restore_three_day_full_access_trial",
    probe: probe(
      "exists (select 1 from pg_constraint where conname = 'offer_config_revora_offer_locked')",
      "to_regprocedure('public.provision_workspace_server(uuid, text, text, jsonb, integer)') is not null",
      "to_regprocedure('private.default_org_billing_columns()') is not null",
    ),
  },
  "20261005120000": {
    name: "build_and_admin_invariants",
    probe: probe("to_regclass('public.generation_jobs_one_active_per_org') is not null", hasTrigger("enforce_super_admin_owner")),
  },
  "20261005140000": {
    name: "builder_crm_image_publish_records",
    probe: probe(
      hasColumn("generation_jobs", "cancel_requested_at"),
      hasColumn("generation_jobs", "failure_kind"),
      hasColumn("generation_jobs", "stage_timings"),
      hasColumn("builder_messages", "request_id"),
      hasColumn("builder_messages", "kind"),
      hasColumn("builder_messages", "branch"),
      "to_regclass('public.image_records') is not null",
      "to_regclass('public.lead_tasks') is not null",
      "to_regclass('public.publish_events') is not null",
    ),
  },
  "20261007150000": {
    name: "deactivate_platform_label_services",
    probe: probe(
      `not exists (select 1 from public.services where is_active = true and (name is null or ${PLATFORM_LABEL_SQL} = '' or ${PLATFORM_LABEL_SQL} = any (array['all','any','none','other','n/a','na','build my site','build site','build my website','generate site','generate my site','generate website','rebuild site','publish my site','publish site','apply this improvement','improve my search preview','command center','growth command center','submit','save','continue','next','back','cancel','click here','get started','start','service','services','my service','service 1','service name','add service','new service']::text[])))`,
    ),
  },
  "20261007200000": {
    name: "lead_delivery_idempotency",
    probe: probe(
      hasColumn("lead_delivery_logs", "idempotency_key"),
      "exists (select 1 from pg_constraint where conname = 'lead_delivery_logs_idempotency_key_length')",
      "to_regclass('public.lead_delivery_logs_org_idempotency_idx') is not null",
    ),
  },
  "20261015090000": {
    name: "jarvis_autopilot_audit",
    probe: probe(
      "to_regclass('public.jarvis_autopilot_runs') is not null",
      "to_regclass('public.jarvis_autopilot_actions') is not null",
      "to_regclass('public.jarvis_autopilot_audit_events') is not null",
    ),
  },
  "20261015140000": {
    name: "jarvis_autopilot_safety",
    probe: probe(
      "to_regclass('public.jarvis_autopilot_settings') is not null",
      hasColumn("jarvis_autopilot_actions", "approval_status"),
      hasColumn("jarvis_autopilot_actions", "verification_summary"),
    ),
  },
  "20261015180000": {
    name: "jarvis_attachments",
    probe: probe(
      "exists (select 1 from storage.buckets where id = 'jarvis-attachments')",
      "to_regclass('public.jarvis_attachments') is not null",
      "to_regclass('public.jarvis_upload_quotas') is not null",
      "to_regprocedure('public.jarvis_consume_upload(uuid)') is not null",
    ),
  },
  "20261016090000": {
    name: "claim_prospect_demo",
    probe: probe("to_regprocedure('public.claim_prospect_demo_server(text, uuid, integer)') is not null"),
  },
  "20261016120000": {
    name: "trial_publishing",
    probe: probe(
      "to_regprocedure('private.site_live_allowed(uuid)') is not null",
      procBodyHas("private", "guard_production_activation", "free trial has ended"),
    ),
  },
  "20261016150000": {
    name: "lead_webhook_secrets",
    probe: probe("to_regclass('public.lead_webhook_secrets') is not null", hasPolicy("lead_webhook_secrets", "lead_webhook_secrets_manager_read")),
  },
  "20261016170000": {
    name: "super_admin_owner_accounts",
    probe: probe(procBodyHas("private", "enforce_super_admin_owner", "platform owner accounts"), hasTrigger("enforce_super_admin_owner")),
  },
  "20261016180000": {
    name: "openai_free_token_meter",
    probe: probe("to_regprocedure('public.ai_note_free_tokens(text, integer)') is not null"),
  },
  "20261017100000": {
    name: "ai_paid_daily_budget",
    probe: probe(
      "to_regclass('public.ai_paid_daily_budget') is not null",
      hasProcNamed("public", "ai_paid_budget_reserve"),
      hasProcNamed("public", "ai_paid_budget_settle"),
    ),
  },
});

/**
 * Pure planner for MODE=record. Refuses (returns refusals) for any requested
 * version that is not on the allow-list, has no matching repo file, or whose
 * allow-list name disagrees with the repo file. Already-recorded versions are
 * skipped, never re-inserted.
 */
export function planRecord(requested, repoNames, live, allowList = RECORD_ALLOW_LIST) {
  const wanted = requested.length === 1 && requested[0] === "all" ? Object.keys(allowList) : requested;
  const liveVersions = new Set(live.map((row) => String(row.version)));
  const repo = new Set(repoNames);
  const refusals = [];
  const toRecord = [];
  const skipped = [];
  if (!wanted.length) refusals.push("RECORD_VERSIONS is empty; name the versions to record (or 'all').");
  for (const version of [...new Set(wanted)].sort()) {
    const entry = Object.hasOwn(allowList, version) ? allowList[version] : undefined;
    if (!entry) {
      refusals.push(`${version} is not on the record allow-list.`);
      continue;
    }
    if (!repo.has(`${version}_${entry.name}`)) {
      refusals.push(`${version}_${entry.name} is not a repository migration.`);
      continue;
    }
    if (liveVersions.has(version)) {
      skipped.push(version);
      continue;
    }
    toRecord.push({ version, label: entry.name, probe: entry.probe });
  }
  return { toRecord, skipped, refusals };
}

/**
 * Executes MODE=record against an injected database. `db.probe(sql)` runs one
 * read-only SELECT and resolves to its boolean `ok`; `db.record(rows)` inserts
 * the history rows in one transaction. Every probe runs before anything is
 * written; any refusal or failing probe throws and records nothing. Migration
 * SQL files are never read or executed here.
 */
export async function runRecord({ requested, repoNames, live, db, allowList = RECORD_ALLOW_LIST, log = () => {} }) {
  const { toRecord, skipped, refusals } = planRecord(requested, repoNames, live, allowList);
  if (refusals.length) throw new Error(`Record refused; nothing written:\n- ${refusals.join("\n- ")}`);
  const failures = [];
  for (const m of toRecord) {
    let ok = false;
    try {
      ok = (await db.probe(m.probe)) === true;
    } catch (error) {
      failures.push(`${m.version}: probe errored (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (ok) log(`probe OK     ${m.version}_${m.label}`);
    else failures.push(`${m.version}: probe did not find its objects live`);
  }
  if (failures.length) throw new Error(`Record refused; nothing written:\n- ${failures.join("\n- ")}`);
  if (toRecord.length) await db.record(toRecord.map(({ version, label }) => ({ version, label })));
  return { recorded: toRecord.map((m) => m.version), skipped };
}

async function main() {
  const mode = (process.env.MODE || "plan").toLowerCase();
  if (!["plan", "dry-run", "apply", "record"].includes(mode)) {
    console.error("MODE must be plan, dry-run, apply or record.");
    process.exit(2);
  }
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("SUPABASE_DB_URL (or DATABASE_URL) is required.");
    process.exit(2);
  }
  const projectRef = assertMigrationTarget(url, process.env.EXPECTED_SUPABASE_PROJECT_REF);
  if (mode === "apply" && process.env.CONFIRM_APPLY !== "APPLY")
    throw new Error("Applying migrations requires CONFIRM_APPLY=APPLY.");
  if (mode === "record" && process.env.CONFIRM_RECORD !== "RECORD")
    throw new Error("Recording migration history requires CONFIRM_RECORD=RECORD.");

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, prepare: false, onnotice: () => {} });

  try {
    if (mode !== "plan") {
      const [lock] = await sql`select pg_try_advisory_lock(hashtext('revora:apply-pending-migrations')) as acquired`;
      if (!lock?.acquired) throw new Error("Another migration runner holds the lock. Try later.");
    }
    const repo = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, -4));
    const live = await sql`select version, name from supabase_migrations.schema_migrations`;
    const pending = planPending(repo, live);
    const conflicts = migrationHistoryConflicts(repo, live);

    console.log(JSON.stringify({ mode, projectRef, liveCount: live.length, repoCount: repo.length, pending: pending.map((p) => p.name), conflicts }, null, 2));
    if (mode === "plan") {
      console.log("READ-ONLY PLAN: no migration SQL executed. Review conflicts and the target project before a staging dry-run.");
      return;
    }
    if (mode === "record") {
      if (conflicts.length)
        throw new Error("Migration history is divergent. Reconcile the reported conflicts before recording; nothing written.");
      const requested = String(process.env.RECORD_VERSIONS ?? "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      const result = await runRecord({
        requested,
        repoNames: repo,
        live,
        log: (line) => console.log(line),
        db: {
          probe: async (text) =>
            sql.begin("read only", async (tx) => {
              const [row] = await tx.unsafe(text);
              return row?.ok === true;
            }),
          record: async (rows) =>
            sql.begin(async (tx) => {
              for (const row of rows)
                await tx`insert into supabase_migrations.schema_migrations (version, name)
                         values (${row.version}, ${row.label})`;
            }),
        },
      });
      console.log(JSON.stringify({ mode, recorded: result.recorded, alreadyRecorded: result.skipped }, null, 2));
      console.log("RECORDED history rows only; no migration SQL executed. Run \"Supabase Migration Drift\" next.");
      return;
    }
    if (conflicts.length)
      throw new Error("Migration history is divergent. Reconcile the reported conflicts before dry-run/apply; no migration SQL executed.");
    if (!pending.length) {
      console.log("Nothing to apply: live history already contains every repo migration.");
      return;
    }

    const bodies = pending.map((m) => {
      const body = stripTransactionControl(readFileSync(`${MIGRATIONS_DIR}/${m.name}.sql`, "utf8"));
      if (nonTransactionalStatements(body)) throw new Error(`${m.name} contains a statement that cannot run in a transaction; apply it manually.`);
      return { ...m, body };
    });

    if (mode === "dry-run") {
      const ROLLBACK = Symbol("rollback");
      let current = null;
      try {
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout = '10s'`;
          await tx`set local statement_timeout = '120s'`;
          for (const m of bodies) {
            current = m.name;
            await tx.unsafe(m.body);
            console.log(`dry-run OK   ${m.name}`);
          }
          throw ROLLBACK;
        });
      } catch (error) {
        if (error !== ROLLBACK) {
          console.error(`dry-run FAILED at ${current}: ${error.message}`);
          process.exit(1);
        }
      }
      console.log(`DRY RUN PASSED: ${bodies.length} migrations executed and their transaction rolled back. External effects and sequence increments are not covered by rollback.`);
      return;
    }

    for (const m of bodies) {
      try {
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout = '10s'`;
          await tx`set local statement_timeout = '120s'`;
          await tx.unsafe(m.body);
          await tx`insert into supabase_migrations.schema_migrations (version, name)
                   values (${m.version}, ${m.label})`;
        });
        console.log(`applied      ${m.name}`);
      } catch (error) {
        console.error(`FAILED       ${m.name}: ${error.message}`);
        console.error("This migration was rolled back. Earlier migrations in this run stay applied. Fix and re-run.");
        process.exit(1);
      }
    }
    console.log(`APPLIED ${bodies.length} migrations. Run "Supabase Migration Drift" to confirm IN_SYNC.`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
