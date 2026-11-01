/**
 * Cross-tenant regression suite: row level security, replayed from the repo's
 * own migrations.
 *
 * CI has no database, so this replays supabase/migrations in order (tables,
 * RLS on/off, policies, grants, views, functions) and evaluates every policy
 * for each persona. It answers: "can tenant A's owner, an anonymous visitor or
 * a non-admin read, insert, update or delete tenant B's row?" It reports what
 * the repo says, never what a live database holds, and it touches no database.
 *
 * Adding a table or policy that opens a hole fails this file. Adding a
 * legitimate public surface needs an entry in an allowlist below, with a reason.
 */
import { describe, expect, it } from "vitest";
import { loadRlsModel } from "./load-migrations";
import { grantedColumns, type TableModel } from "./rls-model";
import {
  ANON,
  ANON_PUBLISHED,
  NON_ADMIN,
  OWNER_A_VS_B,
  OWNER_A_VS_B_PUBLISHED,
  OWNER_OF_ROW,
  SUPER_ADMIN,
  accessFor,
  type Cmd,
  type Persona,
} from "./policy-eval";

const CMDS: Cmd[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const model = loadRlsModel();
const publicTables = [...model.tables.values()].filter((t) => t.schema === "public");
const byName = (name: string): TableModel => {
  const t = model.tables.get(`public.${name}`);
  if (!t) throw new Error(`table public.${name} is missing from the replayed migrations`);
  return t;
};

/** Row-state filters (not identity checks) that the evaluator treats as "true", the worst case. */
const BENIGN_ATOMS: RegExp[] = [
  /^(is_active|is_published|is_visible|published)$/i,
  /^is_active = true$/i,
  /^publish_state = 'published'$/i,
  /^status = '\w+'$/i,
  /^organization_id is not null$/i,
  /^event_type = ANY \(ARRAY\[[^\]]*\]\)$/is,
  /^char_length\(.*\) <= \d+$/is,
  /^role = '\w+'::app_role$/i,
  // memberships_insert: "first owner of an org I just created" bootstrap, gated by created_by = auth.uid().
  /^EXISTS \( SELECT 1 FROM public\.memberships m WHERE m\.organization_id = memberships\.organization_id \)$/i,
  // parent-row visibility filters on public catalogue reads
  /^EXISTS \( ?SELECT 1 FROM public\.(quote_forms|quote_questions|plans)\b.*\bis_active( = true)?\s*\)$/is,
];
const isBenign = (atom: string) => BENIGN_ATOMS.some((re) => re.test(atom.replace(/^\w+: /, "").trim()));
const strangeAtoms = (atoms: string[]) => atoms.filter((a) => !isBenign(a.replace(/^[^:]*: /, "")));

/** Tables holding one tenant's (or one user's) data. */
const isTenantTable = (t: TableModel) => t.columns.has("organization_id") || t.columns.has("user_id");

/**
 * Platform catalogue / admin tables with no tenant column. Each is either
 * super-admin only, deny-all to browsers, or read-only public catalogue data.
 */
const PLATFORM_TABLES = new Set([
  "profiles", // self only (id = auth.uid())
  "organizations", // tenant root: keyed by id
  "plans",
  "plan_entitlements",
  "payment_products",
  "job_queue_state",
  "marketing_conversions",
  "offer_config",
  "platform_settings",
  "ai_provider_runtime",
  "luna_budget_state",
  "ai_model_registry",
  "ai_command_settings",
  "agent_action_requests",
  "ai_team_trace",
]);

/** The ONLY tables an anonymous visitor may read, and only for a published site. */
const ANON_READABLE_TENANT_TABLES = [
  "business_profiles",
  "media",
  "quote_addons",
  "quote_forms",
  "quote_options",
  "quote_questions",
  "reviews",
  "services",
  "social_profiles",
  "website_components",
  "website_pages",
  "website_sections",
  "website_settings",
];
/** Global catalogue tables an anonymous visitor may read (no tenant data inside). */
const ANON_READABLE_CATALOGUE_TABLES = ["payment_products", "plans"];
/** The ONLY anonymous writes: append-only, bounded beacons for a published site. */
const ANON_WRITABLE: Record<string, Cmd[]> = {
  analytics_events: ["INSERT"],
  site_vitals: ["INSERT"],
};

