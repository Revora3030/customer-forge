/**
 * Static RLS model built by replaying supabase/migrations in order.
 *
 * Why static: CI has no Postgres (the "Supabase Preview" check is an external
 * app linked to a different project), so the cross-tenant suite replays the
 * migration text instead. The model is deliberately conservative: it only
 * understands the DDL shapes the repo actually uses (plus the one DO-loop that
 * generates `<table>_member_all` policies) and the tests below it fail loudly
 * if a tenant table ends up with RLS off or an unscoped write policy.
 *
 * This reports what the repo says, not what the live database holds.
 */

export type PolicyCmd = "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface PolicyModel {
  name: string;
  table: string; // "schema.table"
  cmd: PolicyCmd;
  permissive: boolean;
  /** lower-cased role names; ["public"] when no TO clause was given */
  roles: string[];
  using: string | null;
  withCheck: string | null;
  file: string;
}

export interface TableModel {
  key: string; // "schema.table"
  schema: string;
  name: string;
  columns: Set<string>;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policies: Map<string, PolicyModel>;
  createdIn: string;
  /** roles that had table privileges revoked/granted (informational) */
  grants: Map<string, Set<string>>;
  /** role -> privilege ("select" | "insert" | "update") -> column list, from column-level GRANTs */
  columnGrants: Map<string, Map<string, Set<string>>>;
}

export interface FunctionModel {
  key: string; // "schema.name"
  securityDefiner: boolean;
  hasSearchPath: boolean;
  file: string;
  /** full CREATE FUNCTION text of the last definition */
  definition: string;
  /** roles explicitly granted EXECUTE (lower-case); "public" means PUBLIC */
  revokedFrom: Set<string>;
  grantedTo: Set<string>;
}

export interface ViewModel {
  key: string;
  securityInvoker: boolean;
  securityBarrier: boolean;
  file: string;
}

export interface RlsModel {
  tables: Map<string, TableModel>;
  views: Map<string, ViewModel>;
  functions: Map<string, FunctionModel>;
  files: string[];
}

// ---------------------------------------------------------------------------
// Tokenising helpers
// ---------------------------------------------------------------------------

/** Remove `--` and block comments while respecting quotes and dollar quotes. */
export function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i] as string;
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      out += sql.slice(start, i);
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        // keep the dollar body verbatim but strip comments inside it
        const body = sql.slice(i + tag.length, end === -1 ? n : end);
        out += tag + stripComments(body) + (end === -1 ? "" : tag);
        i = stop;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Split on top-level `;`, respecting quotes and dollar quotes. */
