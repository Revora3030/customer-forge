import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contract for supabase/migrations/20261103020000_agent_approvals.sql. The live
// database was reported to differ from this file for agent_approval_consume, and
// the live definition cannot be read from the repo, so these tests pin what the
// repo version is meant to do. The behaviour itself was also run against a scratch
// in-memory Postgres (see docs/agent-approvals-live-diff.md); nothing touched live.
const sql = readFileSync(
  new URL("../../../supabase/migrations/20261103020000_agent_approvals.sql", import.meta.url),
  "utf8",
);

function fn(name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf("END $$;", start);
  return sql.slice(start, end);
}

describe("agent_approval_consume (repo version)", () => {
  const consume = fn("agent_approval_consume");

  it("has exactly the signature the app calls", () => {
    expect(consume).toContain(
      "_org uuid, _scope text, _tool text, _hash text, _id uuid DEFAULT NULL",
    );
    expect(sql).toContain("agent_approval_consume(uuid, text, text, text, uuid)");
  });

  it("only consumes an approved, unexpired row matched on org + scope + tool + argument hash", () => {
    expect(consume).toMatch(/status = 'approved' AND expires_at > now\(\)/);
    expect(consume).toContain("organization_id IS NOT DISTINCT FROM _org");
    expect(consume).toContain("scope = _scope");
    expect(consume).toContain("tool = _tool");
    expect(consume).toContain("args_hash = _hash");
    expect(consume).toContain("(_id IS NULL OR id = _id)");
  });

  it("is single-use and race-safe: row lock, then approved -> consumed", () => {
    expect(consume).toContain("FOR UPDATE SKIP LOCKED");
    expect(consume).toMatch(/SET status = 'consumed', consumed_at = now\(\) WHERE id = target/);
  });

  it("explains a refusal without reading other workspaces' rows", () => {
    for (const outcome of ["not_found", "changed", "used", "rejected", "not_approved", "expired"]) {
      expect(consume).toContain(`'${outcome}'`);
    }
    const reasons = consume.slice(consume.indexOf("Say why not"));
    expect(reasons.match(/organization_id IS NOT DISTINCT FROM _org/g)?.length).toBe(2);
  });

  it("is callable by the service role only", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.agent_approval_consume\(uuid, text, text, text, uuid\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.agent_approval_consume\(uuid, text, text, text, uuid\) TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.agent_approval_consume[^;]*TO (anon|authenticated|PUBLIC)/,
    );
  });
});

describe("agent_approval_decide (repo version)", () => {
  it("checks the role inside the function: owner for owner scope, super admin for admin scope", () => {
    const decide = fn("agent_approval_decide");
    expect(decide).toContain("m.role = 'owner'");
    expect(decide).toContain("u.role = 'super_admin'");
    expect(decide).toContain("'forbidden'");
  });
});
