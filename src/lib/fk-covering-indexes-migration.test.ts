import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261104235000_fk_covering_indexes.sql"), "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const expected: Array<[string, string]> = [
  ["prospect_import_queue", "organization_id"],
  ["jarvis_approvals", "message_id"],
  ["agent_action_requests", "decided_by"],
  ["review_feedback_requests", "appointment_id"],
  ["review_feedback_requests", "lead_id"],
  ["review_feedback_requests", "review_id"],
  ["estimate_signatures", "recorded_by"],
  ["agent_runs", "user_id"],
  ["agent_approvals", "requested_by"],
  ["agent_approvals", "decided_by"],
  ["agent_settings", "updated_by"],
  ["agent_limits", "updated_by"],
  ["agent_routines", "created_by"],
  ["agent_routines", "last_run_id"],
  ["qa_jobs", "run_id"],
  ["website_rules", "updated_by"],
  ["jarvis_memories", "superseded_by"],
];

describe("20261104235000 FK covering indexes", () => {
  it("covers every unindexed foreign key from the 2026-11-04 audit", () => {
    for (const [table, column] of expected) {
      expect(code).toContain(`ARRAY['${table}',`);
      expect(code).toMatch(new RegExp(`'${table}',\\s*'${column}',\\s*'${table}_${column}_fk_idx'`));
    }
  });

  it("is idempotent and guarded by table and column existence", () => {
    expect(code).toContain("CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)");
    expect(code).toMatch(/to_regclass\('public\.' \|\| spec\[1\]\) IS NULL/);
    expect(code).toMatch(/attname = spec\[2\] AND NOT attisdropped/);
  });

  it("changes nothing but indexes (no drops, policies, grants or row writes)", () => {
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/\b(CREATE|ALTER) POLICY\b/i);
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b/i);
    expect(code).not.toMatch(/\b(DELETE FROM|UPDATE\s+public\.|INSERT INTO|TRUNCATE)\b/i);
  });
});