export function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i] as string;
    if (c === "'" || c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      cur += sql.slice(start, i);
      continue;
    }
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        cur += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ";") {
      if (cur.trim()) stmts.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

/** Return the balanced `( ... )` content starting at the first "(" at/after `from`. */
function balanced(src: string, from: number): { text: string; end: number } | null {
  const open = src.indexOf("(", from);
  if (open === -1) return null;
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "'") {
      i++;
      while (i < src.length && src[i] !== "'") i++;
    } else if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { text: src.slice(open + 1, i).trim(), end: i + 1 };
    }
    i++;
  }
  return null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const unq = (s: string) => s.replace(/"/g, "").toLowerCase();

/** "public.foo" | foo | "public"."foo" -> "public.foo" */
export function qualify(raw: string, defaultSchema = "public"): string {
  const cleaned = raw.trim().replace(/"/g, "").toLowerCase();
  const parts = cleaned.split(".");
  if (parts.length >= 2) return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  return `${defaultSchema}.${cleaned}`;
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

function getTable(model: RlsModel, key: string, file: string): TableModel {
  let t = model.tables.get(key);
  if (!t) {
    const [schema = "public", name = key] = key.split(".");
    t = {
      key,
      schema,
      name,
      columns: new Set(),
      rlsEnabled: false,
      rlsForced: false,
      policies: new Map(),
      createdIn: file,
      // Supabase default privileges: new public tables are usable by the API
      // roles and RLS is the only barrier. Replayed REVOKEs narrow this.
      grants: new Map(
        schema === "public"
          ? (["anon", "authenticated", "service_role"] as const).map(
              (r) => [r, new Set(["select", "insert", "update", "delete"])] as [string, Set<string>],
            )
          : [],
      ),
      columnGrants: new Map(),
    };
    model.tables.set(key, t);
  }
  return t;
}

function parseColumns(body: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let cur = "";
  const parts: string[] = [];
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (/^(constraint|primary|unique|foreign|check|exclude|like)\b/i.test(t)) continue;
    const m = new RegExp(`^(${IDENT})\\s+\\S`).exec(t);
    if (m) cols.push(unq(m[1] as string));
  }
  return cols;
}

function parsePolicy(stmt: string, file: string): PolicyModel | null {
  const s = squash(stmt);
  const head = new RegExp(`^create policy\\s+(${IDENT})\\s+on\\s+(${QNAME})`, "i").exec(s);
  if (!head) return null;
  const name = (head[1] as string).replace(/^"|"$/g, "");
  const table = qualify(head[2] as string);
  const rest = s.slice(head[0].length);
  const permissive = !/^\s*as\s+restrictive\b/i.test(rest);
  const forM = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(rest);
  const cmd = (forM ? (forM[1] as string).toUpperCase() : "ALL") as PolicyCmd;
  // roles: text between "to" and "using"/"with check"/end
  let roles = ["public"];
  const toM = /\bto\s+(.+?)(?=\s+using\b|\s+with\s+check\b|$)/i.exec(rest);
  if (toM) {
    roles = (toM[1] as string)
      .split(",")
      .map((r) => unq(r.trim()))
      .filter(Boolean);
  }
  let using: string | null = null;
  let withCheck: string | null = null;
  const usingIdx = rest.search(/\busing\s*\(/i);
  if (usingIdx !== -1) using = balanced(rest, usingIdx)?.text ?? null;
  const wcIdx = rest.search(/\bwith\s+check\s*\(/i);
  if (wcIdx !== -1) withCheck = balanced(rest, wcIdx)?.text ?? null;
  return { name, table, cmd, permissive, roles, using, withCheck, file };
}

/** Expand `foreach t in array ARR loop ... execute format('...%I...', t ...) ... end loop`. */
function expandForeachLoops(body: string): string[] {
  const out: string[] = [];
  const arrays = new Map<string, string[]>();
  const declRe = /(\w+)\s+text\[\]\s*:=\s*array\s*\[([^\]]*)\]/gi;
  let dm: RegExpExecArray | null;
  while ((dm = declRe.exec(body))) {
    const items = [...(dm[2] as string).matchAll(/'([^']*)'/g)].map((x) => x[1] as string);
    arrays.set((dm[1] as string).toLowerCase(), items);
  }
  const loopRe = /foreach\s+(\w+)\s+in\s+array\s+(\w+)\s+loop([\s\S]*?)end\s+loop/gi;
  let lm: RegExpExecArray | null;
  while ((lm = loopRe.exec(body))) {
    const items = arrays.get((lm[2] as string).toLowerCase()) ?? [];
    const loopBody = lm[3] as string;
    const execRe = /execute\s+format\s*\(\s*'((?:[^']|'')*)'\s*(?:,\s*([^;]*?))?\)\s*;/gi;
    let em: RegExpExecArray | null;
    while ((em = execRe.exec(loopBody))) {
      const tmpl = (em[1] as string).replace(/''/g, "'");
      const args = (em[2] ?? "").split(/,(?![^(]*\))/).map((a) => a.trim());
      for (const item of items) {
        let idx = 0;
        const sql = tmpl.replace(/%[IsL]/g, () => {
          const a = args[idx++] ?? "";
          if (new RegExp(`^${lm![1] as string}\\s*\\|\\|\\s*'([^']*)'$`, "i").test(a)) {
            return item + (/\|\|\s*'([^']*)'$/.exec(a)?.[1] ?? "");
          }
          return item; // plain loop variable
        });
        out.push(sql);
      }
    }
  }
  return out;
}