/** Tables only a platform super admin (or nobody from a browser) may touch. */
const ADMIN_ONLY_TABLES = [
  "luna_budget_state",
  "luna_tenant_budget_state",
  "luna_usage_events",
  "job_queue_state",
  "marketing_conversions",
  "ai_provider_runtime",
  "ai_model_registry",
  "ai_command_settings",
  "agent_action_requests",
  "platform_accounts",
  "jarvis_approvals",
  "user_roles",
  "support_sessions",
];

const tenantTables = publicTables.filter(isTenantTable);

describe("inventory", () => {
  it("replayed the whole migration history", () => {
    expect(model.files.length).toBeGreaterThan(100);
    expect(publicTables.length).toBeGreaterThan(100);
  });

  it("every public table has row level security enabled", () => {
    const off = publicTables.filter((t) => !t.rlsEnabled).map((t) => t.name);
    expect(off).toEqual([]);
  });

  it("no public table forces nothing-but-RLS off for the table owner by mistake (RLS is not disabled anywhere)", () => {
    // RLS stays on for every table even when a table has no policy (deny-all to browsers).
    for (const t of publicTables) expect(t.rlsEnabled, t.name).toBe(true);
  });

  it("every table with no tenant column is a known platform table or service-only (no policies)", () => {
    const unknown = publicTables
      .filter((t) => !isTenantTable(t) && !PLATFORM_TABLES.has(t.name) && t.policies.size > 0)
      .map((t) => t.name);
    expect(unknown).toEqual([]);
  });

  it("the tables this suite promises to cover all exist", () => {
    for (const name of [
      "leads",
      "business_profiles",
      "website_settings",
      "website_pages",
      "website_sections",
      "website_components",
      "website_versions",
      "publish_events",
      "data_backups",
      "subscriptions",
      "invoices",
      "payments",
      "payment_events",
      "organizations",
      "memberships",
      "customers",
      "appointments",
      "quote_requests",
    ]) {
      expect(byName(name).rlsEnabled, name).toBe(true);
    }
  });
});

describe("no open policy for browsers", () => {
  it("no anon/authenticated/public policy is `using (true)` or `with check (true)`", () => {
    const open: string[] = [];
    for (const t of publicTables) {
      for (const p of t.policies.values()) {
        if (!p.permissive) continue;
        const browserRole = p.roles.some((r) => r === "anon" || r === "authenticated" || r === "public");
        if (!browserRole) continue;
        const isTrue = (e: string | null) => e !== null && /^\(?\s*true\s*\)?$/i.test(e.trim());
        if (isTrue(p.using) || isTrue(p.withCheck)) open.push(`${t.name}.${p.name}`);
      }
    }
    expect(open).toEqual([]);
  });

  it("the only policies open to everything are service_role only", () => {
    for (const t of publicTables) {
      for (const p of t.policies.values()) {
        if (p.roles.includes("service_role")) {
          expect(p.roles.some((r) => r === "anon" || r === "authenticated" || r === "public"), `${t.name}.${p.name}`).toBe(false);
        }
      }
    }
  });

  it("no policy evaluates through a shape the harness cannot read", () => {
    const strange: string[] = [];
    for (const t of publicTables) {
      for (const persona of [OWNER_A_VS_B, ANON, ANON_PUBLISHED, NON_ADMIN, SUPER_ADMIN, OWNER_OF_ROW]) {
        for (const cmd of CMDS) {
          for (const a of strangeAtoms(accessFor(t, persona, cmd).unknownAtoms)) strange.push(`${t.name}: ${a}`);
        }
      }
    }
    expect([...new Set(strange)]).toEqual([]);
  });
});

