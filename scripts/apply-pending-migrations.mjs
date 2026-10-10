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

async function main() {
  const mode = (process.env.MODE || "plan").toLowerCase();
  if (!["plan", "dry-run", "apply"].includes(mode)) {
    console.error("MODE must be plan, dry-run or apply.");
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
