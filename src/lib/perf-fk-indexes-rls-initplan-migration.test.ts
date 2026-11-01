import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261101170000_perf_fk_indexes_rls_initplan.sql"),
  "utf8",
);
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("20261101170000 perf migration (FK indexes + RLS initplan)", () => {
  it("adds both FK indexes idempotently and guarded by table existence", () => {
    expect(code).toMatch(/CREATE INDEX IF NOT EXISTS image_records_media_id_fk_idx\s+ON public\.image_records \(media_id\)/);
    expect(code).toMatch(
      /CREATE INDEX IF NOT EXISTS lead_tasks_lead_id_organization_id_fk_idx\s+ON public\.lead_tasks \(lead_id, organization_id\)/,
    );
    expect(code).toMatch(/to_regclass\('public\.image_records'\) IS NOT NULL/);
    expect(code).toMatch(/to_regclass\('public\.lead_tasks'\) IS NOT NULL/);
  });

  it("only rewrites USING / WITH CHECK of public policies (no drops, no role or command changes)", () => {
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/\bTO\s+(authenticated|anon|public)\b/i);
    expect(code).not.toMatch(/\b(DELETE FROM|UPDATE\s+public\.|INSERT INTO|TRUNCATE)\b/i);
    expect(code).toMatch(/WHERE schemaname = 'public'/);
    expect(code).toMatch(/ALTER POLICY %I ON %I\.%I USING \(%s\)/);
    expect(code).toMatch(/ALTER POLICY %I ON %I\.%I WITH CHECK \(%s\)/);
  });

  it("protects already-wrapped calls so a re-run alters nothing, and self-checks the result", () => {
    expect(code).toContain("@@KEEP_");
    expect(code).toMatch(/IF p\.qual IS NOT NULL AND q ~ pat THEN/);
    expect(code).toMatch(/RAISE EXCEPTION 'rls initplan rewrite left/);
  });
});
