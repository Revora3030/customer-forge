/**
 * Evaluates RLS policy predicates (as written in the migrations) for a named
 * persona against a row, so tests can state "tenant A's owner cannot read,
 * insert, update or delete tenant B's row" instead of only grepping for words.
 *
 * It understands the vocabulary these migrations actually use: membership and
 * role helpers, super admin, support sessions, `auth.uid()`, the published-site
 * helper, `true`/`false`, and AND/OR/NOT with parentheses. Anything it does not
 * recognise is treated as TRUE (the worst case for a leak) and reported in
 * `unknownAtoms`, so a new policy shape can never silently pass.
 *
 * Static analysis of the repo's SQL. It does not talk to any database.
 */
import type { PolicyModel, TableModel } from "./rls-model";

export type Cmd = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface Persona {
  label: string;
  /** Postgres role the request runs as. */
  role: "anon" | "authenticated";
  /** Holds a membership of any role in the row's organization. */
  member: boolean;
  /** Holds a manager/admin/owner membership in the row's organization. */
  manager: boolean;
  /** Holds an admin/owner membership in the row's organization. */
  admin: boolean;
  /** Platform super admin (user_roles.super_admin). */
  superAdmin: boolean;
  /** The row's own `user_id` is this persona's auth.uid(). */
  ownsRowUser: boolean;
  /** The row's organization has a published, non-suspended site. */
  sitePublished: boolean;
}

const none = { member: false, manager: false, admin: false, superAdmin: false, ownsRowUser: false };

/** Tenant A's owner acting on tenant B's rows (B has NOT published). */
export const OWNER_A_VS_B: Persona = { label: "owner of A vs B's row", role: "authenticated", ...none, sitePublished: false };
/** Same, but tenant B's public site is live. */
export const OWNER_A_VS_B_PUBLISHED: Persona = { ...OWNER_A_VS_B, label: "owner of A vs B's published row", sitePublished: true };
export const ANON: Persona = { label: "anonymous", role: "anon", ...none, sitePublished: false };
export const ANON_PUBLISHED: Persona = { ...ANON, label: "anonymous, site published", sitePublished: true };
/** Tenant B's own owner on B's row. */
export const OWNER_OF_ROW: Persona = {
  label: "owner of the row's tenant",
  role: "authenticated",
  member: true,
  manager: true,
  admin: true,
  superAdmin: false,
  ownsRowUser: true,
  sitePublished: false,
};
/** A plain staff member of the row's tenant. */
export const STAFF_OF_ROW: Persona = { ...OWNER_OF_ROW, label: "staff of the row's tenant", manager: false, admin: false };
/** A viewer of the row's tenant (member, below staff). */
export const VIEWER_OF_ROW: Persona = { ...STAFF_OF_ROW, label: "viewer of the row's tenant" };
/** Signed-in user of the platform who is not a super admin (the "non-admin"). */
export const NON_ADMIN: Persona = { ...OWNER_A_VS_B, label: "signed-in non-admin" };
export const SUPER_ADMIN: Persona = { ...OWNER_A_VS_B, label: "platform super admin", superAdmin: true };

// ---------------------------------------------------------------------------

function norm(expr: string): string {
  return expr
    .replace(/\s+/g, " ")
    .replace(/\(\s*select\s+auth\.uid\(\)\s*(?:as\s+\w+)?\s*\)/gi, "auth.uid()")
    .trim();
}

function stripOuterParens(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === "'") {
        i = t.indexOf("'", i + 1);
        if (i < 0) break;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0 && i < t.length - 1) {
          wraps = false;
          break;
        }
      }
    }
    if (!wraps) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Split on a top-level keyword (outside parentheses and quotes). */
