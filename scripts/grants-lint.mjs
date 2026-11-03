#!/usr/bin/env node
/**
 * SUPABASE TABLE GRANTS LINT (static, no database needed)
 * =======================================================
 * Every table a migration creates in schema public must say, in that same
 * migration, which roles may touch it: at least one explicit
 * `GRANT ... ON [TABLE] public.<table> TO <role>`. Relying on Supabase's
 * default privileges is not allowed. Those defaults differ between projects
 * and have changed over time, and a table that only works because of them
 * breaks (or over-exposes) silently.
 *
 * Replays supabase/migrations/*.sql, then drizzle/migrations/*.sql, each in
 * filename order, and reports:
 *
 *  ERROR  missing-grant  table created in public with no GRANT naming it in
 *                        the same migration file
 *
 * Understood grant forms:
 *   grant select, insert on public.t, public.u to authenticated;
 *   grant all on table public.t to service_role;
 *   grant ... on all tables in schema public to ...   (covers every table
 *                                                     created earlier in
 *                                                     that file)
 *   do $$ ... foreach t in array ... execute format('grant ... on public.%I
 *   to ...', t) ...  (every quoted name in that block's array literals)
 *
 * Tables that predate this lint are listed in scripts/grants-lint.baseline.json
 * and reported as ACCEPTED. Do not add new names there: put the GRANTs in the
 * migration instead. The baseline can only shrink.
 *
 * Usage:
 *   node scripts/grants-lint.mjs              exit 1 on any non-accepted ERROR
 *   node scripts/grants-lint.mjs --json       machine-readable output
 *   node scripts/grants-lint.mjs --dir <path> lint only this dir (repeatable; tests)
 *   node scripts/grants-lint.mjs --baseline <file>
 */
import { readFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dirs = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--dir") dirs.push(args[i + 1]);
if (dirs.length === 0) dirs.push(...["supabase/migrations", "drizzle/migrations"].filter((d) => existsSync(d)));
const baselineIdx = args.indexOf("--baseline");
const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : join("scripts", "grants-lint.baseline.json");
const baseline = new Set(existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).tables ?? [] : []);

/** Strip comments, keep string/dollar-quoted bodies, split on top-level ';'. */
function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  let dollar = null;
  while (i < sql.length) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (dollar) {
      if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
      cur += c; i++; continue;
    }
    if (two === "--") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    if (two === "/*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") j += 2; else if (sql[j] === "'") break; else j++; }
      cur += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) { dollar = m[0]; cur += m[0]; i += m[0].length; continue; }
    }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ident = String.raw`"?([A-Za-z0-9_]+)"?`;
const norm = (n) => n.toLowerCase();
const CREATE_TABLE = new RegExp(
  String.raw`^create (?:(?:global |local )?(?:temp|temporary) |unlogged )?table (?:if not exists )?(?:${ident}\.)?${ident}`,
  "i",
);

const tables = new Map(); // name -> { file, granted }
const files = [];
for (const dir of dirs) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) files.push({ dir, file: f });
}