function applyStatement(model: RlsModel, raw: string, file: string): void {
  const s = squash(raw);
  if (!s) return;

  // DO blocks: expand the known foreach-execute pattern and parse static DDL.
  if (/^do\b/i.test(s)) {
    const dm = /\$[A-Za-z_0-9]*\$([\s\S]*)\$[A-Za-z_0-9]*\$/.exec(raw);
    if (dm) {
      const body = dm[1] as string;
      for (const generated of expandForeachLoops(body)) applyStatement(model, generated, file);
      // static DDL inside the DO body (outside execute-with-%I templates)
      for (const inner of splitStatements(body)) {
        if (/^(create policy|alter table|drop policy|create table|revoke|grant)\b/i.test(squash(inner))) {
          applyStatement(model, inner, file);
        }
      }
    }
    return;
  }

  let m: RegExpExecArray | null;

  if (
    (m = new RegExp(`^create (?:unlogged )?table (?:if not exists )?(${QNAME})\\s*\\(`, "i").exec(s))
  ) {
    const key = qualify(m[1] as string);
    const t = getTable(model, key, file);
    const open = raw.indexOf("(", raw.toLowerCase().indexOf("table"));
    const b = balanced(raw, open);
    if (b) for (const c of parseColumns(b.text)) t.columns.add(c);
    return;
  }

  if ((m = new RegExp(`^drop table (?:if exists )?(${QNAME})`, "i").exec(s))) {
    model.tables.delete(qualify(m[1] as string));
    return;
  }

  if ((m = new RegExp(`^alter table (?:if exists )?(?:only )?(${QNAME})\\s+(.*)$`, "is").exec(s))) {
    const key = qualify(m[1] as string);
    const action = m[2] as string;
    const t = model.tables.get(key);
    if (/^rename to\s+/i.test(action)) {
      const nm = /^rename to\s+(\S+)/i.exec(action);
      if (t && nm) {
        model.tables.delete(key);
        const nk = `${t.schema}.${unq(nm[1] as string)}`;
        t.key = nk;
        t.name = unq(nm[1] as string);
        model.tables.set(nk, t);
      }
      return;
    }
    if (!t) return;
    if (/\benable row level security\b/i.test(action)) t.rlsEnabled = true;
    if (/\bdisable row level security\b/i.test(action)) t.rlsEnabled = false;
    if (/\bforce row level security\b/i.test(action)) t.rlsForced = true;
    if (/\bno force row level security\b/i.test(action)) t.rlsForced = false;
    for (const am of action.matchAll(
      new RegExp(`add column (?:if not exists )?(${IDENT})`, "gi"),
    )) {
      t.columns.add(unq(am[1] as string));
    }
    for (const dm of action.matchAll(new RegExp(`drop column (?:if exists )?(${IDENT})`, "gi"))) {
      t.columns.delete(unq(dm[1] as string));
    }
    for (const rm of action.matchAll(new RegExp(`rename column (${IDENT}) to (${IDENT})`, "gi"))) {
      t.columns.delete(unq(rm[1] as string));
      t.columns.add(unq(rm[2] as string));
    }
    return;
  }

  if (/^create policy\b/i.test(s)) {
    const p = parsePolicy(raw, file);
    if (p) getTable(model, p.table, file).policies.set(p.name, p);
    return;
  }

  if ((m = new RegExp(`^drop policy (?:if exists )?(${IDENT})\\s+on\\s+(${QNAME})`, "i").exec(s))) {
    const t = model.tables.get(qualify(m[2] as string));
    t?.policies.delete((m[1] as string).replace(/^"|"$/g, ""));
    return;
  }

  if (
    (m = new RegExp(`^alter policy (${IDENT})\\s+on\\s+(${QNAME})\\s+(.*)$`, "is").exec(s))
  ) {
    const t = model.tables.get(qualify(m[2] as string));
    const p = t?.policies.get((m[1] as string).replace(/^"|"$/g, ""));
    if (p) {
      const rest = m[3] as string;
      const toM = /^to\s+(.+?)(?=\s+using\b|\s+with\s+check\b|$)/i.exec(rest);
      if (toM) p.roles = (toM[1] as string).split(",").map((r) => unq(r.trim()));
      const ui = rest.search(/\busing\s*\(/i);
      if (ui !== -1) p.using = balanced(rest, ui)?.text ?? p.using;
      const wi = rest.search(/\bwith\s+check\s*\(/i);
      if (wi !== -1) p.withCheck = balanced(rest, wi)?.text ?? p.withCheck;
    }
    return;
  }

  // views
  if (
    (m = new RegExp(`^create (?:or replace )?(?:temp |temporary )?view (${QNAME})\\s*(.*)$`, "is").exec(s))
  ) {
    const key = qualify(m[1] as string);
    const rest = m[2] as string;
    const withM = /^with\s*\(([^)]*)\)/i.exec(rest);
    const opts = withM ? (withM[1] as string).toLowerCase() : "";
    model.views.set(key, {
      key,
      securityInvoker: /security_invoker\s*(=\s*(true|on|1))?/.test(opts) && !/security_invoker\s*=\s*(false|off|0)/.test(opts),
      securityBarrier: /security_barrier/.test(opts),
      file,
    });
    return;
  }
  if ((m = new RegExp(`^drop view (?:if exists )?(${QNAME})`, "i").exec(s))) {
    model.views.delete(qualify(m[1] as string));
    return;
  }
  if (
    (m = new RegExp(`^alter view (?:if exists )?(${QNAME})\\s+set\\s*\\((.*)\\)`, "i").exec(s))
  ) {
    const v = model.views.get(qualify(m[1] as string));
    if (v) {
      const o = (m[2] as string).toLowerCase();
      if (/security_invoker\s*=\s*(true|on)/.test(o)) v.securityInvoker = true;
      if (/security_invoker\s*=\s*(false|off)/.test(o)) v.securityInvoker = false;
    }
    return;
  }

  // functions
  if ((m = new RegExp(`^drop function (?:if exists )?(${QNAME})\\s*(\\([^)]*\\))?`, "i").exec(s))) {
    const fkey = functionKey(model, m[1] as string, m[2] as string | undefined);
    if (fkey) model.functions.delete(fkey);
    return;
  }
  if (
    (m = new RegExp(`^create (?:or replace )?function (${QNAME})\\s*\\(`, "i").exec(s))
  ) {
    const key = `${qualify(m[1] as string)}`;
    const sig = fnSignature(raw);
    const head = raw.replace(/\$[A-Za-z_0-9]*\$[\s\S]*\$[A-Za-z_0-9]*\$/g, " ");
    const fkey = `${key}(${sig})`;
    const prev = model.functions.get(fkey);
    model.functions.set(fkey, {
      key: fkey,
      securityDefiner: /\bsecurity\s+definer\b/i.test(head),
      hasSearchPath: /\bset\s+search_path\b/i.test(head),
      file,
      definition: raw,
      revokedFrom: prev?.revokedFrom ?? new Set(),
      grantedTo: prev?.grantedTo ?? new Set(),
    });
    return;
  }
  if (
    (m = new RegExp(`^alter function (${QNAME})\\s*(\\([^)]*\\))?\\s+(.*)$`, "is").exec(s))
  ) {
    const fkey = functionKey(model, m[1] as string, m[2] as string | undefined);
    const f = fkey ? model.functions.get(fkey) : undefined;
    if (f) {
      const rest = m[3] as string;
      if (/\bsecurity\s+definer\b/i.test(rest)) f.securityDefiner = true;
      if (/\bsecurity\s+invoker\b/i.test(rest)) f.securityDefiner = false;
      if (/\bset\s+search_path\b/i.test(rest)) f.hasSearchPath = true;
    }
    return;
  }
  if (
    (m = new RegExp(
      `^(revoke|grant)\\s+(?:all(?: privileges)?|execute)\\s+on\\s+function\\s+(${QNAME})\\s*(\\([^)]*\\))?\\s*(from|to)\\s+(.+)$`,
      "is",
    ).exec(s))
  ) {
    const fkey = functionKey(model, m[2] as string, m[3] as string | undefined);
    const roles = (m[5] as string)
      .replace(/\bcascade\b|\brestrict\b|\bwith grant option\b/gi, "")
      .split(",")
      .map((r) => unq(r.trim()))
      .filter(Boolean);
    if (fkey) {
      const f = model.functions.get(fkey);
      if (f) {
        const revoke = (m[1] as string).toLowerCase() === "revoke";
        for (const r of roles) {
          if (revoke) {
            f.revokedFrom.add(r);
            f.grantedTo.delete(r);
          } else {
            f.grantedTo.add(r);
            f.revokedFrom.delete(r);
          }
        }
      }
    }
    return;
  }

  // column-level grants: GRANT SELECT (a, b) ON t TO anon / REVOKE SELECT (a) ON t FROM anon
  if (
    (m = new RegExp(
      `^(grant|revoke)\\s+(select|insert|update|references)\\s*\\(([^)]*)\\)\\s+on\\s+(?:table\\s+)?(${QNAME})\\s+(to|from)\\s+(.+)$`,
      "is",
    ).exec(s))
  ) {
    const t = model.tables.get(qualify(m[4] as string));
    if (!t) return;
    const grant = (m[1] as string).toLowerCase() === "grant";
    const priv = (m[2] as string).toLowerCase();
    const cols = (m[3] as string).split(",").map((c) => unq(c.trim())).filter(Boolean);
    const roles = (m[6] as string)
      .replace(/\bwith grant option\b|\bcascade\b|\brestrict\b/gi, "")
      .split(",")
      .map((r) => unq(r.trim()))
      .filter(Boolean);
    for (const r of roles) {
      const byPriv = t.columnGrants.get(r) ?? new Map<string, Set<string>>();
      const set = byPriv.get(priv) ?? new Set<string>();
      for (const c of cols) grant ? set.add(c) : set.delete(c);
      byPriv.set(priv, set);
      t.columnGrants.set(r, byPriv);
    }
    return;
  }

  // table grants (informational)
  if (
    (m = new RegExp(
      `^(grant|revoke)\\s+(.+?)\\s+on\\s+(?:table\\s+)?(${QNAME}(?:\\s*,\\s*${QNAME})*)\\s+(to|from)\\s+(.+)$`,
      "is",
    ).exec(s))
  ) {
    if (/\bfunction\b|\ball (tables|functions|sequences) in schema\b/i.test(s)) return;
    const privs = (m[2] as string)
      .toLowerCase()
      .split(",")
      .map((p) => p.trim().replace(/ privileges$/, ""));
    const roles = (m[5] as string)
      .replace(/\bwith grant option\b|\bcascade\b|\brestrict\b/gi, "")
      .split(",")
      .map((r) => unq(r.trim()))
      .filter(Boolean);
    const grant = (m[1] as string).toLowerCase() === "grant";
    for (const tn of (m[3] as string).split(",")) {
      const t = model.tables.get(qualify(tn));
      if (!t) continue;
      for (const r of roles) {
        const set = t.grants.get(r) ?? new Set<string>();
        for (const p of privs) {
          const expanded = p === "all" ? ["select", "insert", "update", "delete"] : [p];
          for (const e of expanded) {
            if (grant) set.add(e);
            else {
              set.delete(e);
              t.columnGrants.get(r)?.delete(e); // table-level REVOKE also revokes column privileges
            }
          }
        }
        t.grants.set(r, set);
      }
    }
  }
}

function fnSignature(raw: string): string {
  const open = raw.indexOf("(");
  const b = balanced(raw, open);
  if (!b) return "";
  // argument types only, lower-cased, defaults stripped
  return b.text
    .split(/,(?![^(]*\))/)
    .map((a) => squash(a).replace(/\s+default\s+.*$/i, "").replace(/\s*=\s*.*$/, ""))
    .map((a) => {
      const parts = a.split(" ");
      // drop leading mode/name when there are 2+ tokens
      const mode = /^(in|out|inout|variadic)$/i.test(parts[0] ?? "") ? parts.shift() : undefined;
      void mode;
      return parts.length > 1 ? parts.slice(1).join(" ").toLowerCase() : (parts[0] ?? "").toLowerCase();
    })
    .filter(Boolean)
    .join(",");
}

function functionKey(model: RlsModel, rawName: string, argsRaw: string | undefined): string | null {
  const key = qualify(rawName);
  if (argsRaw !== undefined) {
    const inner = argsRaw.slice(1, -1);
    const sig = inner
      .split(",")
      .map((a) => squash(a).toLowerCase())
      .map((a) => {
        const parts = a.split(" ");
        return parts.length > 1 && !/^(double|character|timestamp|time)$/.test(parts[0] ?? "")
          ? parts.slice(1).join(" ")
          : a;
      })
      .filter(Boolean)
      .join(",");
    const exact = `${key}(${sig})`;
    if (model.functions.has(exact)) return exact;
  }
  // fall back: single overload by name
  const candidates = [...model.functions.keys()].filter((k) => k.startsWith(`${key}(`));
  if (candidates.length === 1) return candidates[0] as string;
  if (candidates.length > 1 && argsRaw !== undefined) {
    const argc = argsRaw.slice(1, -1).trim() === "" ? 0 : argsRaw.split(",").length;
    const byCount = candidates.filter(
      (c) => (c.slice(key.length + 1, -1).trim() === "" ? 0 : c.split(",").length) === argc,
    );
    if (byCount.length >= 1) return byCount[0] as string;
  }
  return candidates[0] ?? null;
}

export function buildRlsModel(files: Array<{ name: string; sql: string }>): RlsModel {
  const model: RlsModel = {
    tables: new Map(),
    views: new Map(),
    functions: new Map(),
    files: [],
  };
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of sorted) {
    model.files.push(f.name);
    for (const stmt of splitStatements(stripComments(f.sql))) {
      applyStatement(model, stmt, f.name);
    }
  }
  return model;
}

/** Columns a role can touch with `priv`, from table-level plus column-level grants. */
export function grantedColumns(t: TableModel, role: string, priv: "select" | "insert" | "update"): Set<string> {
  if (t.grants.get(role)?.has(priv)) return new Set(t.columns);
  return new Set(t.columnGrants.get(role)?.get(priv) ?? []);
}
