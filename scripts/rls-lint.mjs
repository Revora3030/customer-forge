#!/usr/bin/env node
/**
 * SUPABASE RLS / POLICY LINT (static, no database needed)
 * =======================================================
 * Replays supabase/migrations/*.sql in filename order (the order Supabase
 * applies them) and reports what the repo says the final state is:
 *
 *  ERROR  table in schema public without ROW LEVEL SECURITY enabled
 *  ERROR  permissive write/ALL policy with USING (true) / WITH CHECK (true)
 *         for anon, authenticated or public (read policies are allowed)
 *  ERROR  SECURITY DEFINER function without an explicit SET search_path
 *  WARN   table with RLS but no policy at all (deny-all: fine only for
 *         service_role-only tables; confirm that is intended)
 *  WARN   view without security_invoker (runs as its owner, bypasses RLS)
 *
 * Known limits (it is a lint, not a proof): it does not query the live
 * database (live state can differ from the repo, see the migration drift
 * report); policies/RLS created by dynamic SQL are only understood for the
 * `foreach t in array ... execute format('alter table public.%I enable row
 * level security')` pattern (and `create policy %I on public.%I` in the same
 * block), where every quoted name in the block's array literals is treated as
 * enabled / having a policy.
 *
 * Findings listed in scripts/rls-lint.allowlist.json ("rule:object") are
 * reported as ACCEPTED and do not count.
 *
 * Usage:
 *   node scripts/rls-lint.mjs                 exit 1 only on ERROR with --enforce
 *   node scripts/rls-lint.mjs --enforce       exit 1 on any non-accepted ERROR
 *   node scripts/rls-lint.mjs --json          machine-readable output
 *   node scripts/rls-lint.mjs --dir <path>    lint another migrations dir (tests)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const enforce = args.includes("--enforce");
const asJson = args.includes("--json");
const dirIdx = args.indexOf("--dir");
const dir = dirIdx >= 0 ? args[dirIdx + 1] : "supabase/migrations";
const allowPath = join("scripts", "rls-lint.allowlist.json");
const allow = new Map();
if (existsSync(allowPath)) {
  for (const e of JSON.parse(readFileSync(allowPath, "utf8")).accepted ?? []) allow.set(e.id, e.reason);
}

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

const ident = String.raw`(?:"?([A-Za-z0-9_]+)"?)`;
const qual = String.raw`(?:"?public"?\.)?${ident}`;
const norm = (n) => n.toLowerCase();

const tables = new Map(); // name -> {file, rls, policies:Set}
const views = new Map(); // name -> {file, invoker}
const functions = new Map(); // key -> {file, definer, searchPath}
const policies = []; // {table, name, cmd, roles, using, check, file}

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const stmts = splitStatements(readFileSync(join(dir, file), "utf8"));
  for (const s of stmts) {
    const flat = s.replace(/\s+/g, " ");
    let m;
    if ((m = new RegExp(`^create (?:unlogged )?table (?:if not exists )?${qual}`, "i").exec(flat)) && !/^create table \S+\.\S+/i.test(flat.replace(/"?public"?\./i, "")) ) {
      const name = norm(m[1]);
      if (!tables.has(name)) tables.set(name, { file, rls: false, policies: new Set() });
      continue;
    }
    if ((m = new RegExp(`^drop table (?:if exists )?${qual}`, "i").exec(flat))) { tables.delete(norm(m[1])); continue; }
    if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?${qual} rename to ${ident}`, "i").exec(flat))) {
      const t = tables.get(norm(m[1]));
      if (t) { tables.delete(norm(m[1])); tables.set(norm(m[2]), t); }
      continue;
    }
    if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?${qual} (enable|disable|force) row level security`, "i").exec(flat))) {
      const t = tables.get(norm(m[1]));
      if (t && m[2].toLowerCase() === "enable") t.rls = true;
      if (t && m[2].toLowerCase() === "disable") t.rls = false;
      continue;
    }
    if ((m = new RegExp(`^create policy "?([^"]+?)"? on ${qual}(.*)$`, "i").exec(flat))) {
      const rest = m[3];
      const cmd = (/ for (all|select|insert|update|delete)\b/i.exec(rest)?.[1] ?? "all").toLowerCase();
      const roles = (/ to ([a-z_, "]+?)(?= using| with check|$)/i.exec(rest)?.[1] ?? "public").toLowerCase().replace(/["\s]/g, "").split(",");
      const using = /using \((.*?)\)(?= with check|$)/i.exec(rest)?.[1]?.trim() ?? null;
      const check = /with check \((.*)\)$/i.exec(rest)?.[1]?.trim() ?? null;
      const tname = norm(m[2]);
      policies.push({ table: tname, name: m[1], cmd, roles, using, check, file });
      tables.get(tname)?.policies.add(m[1]);
      continue;
    }
    if ((m = new RegExp(`^drop policy (?:if exists )?"?([^"]+?)"? on ${qual}`, "i").exec(flat))) {
      const tname = norm(m[2]);
      tables.get(tname)?.policies.delete(m[1]);
      for (let i = policies.length - 1; i >= 0; i--) if (policies[i].table === tname && policies[i].name === m[1]) policies.splice(i, 1);
      continue;
    }
    if ((m = new RegExp(`^create (?:or replace )?(?:materialized )?view ${qual}(.*)$`, "i").exec(flat))) {
      views.set(norm(m[1]), { file, invoker: /security_invoker\s*=\s*(true|on)/i.test(m[2]) });
      continue;
    }
    if ((m = new RegExp(`^alter view (?:if exists )?${qual} set \\(.*security_invoker\\s*=\\s*(true|on)`, "i").exec(flat))) {
      const v = views.get(norm(m[1])); if (v) v.invoker = true; continue;
    }
    if ((m = new RegExp(`^drop view (?:if exists )?${qual}`, "i").exec(flat))) { views.delete(norm(m[1])); continue; }
    if ((m = new RegExp(`^create (?:or replace )?function ${qual}\\s*\\(`, "i").exec(flat))) {
      const header = flat.split(/\bas\s+\$/i)[0];
      functions.set(norm(m[1]) + ":" + file, {
        name: norm(m[1]), file,
        definer: /security definer/i.test(header),
        searchPath: /set search_path/i.test(header),
      });
      continue;
    }
    // Dynamic RLS: DO block looping over name arrays and enabling RLS via format().
    if (/^do\s+\$/i.test(flat) && /enable row level security/i.test(flat) && /format\s*\(/i.test(flat)) {
      for (const arr of s.matchAll(/array\s*\[([^\]]*)\]/gi)) {
        for (const q of arr[1].matchAll(/'([A-Za-z0-9_]+)'/g)) {
          const t = tables.get(norm(q[1]));
          if (t) {
            t.rls = true;
            if (/create policy %I on public\.%I/i.test(flat)) t.policies.add("(dynamic policy)");
          }
        }
      }
    }
  }
}

// Later `create or replace function` for the same name: keep the latest definition per name.
const latestFn = new Map();
for (const f of functions.values()) latestFn.set(f.name, f);

const findings = [];
const add = (level, rule, object, detail, file) => {
  const id = `${rule}:${object}`;
  findings.push({ level, rule, object, detail, file, accepted: allow.has(id), reason: allow.get(id) ?? null, id });
};
for (const [name, t] of tables) {
  if (!t.rls) add("ERROR", "rls-disabled", name, "table in public has no ENABLE ROW LEVEL SECURITY in migrations", t.file);
  else if (t.policies.size === 0) add("WARN", "no-policy", name, "RLS on but no policy: deny-all for anon/authenticated (ok only for service-role-only tables)", t.file);
}
for (const p of policies) {
  const open = (x) => x && /^\(?\s*true\s*\)?$/i.test(x);
  const risky = p.roles.some((r) => ["anon", "authenticated", "public"].includes(r));
  if (risky && p.cmd !== "select" && (open(p.using) || open(p.check))) {
    add("ERROR", "open-write-policy", `${p.table}.${p.name}`, `${p.cmd.toUpperCase()} policy for ${p.roles.join(",")} is always true`, p.file);
  }
}
for (const f of latestFn.values()) {
  if (f.definer && !f.searchPath) add("ERROR", "definer-no-search-path", f.name, "SECURITY DEFINER function without SET search_path", f.file);
}
for (const [name, v] of views) {
  if (!v.invoker) add("WARN", "view-not-invoker", name, "view runs with its owner's rights (bypasses RLS of underlying tables); fine only if intentional and exposes safe columns", v.file);
}

const live = findings.filter((f) => !f.accepted);
const errors = live.filter((f) => f.level === "ERROR");
const warns = live.filter((f) => f.level === "WARN");
const summary = {
  migrations: files.length, tables: tables.size, policies: policies.length, views: views.size,
  errors: errors.length, warnings: warns.length, accepted: findings.length - live.length,
};
if (asJson) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  console.log(`RLS lint: ${summary.migrations} migrations, ${summary.tables} tables, ${summary.policies} policies, ${summary.views} views`);
  for (const f of findings) {
    console.log(`${f.accepted ? "ACCEPTED" : f.level.padEnd(8)} ${f.rule} ${f.object} (${f.file}) ${f.detail}${f.accepted ? ` [accepted: ${f.reason}]` : ""}`);
  }
  console.log(`\nErrors: ${summary.errors}  Warnings: ${summary.warnings}  Accepted: ${summary.accepted}`);
  console.log(enforce ? "Mode: ENFORCE" : "Mode: WARN (report only; pass --enforce to fail on errors)");
}
if (process.env.GITHUB_STEP_SUMMARY && !asJson) {
  const { appendFileSync } = await import("node:fs");
  const rows = live.map((f) => `| ${f.level} | ${f.rule} | \`${f.object}\` | ${f.file} |`).join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Supabase RLS lint\n${summary.tables} tables, ${summary.policies} policies. Errors: **${summary.errors}**, warnings: ${summary.warnings}, accepted: ${summary.accepted}\n\n| Level | Rule | Object | Migration |\n|---|---|---|---|\n${rows}\n`);
}
process.exitCode = enforce && errors.length ? 1 : 0;
