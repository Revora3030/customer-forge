// Applies repository migrations that are missing from
// supabase_migrations.schema_migrations, in version order.
//
//   MODE=dry-run (default): runs every pending migration inside ONE transaction,
//                           then ROLLS BACK. Nothing is changed.
//   MODE=apply             : runs each pending migration in its own transaction
//                           and records it in schema_migrations. Stops at the
//                           first failure (that migration is rolled back; earlier
//                           ones stay applied and recorded).
//
// Never deletes or edits recorded history. Never touches live-only migrations.
// Reads the connection string from SUPABASE_DB_URL (or DATABASE_URL) only.

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

/** Statements that cannot run inside a transaction block. */
export function nonTransactionalStatements(sql) {
  return /\b(CREATE|DROP)\s+INDEX\s+CONCURRENTLY\b|\bVACUUM\b|\bALTER\s+SYSTEM\b/i.test(sql);
}

async function main() {
  const mode = (process.env.MODE || "dry-run").toLowerCase();
  if (!["dry-run", "apply"].includes(mode)) {
    console.error(`MODE must be dry-run or apply (got ${mode})`);
    process.exit(2);
  }
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("SUPABASE_DB_URL (or DATABASE_URL) is required.");
    process.exit(2);
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, prepare: false, onnotice: () => {} });

  try {
    const repo = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, -4));
    const live = await sql`select version, name from supabase_migrations.schema_migrations`;
    const pending = planPending(repo, live);

    console.log(JSON.stringify({ mode, liveCount: live.length, repoCount: repo.length, pending: pending.map((p) => p.name) }, null, 2));
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
      console.log(`DRY RUN PASSED: all ${bodies.length} pending migrations executed in order and were rolled back. Nothing changed.`);
      return;
    }

    for (const m of bodies) {
      try {
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout = '10s'`;
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