for (const { dir, file } of files) {
  const label = `${dir}/${file}`;
  const createdHere = [];
  const grantedHere = new Set();
  let allTablesGrant = false;
  for (const s of splitStatements(readFileSync(join(dir, file), "utf8"))) {
    const flat = s.replace(/\s+/g, " ");
    let m;
    if ((m = CREATE_TABLE.exec(flat))) {
      const temp = /^create (?:(?:global |local )?(?:temp|temporary)) /i.test(flat);
      const schema = m[1] ? norm(m[1]) : "public";
      if (!temp && schema === "public") {
        const name = norm(m[2]);
        if (!tables.has(name)) {
          tables.set(name, { file: label, granted: false });
          createdHere.push(name);
        }
      }
      continue;
    }
    if ((m = new RegExp(String.raw`^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$`, "i").exec(flat))) {
      for (const part of m[1].split(",")) {
        const t = /(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*$/i.exec(part.trim());
        if (t) tables.delete(norm(t[1]));
      }
      continue;
    }
    if ((m = new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(?:"?public"?\.)?${ident} rename to ${ident}`, "i").exec(flat))) {
      const t = tables.get(norm(m[1]));
      if (t) { tables.delete(norm(m[1])); tables.set(norm(m[2]), t); }
      continue;
    }
    if (/^grant /i.test(flat)) {
      if (/ on all tables in schema "?public"? /i.test(flat)) { allTablesGrant = true; continue; }
      const on = /^grant .+? on (?:table )?(.+?) to /i.exec(flat);
      if (on && !/^(?:function|sequence|schema|all (?:functions|sequences|routines)|routine|procedure|type|domain) /i.test(on[1])) {
        for (const part of on[1].split(",")) {
          const t = /^(?:"?([A-Za-z0-9_]+)"?\.)?"?([A-Za-z0-9_]+)"?$/.exec(part.trim());
          if (t && (!t[1] || norm(t[1]) === "public")) grantedHere.add(norm(t[2]));
        }
      }
      continue;
    }
    // Dynamic grants: DO block looping over name arrays with format('grant ... on public.%I ...').
    if (/^do\s+\$/i.test(flat) && /format\s*\(\s*'grant [^']* on (?:table )?(?:public\.)?%I/i.test(flat)) {
      for (const arr of s.matchAll(/array\s*\[([^\]]*)\]/gi)) {
        for (const q of arr[1].matchAll(/'([A-Za-z0-9_]+)'/g)) grantedHere.add(norm(q[1]));
      }
    }
  }
  for (const name of createdHere) {
    const t = tables.get(name);
    if (t && (allTablesGrant || grantedHere.has(name))) t.granted = true;
  }
}

const findings = [];
for (const [name, t] of tables) {
  if (t.granted) continue;
  findings.push({
    level: "ERROR",
    rule: "missing-grant",
    object: name,
    file: t.file,
    detail: "table created in public without an explicit GRANT in the same migration",
    accepted: baseline.has(name),
  });
}
const live = findings.filter((f) => !f.accepted);
const staleBaseline = [...baseline].filter((n) => !findings.some((f) => f.object === n));
const summary = {
  migrations: files.length,
  tables: tables.size,
  errors: live.length,
  accepted: findings.length - live.length,
  staleBaseline: staleBaseline.length,
};

if (asJson) {
  console.log(JSON.stringify({ summary, findings, staleBaseline }, null, 2));
} else {
  console.log(`Grants lint: ${summary.migrations} migrations (${dirs.join(", ")}), ${summary.tables} public tables`);
  for (const f of live) console.log(`ERROR    ${f.rule} ${f.object} (${f.file}) ${f.detail}`);
  if (staleBaseline.length) {
    console.log(`Note: ${staleBaseline.length} baseline entr${staleBaseline.length === 1 ? "y is" : "ies are"} no longer needed and can be removed: ${staleBaseline.join(", ")}`);
  }
  console.log(`\nErrors: ${summary.errors}  Accepted (pre-existing, baseline): ${summary.accepted}`);
  if (live.length) {
    console.log("Fix: add explicit GRANTs in the migration that creates the table, e.g.");
    console.log("  grant select on public.<table> to authenticated;  grant all on public.<table> to service_role;");
  }
}
if (process.env.GITHUB_STEP_SUMMARY && !asJson) {
  const rows = live.map((f) => `| ${f.rule} | \`${f.object}\` | ${f.file} |`).join("\n");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Supabase grants lint\n${summary.tables} public tables. Errors: **${summary.errors}**, accepted (baseline): ${summary.accepted}\n\n${rows ? `| Rule | Table | Migration |\n|---|---|---|\n${rows}\n` : ""}`,
  );
}
process.exitCode = live.length ? 1 : 0;
