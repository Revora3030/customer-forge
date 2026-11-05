import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261105150000_ai_visibility_checks.sql"), "utf8").replace(/--.*$/gm, "");
const policy = (name: string) => sql.match(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?;`))?.[0] ?? "";

describe("ai_visibility_checks migration", () => {
  it("is additive only and has RLS on", () => {
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|ALTER\s+COLUMN/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("insert requires org membership and recorded_by = the caller", () => {
    const p = policy("ai_visibility_checks_member_insert");
    expect(p).toMatch(/FOR INSERT TO authenticated WITH CHECK \(private\.is_org_member\(organization_id\) AND recorded_by = \(SELECT auth\.uid\(\)\)\)/);
  });

  it("update requires membership to target and recorded_by = the caller on the new row", () => {
    const p = policy("ai_visibility_checks_member_update");
    expect(p).toMatch(/USING \(private\.is_org_member\(organization_id\)\)/);
    expect(p).toMatch(/WITH CHECK \(private\.is_org_member\(organization_id\) AND recorded_by = \(SELECT auth\.uid\(\)\)\)/);
  });

  it("select and delete stay member-scoped", () => {
    expect(policy("ai_visibility_checks_member_select")).toMatch(/USING \(private\.is_org_member\(organization_id\)\)/);
    expect(policy("ai_visibility_checks_member_delete")).toMatch(/USING \(private\.is_org_member\(organization_id\)\)/);
  });
});
