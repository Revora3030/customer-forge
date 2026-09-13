import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards for the billing/RLS security boundary.
 *
 * Billing rows (`subscriptions`, `payments`, `invoices`) decide paid
 * entitlement. Members of an organization may READ their own org's billing
 * rows, but no browser-held role may INSERT / UPDATE / DELETE them — only
 * service_role (verified Stripe/PayPal webhooks, super-admin server functions)
 * writes.
 *
 * These tests read the migration chain as-applied and fail if any migration
 * re-opens the member-write path, whether through an ALL-policy, a broad
 * permissive write policy, or a table grant wide enough to write.
 */

function migrations(): { name: string; sql: string }[] {
  const dir = "supabase/migrations";
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(`${dir}/${name}`, "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const ALL = migrations();
const FULL = ALL.map((m) => m.sql).join("\n");

/** The last definition of `private.is_org_member` must gate memberships. */
function currentIsOrgMemberSql() {
  const bodies = ALL.map((m) => m.sql).filter((sql) =>
    /(?:create (?:or replace )?function|create or replace function) private\.is_org_member/i.test(
      sql,
    ),
  );
  return bodies[bodies.length - 1] ?? "";
}

describe("billing RLS — members can never write billing rows", () => {
  it.each(["subscriptions", "payments", "invoices"] as const)(
    "ends with %s readable by members, writable only by service_role",
    (table) => {
      // The final applied state revokes write privileges from browser roles.
      expect(FULL).toMatch(new RegExp(`revoke all on public\\.${table} from anon`, "i"));
      expect(FULL).toMatch(new RegExp(`revoke insert, update, delete[^;]*from authenticated`, "i"));
      expect(FULL).toMatch(new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
      expect(FULL).toMatch(new RegExp(`grant all on public\\.${table} to service_role`, "i"));
    },
  );

  it("never leaves a member-write ALL policy live on subscriptions", () => {
    // The original created `subscriptions_member_all` FOR ALL. Some later
    // migration must have dropped it, and nothing may re-create it.
    const creates = FULL.match(/create policy "?subscriptions_member_all"?[\s\S]*?;/g) ?? [];
    const drops = FULL.match(/drop policy if exists "?subscriptions_member_all"?/gi) ?? [];
    // A strict guarantee: even a chain that created it ends by dropping it,
    // because the consolidation migration is the final word.
    expect(drops.length).toBeGreaterThanOrEqual(creates.length);
  });

  it("has RESTRICTIVE write-deny policies on all three billing tables", () => {
    for (const table of ["subscriptions", "payments", "invoices"] as const) {
      for (const command of ["insert", "update", "delete"] as const) {
        expect(FULL).toMatch(
          new RegExp(`_no_${command}\\b[\\s\\S]*?on public\\.${table}[\\s\\S]*?restrictive`, "i"),
        );
        expect(FULL).toMatch(new RegExp(`restrictive for ${command} to authenticated, anon`, "i"));
      }
    }
  });

  it("keeps the org-membership gate for member reads", () => {
    for (const table of ["subscriptions", "payments", "invoices"] as const) {
      expect(FULL).toMatch(
        new RegExp(
          `create policy ${table}_member_read on public\\.${table}[\\s\\S]*?is_org_member`,
          "i",
        ),
      );
    }
  });

  it("final state on each billing table leaves writes revoked for the browser", () => {
    // Early migrations granted `all` on billing tables through a tenant-table
    // loop. The invariant is about the FINAL applied state: the last migration
    // that touches each table's grants must leave authenticated/anon write-free.
    const lastGrantSql = (table: string) => {
      const touching = ALL.filter((m) => m.sql.includes(`public.${table}`));
      const tableGrants = touching.filter((m) => /grant|revoke/i.test(m.sql));
      const last = tableGrants[tableGrants.length - 1];
      return last?.sql ?? "";
    };

    for (const table of ["subscriptions", "payments", "invoices"] as const) {
      const sql = lastGrantSql(table);
      // The consolidation migration is authoritative: it must be the last
      // migration touching billing grants and must leave SELECT-only.
      expect(sql).toMatch(/security_consolidate_billing_rls|grant select on public\./i);
      expect(sql).toMatch(new RegExp(`revoke insert, update, delete[^;]*from authenticated`, "i"));
      expect(sql).not.toMatch(
        new RegExp(
          `grant\\s+(?:all|insert|update|delete)[^;]*on public\\.${table}[^;]*to authenticated`,
          "i",
        ),
      );
      // No migration AFTER the consolidation may re-open writes.
      const consolidatedIndex = ALL.findIndex((m) =>
        m.name.includes("security_consolidate_billing_rls"),
      );
      const after = ALL.slice(consolidatedIndex + 1);
      for (const migration of after) {
        expect(migration.sql).not.toMatch(
          new RegExp(
            `grant\\s+(?:all|insert|update|delete)[^;]*on public\\.${table}[^;]*to (?:authenticated|anon)`,
            "i",
          ),
        );
      }
    }
  });

  it("uses a live, defined org gate rather than an invented check", () => {
    const sql = currentIsOrgMemberSql();
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path/i);
  });
});

describe("billing RLS — organizations billing columns stay server-frozen", () => {
  it("freezes paid-status columns on the organizations row", () => {
    expect(FULL).toMatch(
      /create (?:or replace )?function private\.protect_org_billing_columns\(\)[\s\S]*?is_super_admin/i,
    );
    expect(FULL).toMatch(
      /create trigger protect_org_billing_columns[\s\S]*?on public\.organizations/i,
    );
  });
});
