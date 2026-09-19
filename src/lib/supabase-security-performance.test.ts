import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("workspace provisioning security boundary", () => {
  const migration = read("../../supabase/migrations/20260919000000_workspace_provisioning_and_outcome_rls_hardening.sql");
  const source = read("./platform-funnel.functions.ts");

  it("revokes public/anonymous/authenticated execution of the legacy RPC", () => {
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.provision_workspace");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("grants the new provisioning entry point only to service_role", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.provision_workspace_server");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.provision_workspace_server");
  });

  it("binds provisioning to the server-verified auth user and clamps the trial", () => {
    expect(source).toContain("_user_id: context.userId");
    expect(migration).toContain("GREATEST(1, LEAST(3, COALESCE(_trial_days, 3)))");
    expect(migration).toContain("_user_id");
  });

  it("rejects malformed profile/name inputs before privileged writes", () => {
    expect(migration).toContain("INVALID_NAME");
    expect(migration).toContain("INVALID_INDUSTRY");
    expect(migration).toContain("INVALID_PROFILE");
  });
});

describe("outcome RLS hardening", () => {
  const migration = read("../../supabase/migrations/20260919000000_workspace_provisioning_and_outcome_rls_hardening.sql");

  it("keeps all seven policy names and scopes", () => {
    for (const name of [
      "members can read outcome snapshots",
      "members can create outcome snapshots",
      "members can read outcome evidence",
      "members can create outcome evidence",
      "members can read improvement recommendations",
      "members can create improvement recommendations",
      "members can update improvement recommendations",
    ]) expect(migration).toContain(name);
    expect((migration.match(/SELECT auth\.uid\(\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it("preserves organization membership checks", () => {
    expect(migration).toContain("m.organization_id = outcome_snapshots.organization_id");
    expect(migration).toContain("m.organization_id = outcome_evidence.organization_id");
    expect(migration).toContain("m.organization_id = improvement_recommendations.organization_id");
  });

  it("adds exactly the three advisor-reported FK indexes", () => {
    expect(migration).toContain("improvement_recommendations_created_by_idx");
    expect(migration).toContain("outcome_evidence_created_by_idx");
    expect(migration).toContain("outcome_snapshots_created_by_idx");
  });
});


describe("client error attribution boundary", () => {
  const monitoring = read("./monitoring.functions.ts");

  it("does not accept a client-supplied organization id", () => {
    expect(monitoring).not.toContain("organizationId?: string;");
    expect(monitoring).not.toContain("input?.organizationId");
    expect(monitoring).not.toContain("organizationId: data.organizationId");
  });
});