export function splitTop(expr: string, keyword: "or" | "and"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  const lower = expr.toLowerCase();
  let betweenPending = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'") {
      i = expr.indexOf("'", i + 1);
      if (i < 0) break;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /\s/.test(c ?? "")) {
      if (lower.startsWith(" between ", i) || lower.startsWith(" between\n", i)) betweenPending++;
      const kw = ` ${keyword} `;
      if (lower.startsWith(kw, i)) {
        if (keyword === "and" && betweenPending > 0) {
          betweenPending--;
          continue;
        }
        parts.push(expr.slice(last, i));
        last = i + kw.length;
        i = last - 1;
      }
    }
  }
  parts.push(expr.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

export interface EvalResult {
  value: boolean;
  unknownAtoms: string[];
}

const ORG_FN = /\b(?:private|public)?\.?(is_org_member|can_manage_org|org_role_at_least|has_support_access)\s*\(/i;

function evalAtom(atomRaw: string, p: Persona, unknown: string[]): boolean {
  const atom = stripOuterParens(atomRaw);
  const lower = atom.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (lower === "null") return false;

  if (/^not\s+/i.test(atom)) {
    const inner = atom.replace(/^not\s+/i, "");
    // NOT <known atom> is evaluated; NOT EXISTS (...) of an unknown shape is unknown.
    const innerUnknown: string[] = [];
    const v = evalExpr(inner, p, innerUnknown);
    if (innerUnknown.length) {
      unknown.push(...innerUnknown);
      return true;
    }
    return !v;
  }

  if (/\bauth\.uid\(\)\s+is\s+not\s+null\b/i.test(lower)) return p.role === "authenticated";
  if (/\bauth\.role\(\)\s*=\s*'service_role'/i.test(lower)) return false;
  if (/\bauth\.role\(\)\s*=\s*'authenticated'/i.test(lower)) return p.role === "authenticated";
  if (/\bauth\.role\(\)\s*=\s*'anon'/i.test(lower)) return p.role === "anon";

  if (/\borg_site_published\s*\(/i.test(lower)) return p.sitePublished;
  if (/\bis_super_admin\s*\(\s*\)/i.test(lower)) return p.superAdmin;

  const orgFn = ORG_FN.exec(atom);
  if (orgFn) {
    const fn = (orgFn[1] ?? "").toLowerCase();
    if (fn === "has_support_access") return p.superAdmin; // needs super admin AND a live support session
    if (fn === "can_manage_org") return p.manager || p.superAdmin;
    if (fn === "org_role_at_least") {
      const min = /,\s*'(\w+)'/.exec(atom)?.[1] ?? "viewer";
      if (min === "owner" || min === "admin") return p.admin || p.superAdmin;
      if (min === "manager") return p.manager || p.superAdmin;
      return p.member || p.superAdmin;
    }
    return p.member || p.superAdmin;
  }

  // exists (select 1 from public.memberships m where m.organization_id = <row org> and m.user_id = auth.uid() [and m.role in (...)])
  if (/\bexists\s*\(/i.test(lower) && /\bmemberships\b/.test(lower) && /auth\.uid\(\)/.test(lower)) {
    if (/\bm?\.?role\b[^)]*\b(owner|admin|manager)\b/i.test(lower) && !/staff/.test(lower)) return p.manager || p.superAdmin;
    return p.member;
  }

  // exists (select 1 from user_roles r where r.user_id = auth.uid() and r.role::text = 'super_admin')
  if (/\bexists\s*\(/i.test(lower) && /\buser_roles\b/.test(lower) && /auth\.uid\(\)/.test(lower) && /'super_admin'/.test(lower)) return p.superAdmin;

  // <col>user_id = auth.uid()   /   auth.uid() = user_id   /   <col> = auth.uid()
  if (/^(?:\w+\.)?\w*user_id\s*=\s*auth\.uid\(\)$/i.test(atom) || /^auth\.uid\(\)\s*=\s*(?:\w+\.)?\w*user_id$/i.test(atom)) return p.ownsRowUser;
  if (/^(?:\w+\.)?(created_by|owner_id|admin_id|id)\s*=\s*auth\.uid\(\)$/i.test(atom)) return p.ownsRowUser;

  unknown.push(atom);
  return true;
}

function evalExpr(exprRaw: string, p: Persona, unknown: string[]): boolean {
  const expr = stripOuterParens(norm(exprRaw));
  const ors = splitTop(expr, "or");
  if (ors.length > 1) return ors.map((o) => evalExpr(o, p, unknown)).some(Boolean);
  const ands = splitTop(expr, "and");
  if (ands.length > 1) return ands.map((a) => evalExpr(a, p, unknown)).every(Boolean);
  return evalAtom(expr, p, unknown);
}

export function evalPredicate(expr: string | null, p: Persona): EvalResult {
  if (expr === null) return { value: true, unknownAtoms: [] };
  const unknownAtoms: string[] = [];
  const value = evalExpr(expr, p, unknownAtoms);
  return { value, unknownAtoms };
}

function appliesTo(policy: PolicyModel, role: string): boolean {
  return policy.roles.includes(role) || policy.roles.includes("public");
}

function appliesToCmd(policy: PolicyModel, cmd: Cmd): boolean {
  return policy.cmd === "ALL" || policy.cmd === cmd;
}

export interface Access {
  allowed: boolean;
  /** Names of the permissive policies that let the persona through. */
  via: string[];
  unknownAtoms: string[];
  /** True when no policy applies at all (Postgres then denies by default). */
  noPolicy: boolean;
}

/**
 * Whether `persona` may perform `cmd` on a row of `table`, per the replayed
 * policies. RLS must be enabled for any of this to apply; table privileges are
 * checked separately by the callers that care about column-level grants.
 */
export function accessFor(table: TableModel, persona: Persona, cmd: Cmd): Access {
  const unknownAtoms: string[] = [];
  const policies = [...table.policies.values()].filter((p) => appliesTo(p, persona.role) && appliesToCmd(p, cmd));
  if (!table.rlsEnabled) return { allowed: true, via: ["<RLS DISABLED>"], unknownAtoms, noPolicy: false };

  const rowPredicate = (p: PolicyModel) => {
    const using = cmd === "INSERT" ? null : p.using;
    const check = cmd === "SELECT" || cmd === "DELETE" ? null : (p.withCheck ?? (p.cmd === "ALL" ? p.using : null));
    const parts: Array<string | null> = [];
    if (cmd === "INSERT") parts.push(p.withCheck ?? (p.cmd === "ALL" ? p.using : "__missing_check__"));
    else {
      parts.push(using);
      if (check !== null) parts.push(check);
    }
    return parts;
  };

  const evalPolicy = (p: PolicyModel): boolean => {
    const parts = rowPredicate(p);
    return parts.every((part) => {
      if (part === "__missing_check__") {
        unknownAtoms.push(`${p.name}: INSERT policy without WITH CHECK`);
        return true;
      }
      const r = evalPredicate(part, persona);
      unknownAtoms.push(...r.unknownAtoms.map((a) => `${p.name}: ${a}`));
      return r.value;
    });
  };

  const permissive = policies.filter((p) => p.permissive);
  const restrictive = policies.filter((p) => !p.permissive);
  if (permissive.length === 0) return { allowed: false, via: [], unknownAtoms, noPolicy: true };
  const via = permissive.filter(evalPolicy).map((p) => p.name);
  const restrictionsOk = restrictive.every(evalPolicy);
  return { allowed: via.length > 0 && restrictionsOk, via: restrictionsOk ? via : [], unknownAtoms, noPolicy: false };
}
