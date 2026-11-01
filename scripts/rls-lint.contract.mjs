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
process.exit(failed ? 1 : 0);
