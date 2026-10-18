import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Key schema objects the application depends on. History rows alone can say
 * IN_SYNC while an object is missing (or say DRIFT while it is live), so the
 * audit also checks the objects themselves. `severity: "warning"` reports
 * without failing the run (used for hardening that is written but pending).
 */
export const OBJECT_CHECKS = Object.freeze([
  {
    id: "builder_messages.request_id/kind/branch",
    severity: "error",
    sql: `select count(*) = 3 as ok from information_schema.columns
          where table_schema = 'public' and table_name = 'builder_messages'
            and column_name in ('request_id', 'kind', 'branch')`,
  },
  { id: "lead_tasks", severity: "error", sql: `select to_regclass('public.lead_tasks') is not null as ok` },
  { id: "image_records", severity: "error", sql: `select to_regclass('public.image_records') is not null as ok` },
  {
    id: "ai_paid_daily_budget",
    severity: "error",
    sql: `select to_regclass('public.ai_paid_daily_budget') is not null as ok`,
  },
  {
    id: "no anon TRUNCATE on invoices/platform_accounts/platform_trials",
    severity: "warning",
    pending: "20261018090400",
    sql: `select not exists (
            select 1 from information_schema.role_table_grants
            where table_schema = 'public'
              and table_name in ('invoices', 'platform_accounts', 'platform_trials')
              and grantee = 'anon' and privilege_type = 'TRUNCATE'
          ) as ok`,
  },
]);

/** Pure: turns check results into report entries and the exit decision. */
export function summarizeObjectChecks(results) {
  const failures = [];
  const warnings = [];
  for (const { check, ok, error } of results) {
    if (ok === true) continue;
    const reason = error ? `check failed to run: ${error}` : "missing";
    const line = check.pending ? `${check.id}: pending ${check.pending}` : `${check.id}: ${reason}`;
    if (check.severity === "warning") warnings.push(error ? `${line} (${reason})` : line);
    else failures.push(line);
  }
  return { failures, warnings };
}

/** Pure: compares repo migration names with recorded history. */
export function compareHistory(repoMigrations, rows) {
  const liveMigrations = rows.map((row) => `${row.version}_${row.name}`).sort();
  const repoSet = new Set(repoMigrations);
  const liveSet = new Set(liveMigrations);
  return {
    liveMigrations,
    repoOnly: repoMigrations.filter((name) => !liveSet.has(name)),
    liveOnly: liveMigrations.filter((name) => !repoSet.has(name)),
  };
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "Migration drift audit requires SUPABASE_DB_URL (or DATABASE_URL). No database credential is read from source control.",
    );
    process.exit(2);
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(connectionString, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
  });

  try {
    const repoMigrations = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, -4))
      .sort();

    let rows;
    try {
      rows = await sql`select version, name from supabase_migrations.schema_migrations order by version asc`;
    } catch (error) {
      // 42501: the connecting role cannot read Supabase's internal migration
      // schema (common for pooled/app roles). That is a credential-scope issue,
      // not drift, so report it clearly instead of crashing with a stack trace.
      if (error && typeof error === "object" && error.code === "42501") {
        console.log(
          JSON.stringify(
            {
              status: "UNVERIFIABLE",
              reason:
                "permission denied for schema supabase_migrations. Use a connection string for a role that can read supabase_migrations.schema_migrations (e.g. the postgres role), or run `supabase migration list` with the Supabase CLI.",
              repoCount: repoMigrations.length,
            },
            null,
            2,
          ),
        );
        process.exit(3);
      }
      throw error;
    }

    const { liveMigrations, repoOnly, liveOnly } = compareHistory(repoMigrations, rows);

    // Read-only object checks, inside a read-only transaction.
    const results = [];
    for (const check of OBJECT_CHECKS) {
      try {
        const [row] = await sql.begin("read only", (tx) => tx.unsafe(check.sql));
        results.push({ check, ok: row?.ok === true });
      } catch (error) {
        results.push({ check, ok: false, error: error instanceof Error ? error.message.slice(0, 160) : "error" });
      }
    }
    const objects = summarizeObjectChecks(results);

    const drift = repoOnly.length > 0 || liveOnly.length > 0;
    const report = {
      status: drift || objects.failures.length ? "DRIFT" : "IN_SYNC",
      repoCount: repoMigrations.length,
      liveCount: liveMigrations.length,
      repoOnly,
      liveOnly,
      objectFailures: objects.failures,
      objectWarnings: objects.warnings,
    };

    console.log(JSON.stringify(report, null, 2));
    for (const warning of objects.warnings) console.log(`::warning::${warning}`);
    process.exit(report.status === "DRIFT" ? 1 : 0);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
