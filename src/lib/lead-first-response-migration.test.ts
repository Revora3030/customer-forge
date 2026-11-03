import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = resolve(process.cwd(), "supabase/migrations");
const FILE = "20261103100000_lead_first_response.sql";
const sql = readFileSync(resolve(DIR, FILE), "utf8");
const code = sql.replace(/--.*$/gm, "");

describe("lead first-response migration", () => {
  it("is the newest migration and changes nothing destructively", () => {
    const others = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f !== FILE).sort();
    expect(FILE.split("_")[0]! > others.at(-1)!.split("_")[0]!).toBe(true);
    expect(code).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|ALTER\s+COLUMN/i);
  });

  it("adds the two lead columns idempotently", () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS first_response_at timestamptz/);
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS response_escalated_at timestamptz/);
  });

  it("stamps the first response in the database from contact signals and freezes it", () => {
    expect(code).toMatch(/CREATE OR REPLACE TRIGGER leads_guard_first_response\s+BEFORE INSERT OR UPDATE ON public\.leads/);
    expect(code).toMatch(/CREATE OR REPLACE TRIGGER lead_activities_stamp_first_response\s+AFTER INSERT ON public\.lead_activities/);
    expect(code).toMatch(/NEW\.first_response_at := OLD\.first_response_at/);
    expect(code).toMatch(/kind IN \('call', 'email', 'text'\)/);
    // Only the service role (the escalation job) may set response_escalated_at.
    expect(code).toMatch(/NEW\.response_escalated_at := OLD\.response_escalated_at/);
  });

  it("keeps trigger functions private with a pinned search_path", () => {
    const fns = code.match(/CREATE OR REPLACE FUNCTION [\w.]+/g) ?? [];
    expect(fns.length).toBe(2);
    for (const fn of fns) expect(fn).toMatch(/FUNCTION private\./);
    expect(code.match(/SET search_path TO 'public', 'private'/g)).toHaveLength(2);
    expect(code.match(/REVOKE ALL ON FUNCTION private\.\w+\(\) FROM PUBLIC/g)).toHaveLength(2);
  });

  it("has explicit grants and leaves row access to the org-scoped leads policies", () => {
    expect(code).toMatch(/GRANT SELECT \(first_response_at, response_escalated_at\) ON public\.leads TO authenticated/);
    expect(code).toMatch(/TO service_role/);
    expect(code).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY/i);
    // Writes from the activity trigger are scoped to the activity's own workspace.
    expect(code).toMatch(/AND organization_id = NEW\.organization_id/);
  });
});