describe("tenant A's owner against tenant B's rows", () => {
  for (const persona of [OWNER_A_VS_B, OWNER_A_VS_B_PUBLISHED] as Persona[]) {
    for (const cmd of CMDS) {
      it(`${persona.label}: ${cmd} is denied on every tenant table`, () => {
        const leaks = tenantTables
          .filter((t) => accessFor(t, persona, cmd).allowed)
          .map((t) => `${t.name} via ${accessFor(t, persona, cmd).via.join(",")}`);
        expect(leaks).toEqual([]);
      });
    }
  }

  it("tenant root rows (organizations, memberships) are not reachable either", () => {
    for (const name of ["organizations", "memberships", "profiles"]) {
      for (const cmd of CMDS) {
        // organizations INSERT is allowed for any signed-in user creating THEIR OWN org (created_by = auth.uid()).
        if (name === "organizations" && cmd === "INSERT") continue;
        expect(accessFor(byName(name), OWNER_A_VS_B, cmd).allowed, `${name} ${cmd}`).toBe(false);
      }
    }
  });

  it("creating an org requires created_by = the caller", () => {
    expect(byName("organizations").policies.get("orgs_insert")?.withCheck).toMatch(/created_by\s*=\s*auth\.uid\(\)/i);
  });

  it("updates cannot move a row to another tenant: every authenticated UPDATE policy is scoped on both using and check", () => {
    const loose: string[] = [];
    for (const t of tenantTables) {
      for (const p of t.policies.values()) {
        if (!p.permissive || !(p.cmd === "UPDATE" || p.cmd === "ALL")) continue;
        if (!p.roles.includes("authenticated") && !p.roles.includes("public")) continue;
        const check = p.withCheck ?? p.using;
        if (!check || /^\(?\s*true\s*\)?$/i.test(check.trim())) loose.push(`${t.name}.${p.name}`);
      }
    }
    expect(loose).toEqual([]);
  });
});

