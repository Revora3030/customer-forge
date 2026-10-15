import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015140000_jarvis_autopilot_safety.sql", import.meta.url),
  "utf8",
);

describe("Jarvis durable safety migration contract", () => {
  it("ships with autopilot disabled and kill switch engaged", () => {
    expect(migration).toMatch(/enabled boolean NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/kill_switch_engaged boolean NOT NULL DEFAULT true/i);
    expect(migration).toMatch(/VALUES\s*\(true,\s*false,\s*true\)/i);
  });

  it("binds write execution to the approved input digest and expiring approval", () => {
    expect(migration).toContain("approved_input_hash = input_hash");
    expect(migration).toContain("approval_expires_at > started_at");
    expect(migration).toContain("verification_status = 'passed'");
  });

  it("protects audit events from UPDATE and DELETE", () => {
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON public.jarvis_autopilot_audit_events");
    expect(migration).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.jarvis_autopilot_audit_events/i);
    expect(migration).toContain("Jarvis audit events are append-only.");
  });

  it("does not grant browser roles access to settings", () => {
    expect(migration).toMatch(/REVOKE ALL ON public\.jarvis_autopilot_settings FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.jarvis_autopilot_settings TO service_role/i);
  });
});
