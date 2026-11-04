// Contract test for scripts/rls-lint.mjs: it must flag known-bad SQL and pass known-good SQL.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function lint(sql) {
  const dir = mkdtempSync(join(tmpdir(), "rls-lint-"));
  writeFileSync(join(dir, "20260101000000_t.sql"), sql);
  const r = spawnSync(process.execPath, ["scripts/rls-lint.mjs", "--dir", dir, "--json", "--enforce"], { encoding: "utf8" });
  return { code: r.status, report: JSON.parse(r.stdout) };
}
const rules = (x) => x.report.findings.filter((f) => !f.accepted && f.level === "ERROR").map((f) => f.rule).sort();
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) failed++; };

const bad = lint(`
create table public.a (id int);
create table public.b (id int);
alter table public.b enable row level security;
create policy "p" on public.b for insert to anon with check (true);
create function public.f() returns int language sql security definer as $$ select 1 $$;
`);
check("bad sql exits 1 in enforce mode", bad.code === 1);
check("bad sql flags all three rules", JSON.stringify(rules(bad)) === JSON.stringify(["definer-no-search-path", "open-write-policy", "rls-disabled"]));

const good = lint(`
create table public.a (id int, org uuid);
alter table public.a enable row level security;
create policy "a_read" on public.a for select to anon using (true);
create policy "a_rw" on public.a for all to authenticated using (org is not null) with check (org is not null);
create function public.f() returns int language sql security definer set search_path = public as $$ select 1 $$;
create table public.gone (id int);
drop table public.gone;
create table other.ignored (id int);
`);
check("good sql passes", good.code === 0 && rules(good).length === 0);
check("dropped and non-public tables are ignored", good.report.summary.tables === 1);

const dyn = lint(`
create table public.x (id int);
do $$ declare t text; all_t text[] := array['x'];
begin foreach t in array all_t loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for all to authenticated using (true)', t || '_p', t);
end loop; end $$;
`);
check("dynamic DO-loop RLS is understood", dyn.report.summary.tables === 1 && rules(dyn).length === 0);
const guardedBad = lint(`
create table public.g (id int);
alter table public.g enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'g' and policyname = 'g_open') then
    create policy "g_open" on public.g for insert to anon with check (true);
  end if;
end $$;
`);
check("a policy guarded by IF NOT EXISTS is still linted", JSON.stringify(rules(guardedBad)) === JSON.stringify(["open-write-policy"]));

const guardedGood = lint(`
create table public.h (id int, org uuid);
alter table public.h enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'h' and policyname = 'h_read') then
    create policy "h_read" on public.h for select to authenticated using (org is not null);
  end if;
end $$;
`);
check(
  "a guarded policy counts as the table's policy",
  guardedGood.code === 0 && rules(guardedGood).length === 0 && !guardedGood.report.findings.some((f) => f.rule === "no-policy"),
);

// Multiple migration trees are replayed in order (supabase, then drizzle).
{
  const a = mkdtempSync(join(tmpdir(), "rls-lint-a-"));
  const b = mkdtempSync(join(tmpdir(), "rls-lint-b-"));
  writeFileSync(join(a, "20260101000000_a.sql"), "create table public.base (id int); alter table public.base enable row level security;");
  writeFileSync(join(b, "0001_b.sql"), "create table public.later (id int); alter table public.base disable row level security;");
  const r = spawnSync(process.execPath, ["scripts/rls-lint.mjs", "--dir", a, "--dir", b, "--json", "--enforce"], { encoding: "utf8" });
  const report = JSON.parse(r.stdout);
  const flagged = report.findings.filter((f) => f.rule === "rls-disabled").map((f) => f.object).sort();
  check("second dir is replayed after the first", r.status === 1 && JSON.stringify(flagged) === JSON.stringify(["base", "later"]));
  check("findings from later dirs name their tree", report.findings.some((f) => f.file === `${b}/0001_b.sql`));
}

// The default run covers the builder-track drizzle migrations too.
{
  const r = spawnSync(process.execPath, ["scripts/rls-lint.mjs", "--json"], { encoding: "utf8" });
  const report = JSON.parse(r.stdout);
  check("default run lints supabase and drizzle migrations", JSON.stringify(report.summary.dirs) === JSON.stringify(["supabase/migrations", "drizzle/migrations"]));
}
process.exit(failed ? 1 : 0);
