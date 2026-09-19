import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260919010000_final_production_hardening.sql"),
  "utf8",
);

describe("final production hardening migration", () => {
  it("revokes the public workspace provisioning RPC", () => {
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.provision_workspace(text, text, jsonb, integer)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated;");
  });

  it("grants the replacement provisioning function only to service_role", () => {
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)",
    );
    expect(migration).toContain("TO service_role;");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer)",
    );
  });

  it("preserves the seven affected policy names and init-plan-safe auth", () => {
    const names = [
      "members can read outcome snapshots",
      "members can create outcome snapshots",
      "members can read outcome evidence",
      "members can create outcome evidence",
      "members can read improvement recommendations",
      "members can create improvement recommendations",
      "members can update improvement recommendations",
    ];
    for (const name of names) expect(migration).toContain(`CREATE POLICY "${name}"`);
    expect((migration.match(/\(SELECT auth\.uid\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("adds exactly the three requested FK indexes", () => {
    for (const name of [
      "improvement_recommendations_created_by_idx",
      "outcome_evidence_created_by_idx",
      "outcome_snapshots_created_by_idx",
    ]) {
      expect(migration).toContain(name);
    }
  });

  it("does not mass-delete the unused-index inventory", () => {
    expect(migration).not.toMatch(/DROP INDEX/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});
