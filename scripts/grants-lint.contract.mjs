// Contract test for scripts/grants-lint.mjs: it must flag a table created
// without explicit GRANTs and pass every grant form the repo uses.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const EMPTY_BASELINE = join(mkdtempSync(join(tmpdir(), "grants-lint-bl-")), "baseline.json");
writeFileSync(EMPTY_BASELINE, JSON.stringify({ tables: [] }));

function lint(files, baseline = EMPTY_BASELINE) {
  const dir = mkdtempSync(join(tmpdir(), "grants-lint-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  const r = spawnSync(process.execPath, ["scripts/grants-lint.mjs", "--dir", dir, "--json", "--baseline", baseline], { encoding: "utf8" });
  return { code: r.status, report: JSON.parse(r.stdout) };
}
const flagged = (x) => x.report.findings.filter((f) => !f.accepted).map((f) => f.object).sort();
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) failed++; };

const bad = lint({
  "20270101000000_new.sql": `
    create table if not exists public.no_grants (id int);
    alter table public.no_grants enable row level security;
    revoke all on public.no_grants from public, anon, authenticated;
    grant execute on function public.no_grants_fn() to service_role;
    create table public.has_grants (id int);
    grant select on public.has_grants to authenticated;
  `,
});
check("a new table without GRANTs fails", bad.code === 1 && JSON.stringify(flagged(bad)) === '["no_grants"]');

const later = lint({
  "20270101000000_a.sql": "create table public.granted_later (id int);",
  "20270102000000_b.sql": "grant all on public.granted_later to service_role;",
});
check("a GRANT in a later migration does not count", later.code === 1 && JSON.stringify(flagged(later)) === '["granted_later"]');

const good = lint({
  "20270101000000_forms.sql": `
    create table public."Quoted" (id int);
    create table public.plain (id int);
    create table multi_a (id int);
    create table public.multi_b (id int);
    create table private.not_public (id int);
    create temp table scratch (id int);
    create table public.gone (id int);
    grant select, insert on table public."Quoted" to authenticated;
    grant all on public.plain to service_role;
    grant select on multi_a, public.multi_b to authenticated;
    drop table if exists public.gone;
  `,
  "20270102000000_all.sql": `
    create table public.covered (id int);
    grant select on all tables in schema public to service_role;
  `,
  "20270103000000_dynamic.sql": `
    create table public.dyn_a (id int);
    create table public.dyn_b (id int);
    do $$ declare t text; begin
      foreach t in array array['dyn_a', 'dyn_b'] loop
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      end loop;
    end $$;
  `,
  "0001_drizzle_style.sql": `CREATE TABLE IF NOT EXISTS public.upper_case (id int);\nGRANT SELECT ON public.upper_case TO authenticated;`,
});
check("every supported grant form passes", good.code === 0 && flagged(good).length === 0);
check("non-public, temp and dropped tables are ignored", !good.report.findings.some((f) => ["not_public", "scratch", "gone"].includes(f.object)));

const baselineFile = join(mkdtempSync(join(tmpdir(), "grants-lint-bl-")), "baseline.json");
writeFileSync(baselineFile, JSON.stringify({ tables: ["legacy", "fixed_since"] }));
const legacy = lint(
  {
    "20200101000000_old.sql": "create table public.legacy (id int);",
    "20200102000000_old.sql": "create table public.fixed_since (id int); grant select on public.fixed_since to authenticated;",
  },
  baselineFile,
);
check("baseline tables are accepted", legacy.code === 0 && legacy.report.summary.accepted === 1);
check("baseline entries that are no longer needed are reported", JSON.stringify(legacy.report.staleBaseline) === '["fixed_since"]');

const two = spawnSync(process.execPath, ["scripts/grants-lint.mjs", "--json"], { encoding: "utf8" });
const repo = JSON.parse(two.stdout);
check("the repo's own migrations pass (supabase + drizzle)", two.status === 0 && repo.summary.errors === 0);
check("the repo baseline has no stale entries", repo.summary.staleBaseline === 0);
process.exit(failed ? 1 : 0);
