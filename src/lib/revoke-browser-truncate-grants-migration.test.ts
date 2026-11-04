import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261104231000_revoke_browser_truncate_references_trigger.sql"),
  "utf8",
);
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("20261104231000 revoke browser TRUNCATE/REFERENCES/TRIGGER", () => {
  it("revokes only TRUNCATE, REFERENCES and TRIGGER from anon and authenticated", () => {
    expect(code).toContain("REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated");
    const revokes = code.match(/REVOKE[^;']*/gi) ?? [];
    for (const r of revokes) {
      expect(r).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
    }
  });

  it("keeps service_role explicitly granted and tightens default privileges", () => {
    expect(code).toContain("GRANT ALL ON public.%I TO service_role");
    expect(code).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated/);
  });

  it("touches no policies, rows or objects", () => {
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/\b(CREATE|ALTER) POLICY\b/i);
    expect(code).not.toMatch(/\b(DELETE FROM|UPDATE\s+public\.|INSERT INTO)\b/i);
    expect(code).not.toMatch(/\bTO\s+(anon|authenticated|public)\b/i);
  });
});