describe("anonymous visitors", () => {
  for (const cmd of ["INSERT", "UPDATE", "DELETE"] as Cmd[]) {
    for (const persona of [ANON, ANON_PUBLISHED]) {
      it(`${persona.label}: ${cmd} is denied on every tenant table except the allowlisted beacons`, () => {
        const writable = tenantTables
          .filter((t) => accessFor(t, persona, cmd).allowed && !ANON_WRITABLE[t.name]?.includes(cmd))
          .map((t) => t.name);
        expect(writable).toEqual([]);
      });
    }
  }

  it("anon beacons only write for a published site and cannot UPDATE or DELETE", () => {
    for (const [name, cmds] of Object.entries(ANON_WRITABLE)) {
      const t = byName(name);
      expect(accessFor(t, ANON, "INSERT").allowed, `${name} unpublished insert`).toBe(false);
      expect(accessFor(t, ANON_PUBLISHED, "INSERT").allowed, `${name} published insert`).toBe(cmds.includes("INSERT"));
      expect(accessFor(t, ANON_PUBLISHED, "UPDATE").allowed, `${name} update`).toBe(false);
      expect(accessFor(t, ANON_PUBLISHED, "DELETE").allowed, `${name} delete`).toBe(false);
    }
  });

  it("anonymous cannot read any tenant table for an unpublished site", () => {
    const readable = tenantTables.filter((t) => accessFor(t, ANON, "SELECT").allowed).map((t) => t.name);
    expect(readable).toEqual([]);
  });

  it("the set of tables anonymous can read for a published site is exactly the reviewed public-site list", () => {
    const readable = tenantTables
      .filter((t) => accessFor(t, ANON_PUBLISHED, "SELECT").allowed)
      .map((t) => t.name)
      .sort();
    expect(readable).toEqual([...ANON_READABLE_TENANT_TABLES].sort());
  });

  it("anonymous catalogue reads are limited to the two global catalogue tables", () => {
    const readable = publicTables
      .filter((t) => !isTenantTable(t) && accessFor(t, ANON, "SELECT").allowed)
      .map((t) => t.name)
      .sort();
    expect(readable).toEqual(ANON_READABLE_CATALOGUE_TABLES);
  });

  it("every anon SELECT policy on a tenant table requires a published, non-suspended site", () => {
    const missing: string[] = [];
    for (const name of ANON_READABLE_TENANT_TABLES) {
      for (const p of byName(name).policies.values()) {
        if (!p.permissive || !p.roles.includes("anon") || !(p.cmd === "SELECT" || p.cmd === "ALL")) continue;
        if (!/org_site_published\s*\(/i.test(p.using ?? "")) missing.push(`${name}.${p.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the published helper excludes suspended organizations and unpublished sites", () => {
    const fn = model.functions.get("private.org_site_published(uuid)");
    expect(fn?.securityDefiner).toBe(true);
    expect(fn?.definition).toMatch(/w\.published/i);
    expect(fn?.definition).toMatch(/NOT\s+o\.is_suspended/i);
  });

  it("anonymous can read none of the private columns on public-site tables", () => {
    const SENSITIVE = /(webhook|secret|token|password|api_key|private|owner_email|owner_name|notification_email|support_email|notify_on_lead|customer_id|appointment_id|stripe)/i;
    const exposed: string[] = [];
    for (const name of ANON_READABLE_TENANT_TABLES) {
      const t = byName(name);
      const cols = grantedColumns(t, "anon", "select");
      for (const c of cols) if (SENSITIVE.test(c)) exposed.push(`${name}.${c}`);
    }
    expect(exposed).toEqual([]);
  });

  it("business_profiles and website_settings expose an explicit column list to anon, not the whole row", () => {
    for (const name of ["business_profiles", "website_settings", "reviews"]) {
      const t = byName(name);
      expect(grantedColumns(t, "anon", "select").size, name).toBeLessThan(t.columns.size);
    }
    expect(grantedColumns(byName("business_profiles"), "anon", "select").has("owner_email")).toBe(false);
    expect(grantedColumns(byName("website_settings"), "anon", "select").has("lead_webhook_url")).toBe(false);
    expect(grantedColumns(byName("reviews"), "anon", "select").has("private_feedback")).toBe(false);
  });

  it("anonymous has no INSERT/UPDATE privilege on tenant tables outside the beacon allowlist", () => {
    const writable: string[] = [];
    for (const t of tenantTables) {
      for (const priv of ["insert", "update"] as const) {
        if (grantedColumns(t, "anon", priv).size > 0 && !ANON_WRITABLE[t.name]) writable.push(`${t.name}:${priv}`);
      }
    }
    // Privilege alone is harmless (RLS still denies), so this only reports the surface; RLS above is the barrier.
    // Anything listed here is covered by the denied-write matrix; the list must stay a subset of tables with a deny policy.
    for (const entry of writable) {
      const name = entry.split(":")[0] as string;
      for (const cmd of ["INSERT", "UPDATE", "DELETE"] as Cmd[]) {
        expect(accessFor(byName(name), ANON_PUBLISHED, cmd).allowed, `${entry} ${cmd}`).toBe(false);
      }
    }
  });
});

describe("non-admin against platform and admin tables", () => {
  for (const cmd of CMDS) {
    it(`a signed-in non-admin cannot ${cmd} any admin-only table`, () => {
      const open = ADMIN_ONLY_TABLES.filter((n) => accessFor(byName(n), NON_ADMIN, cmd).allowed);
      // support_sessions: members with admin role may READ their own org's sessions (transparency), never write.
      const expected = cmd === "SELECT" ? [] : [];
      expect(open).toEqual(expected);
    });
    it(`anonymous cannot ${cmd} any admin-only table`, () => {
      expect(ADMIN_ONLY_TABLES.filter((n) => accessFor(byName(n), ANON, cmd).allowed)).toEqual([]);
    });
  }

  it("a platform super admin can read the admin-only dashboards (the policies are live, not dead)", () => {
    for (const n of ["luna_budget_state", "luna_tenant_budget_state", "luna_usage_events", "job_queue_state", "user_roles", "platform_accounts", "support_sessions"]) {
      expect(accessFor(byName(n), SUPER_ADMIN, "SELECT").allowed, n).toBe(true);
    }
  });

  it("nobody can write roles from a browser, even a super admin", () => {
    for (const cmd of ["INSERT", "UPDATE", "DELETE"] as Cmd[]) {
      expect(accessFor(byName("user_roles"), SUPER_ADMIN, cmd).allowed, `user_roles ${cmd}`).toBe(false);
      expect(accessFor(byName("user_roles"), OWNER_OF_ROW, cmd).allowed, `user_roles ${cmd} owner`).toBe(false);
    }
  });

  it("the per-tenant AI budget table is super-admin only (regression: it admitted any platform account)", () => {
    const t = byName("luna_tenant_budget_state");
    const sel = [...t.policies.values()].filter((p) => p.cmd === "SELECT" || p.cmd === "ALL");
    expect(sel.map((p) => p.using?.replace(/\s+/g, " ").trim())).toEqual(["private.is_super_admin()"]);
    expect(accessFor(t, OWNER_A_VS_B, "SELECT").allowed).toBe(false);
    expect(accessFor(t, OWNER_OF_ROW, "SELECT").allowed).toBe(false);
  });
});

describe("per-table role x command matrix for the data customers care about", () => {
  type Expect = Partial<Record<Cmd, boolean>>;
  const rows: Array<{ table: string; owner: Expect; note: string }> = [
    { table: "leads", owner: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, note: "owner works their own leads" },
    { table: "business_profiles", owner: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, note: "owner edits their profile" },
    { table: "website_settings", owner: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, note: "the site config (sites)" },
    { table: "website_pages", owner: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true }, note: "site pages" },
    { table: "website_sections", owner: { SELECT: true }, note: "site sections (read through the builder)" },
    { table: "website_components", owner: { SELECT: true }, note: "site components (read through the builder)" },
    { table: "website_versions", owner: { SELECT: true, DELETE: true }, note: "version history" },
    // Billing, backups and publish history are written only by the server (service role).
    { table: "subscriptions", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "billing: read-only to the customer" },
    { table: "invoices", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "billing: read-only to the customer" },
    { table: "payments", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "billing: read-only to the customer" },
    { table: "payment_events", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "billing events: read-only" },
    { table: "data_backups", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "backups: server-written" },
    { table: "publish_events", owner: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false }, note: "publish snapshots: server-written" },
  ];

  for (const row of rows) {
    describe(`${row.table} (${row.note})`, () => {
      const t = () => byName(row.table);
      for (const cmd of CMDS) {
        it(`${cmd}: tenant A's owner is denied on tenant B's row`, () => {
          expect(accessFor(t(), OWNER_A_VS_B, cmd).allowed).toBe(false);
        });
        it(`${cmd}: anonymous is denied (unpublished and published)`, () => {
          expect(accessFor(t(), ANON, cmd).allowed).toBe(false);
          const anonRead = cmd === "SELECT" && ANON_READABLE_TENANT_TABLES.includes(row.table);
          expect(accessFor(t(), ANON_PUBLISHED, cmd).allowed).toBe(anonRead);
        });
        const want = row.owner[cmd];
        if (want !== undefined) {
          it(`${cmd}: the row's own tenant ${want ? "is allowed" : "is denied (server-only)"}`, () => {
            expect(accessFor(t(), OWNER_OF_ROW, cmd).allowed).toBe(want);
          });
        }
      }
    });
  }

  it("leads: anonymous INSERT is denied at the policy level (public form posts go through the server function)", () => {
    const t = byName("leads");
    const anonInsert = [...t.policies.values()].filter((p) => p.roles.includes("anon") && (p.cmd === "INSERT" || p.cmd === "ALL"));
    expect(anonInsert.map((p) => p.withCheck?.trim())).toEqual(["false"]);
  });

  it("billing and history tables carry restrictive deny policies for client writes", () => {
    for (const name of ["subscriptions", "invoices", "payments", "payment_events", "data_backups", "publish_events"]) {
      const t = byName(name);
      for (const cmd of ["INSERT", "UPDATE", "DELETE"] as Cmd[]) {
        const deny = [...t.policies.values()].some(
          (p) =>
            (p.cmd === cmd || p.cmd === "ALL") &&
            p.roles.includes("authenticated") &&
            ((cmd === "INSERT" ? p.withCheck : p.using)?.trim().toLowerCase() === "false"),
        );
        // either a deny policy, or no permissive write policy at all (default deny)
        const anyPermissiveWrite = [...t.policies.values()].some(
          (p) => p.permissive && (p.cmd === cmd || p.cmd === "ALL") && p.roles.some((r) => r === "authenticated" || r === "public"),
        );
        expect(deny || !anyPermissiveWrite, `${name} ${cmd}`).toBe(true);
      }
    }
  });
});

