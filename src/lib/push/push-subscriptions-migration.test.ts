import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261104210000_owner_push_subscriptions.sql";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", FILE), "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("owner push subscriptions migration", () => {
  it("is newer than every earlier migration and contains no DROP, row changes or pg_cron", () => {
    expect(FILE > "20261103220000").toBe(true);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE\s+(TABLE\s+)?public)\b/i);
    expect(sql).not.toMatch(/cron\./i);
  });

  it("enables RLS with org-scoped, own-row policies for every command", () => {
    expect(sql).toContain("ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY");
    for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(sql).toMatch(new RegExp(`FOR ${command} TO authenticated`));
    }
    const policies = sql.match(/CREATE POLICY/g) ?? [];
    expect(policies).toHaveLength(4);
    const scoped =
      sql.match(
        /user_id = \(SELECT auth\.uid\(\)\) AND private\.is_org_member\(organization_id\)/g,
      ) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(5);
  });

  it("has explicit grants: nothing for anon/PUBLIC, CRUD for authenticated, all for service_role", () => {
    expect(sql).toContain("REVOKE ALL ON public.push_subscriptions FROM anon;");
    expect(sql).toContain("REVOKE ALL ON public.push_subscriptions FROM PUBLIC;");
    expect(sql).toContain(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.push_subscriptions FROM authenticated;",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;",
    );
    expect(sql).toContain("GRANT ALL ON public.push_subscriptions TO service_role;");
    expect(sql).not.toMatch(/GRANT[^;]+TO (anon|PUBLIC)/i);
  });

  it("is idempotent", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.push_subscriptions");
    expect(sql.match(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_policies/g) ?? []).toHaveLength(4);
  });
});
