import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILE = "20261103210000_harden_grants_routines_qa_rules.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", FILE), "utf8");
const sql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const TABLES = ["agent_routines", "qa_jobs", "website_rules"] as const;

describe("harden grants migration (agent_routines, qa_jobs, website_rules)", () => {
  it("is timestamped after 20261103200000", () => {
    expect(FILE > "20261103200000").toBe(true);
  });

  it("contains no DROP, TRUNCATE statement, or row changes", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/^\s*TRUNCATE\b/im);
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
  });

  it("guards every table with to_regclass", () => {
    for (const t of TABLES) {
      expect(sql).toContain(`IF to_regclass('public.${t}') IS NOT NULL THEN`);
    }
    const guards = sql.match(/to_regclass\('public\.(\w+)'\)/g) ?? [];
    expect(guards).toHaveLength(TABLES.length);
  });

  it("revokes anon/PUBLIC and authenticated TRUNCATE on every table", () => {
    for (const t of TABLES) {
      expect(sql).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon`);
      expect(sql).toMatch(
        new RegExp(
          `REVOKE [A-Z, ]*TRUNCATE, REFERENCES, TRIGGER ON public\\.${t} FROM authenticated`,
        ),
      );
      expect(sql).toContain(`GRANT ALL ON public.${t} TO service_role`);
    }
  });

  it("keeps server-written tables read-only for authenticated", () => {
    for (const t of ["agent_routines", "qa_jobs"]) {
      expect(sql).toContain(
        `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.${t} FROM authenticated`,
      );
      expect(sql).toContain(`GRANT SELECT ON public.${t} TO authenticated`);
    }
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_rules TO authenticated",
    );
  });

  it("never grants anything to anon or PUBLIC", () => {
    expect(sql).not.toMatch(/GRANT[^;']*TO[^;']*\b(anon|PUBLIC)\b/i);
  });
});
