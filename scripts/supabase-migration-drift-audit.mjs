import { readdirSync } from "node:fs";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Migration drift audit requires SUPABASE_DB_URL (or DATABASE_URL). No database credential is read from source control.",
  );
  process.exit(2);
}

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

  const rows = await sql`select version, name from supabase_migrations.schema_migrations order by version asc`;

  const liveMigrations = rows.map((row) => `${row.version}_${row.name}`).sort();
  const repoSet = new Set(repoMigrations);
  const liveSet = new Set(liveMigrations);

  const repoOnly = repoMigrations.filter((name) => !liveSet.has(name));
  const liveOnly = liveMigrations.filter((name) => !repoSet.has(name));

  const report = {
    status: repoOnly.length || liveOnly.length ? "DRIFT" : "IN_SYNC",
    repoCount: repoMigrations.length,
    liveCount: liveMigrations.length,
    repoOnly,
    liveOnly,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(repoOnly.length || liveOnly.length ? 1 : 0);
} finally {
  await sql.end({ timeout: 2 }).catch(() => undefined);
}