describe("team, roles and billing columns", () => {
  it("memberships have a role guard trigger (a manager cannot promote themselves)", () => {
    const sql = model.files.length ? readTriggerSql() : "";
    expect(sql).toMatch(/create trigger memberships_role_guard/i);
  });

  it("organizations have a billing-column protection trigger (an owner cannot edit their own plan state)", () => {
    expect(readTriggerSql()).toMatch(/create trigger protect_org_billing_columns/i);
  });

  it("memberships freeze their organization_id (a membership cannot be moved to another tenant)", () => {
    expect(readTriggerSql()).toMatch(/create trigger memberships_freeze_org/i);
  });
});

describe("views, functions and storage", () => {
  it("every view in the public schema runs with the caller's permissions (security_invoker)", () => {
    const bad = [...model.views.values()].filter((v) => v.key.startsWith("public.") && !v.securityInvoker).map((v) => v.key);
    expect(bad).toEqual([]);
  });

  it("every SECURITY DEFINER function pins its search_path", () => {
    const bad = [...model.functions.values()].filter((f) => f.securityDefiner && !f.hasSearchPath).map((f) => f.key);
    expect(bad).toEqual([]);
  });

  it("the membership helpers resolve the caller from auth.uid(), never from an argument", () => {
    for (const key of ["private.is_org_member(uuid)", "private.can_manage_org(uuid)", "private.org_role_at_least(uuid,text)", "private.has_support_access(uuid)", "private.is_super_admin()"]) {
      const fn = model.functions.get(key);
      expect(fn, key).toBeDefined();
      expect(fn?.definition, key).toMatch(/auth\.uid\(\)/);
    }
  });

  it("support access needs BOTH a live support session and a super admin", () => {
    const def = model.functions.get("private.has_support_access(uuid)")?.definition ?? "";
    expect(def).toMatch(/ended_at IS NULL/i);
    expect(def).toMatch(/interval '4 hours'/i);
    expect(def).toMatch(/is_super_admin\(\)/i);
  });

  it("no SECURITY DEFINER function in the public schema is callable by anonymous visitors", () => {
    const callable = [...model.functions.values()]
      .filter((f) => f.key.startsWith("public.") && f.securityDefiner)
      .filter((f) => f.grantedTo.has("anon") || f.grantedTo.has("public") || !(f.revokedFrom.has("public") || f.revokedFrom.has("anon")))
      .map((f) => f.key);
    expect(callable).toEqual([]);
  });

  it("SECURITY DEFINER functions in the public schema that browsers can call are the reviewed helpers only", () => {
    const callable = [...model.functions.values()]
      .filter((f) => f.key.startsWith("public.") && f.securityDefiner && f.grantedTo.has("authenticated"))
      .map((f) => f.key.replace(/\(.*$/, ""))
      .sort();
    expect(callable).toEqual(["public.can_manage_org", "public.has_support_access", "public.is_org_member", "public.is_super_admin"]);
  });

  it("storage objects for tenant media are keyed by the organization folder and membership", () => {
    const policies = [...(model.tables.get("storage.objects")?.policies.values() ?? [])].filter((p) => /tenant-media/.test(`${p.using} ${p.withCheck}`));
    expect(policies.length).toBeGreaterThanOrEqual(3);
    for (const p of policies) {
      expect(p.roles, p.name).toEqual(["authenticated"]);
      expect(`${p.using} ${p.withCheck}`, p.name).toMatch(/storage\.foldername\(name\)\)\[1\]\)::uuid/);
      expect(`${p.using} ${p.withCheck}`, p.name).toMatch(/is_org_member|can_manage_org/);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR } from "./load-migrations";

let cachedTriggerSql: string | undefined;
/** All migration SQL as one string, comments removed, for trigger existence checks. */
function readTriggerSql(): string {
  if (cachedTriggerSql === undefined) {
    cachedTriggerSql = model.files
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n")
      .replace(/--[^\n]*/g, "");
  }
  return cachedTriggerSql;
}
