import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261105120000_owner_sign_in_devices.sql",
  "utf8",
);

describe("owner sign-in device tables are read-only for authenticated users", () => {
  it("has no authenticated INSERT/UPDATE/DELETE/ALL policy", () => {
    const policies = sql.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    for (const p of policies) {
      if (/TO authenticated/.test(p)) expect(p).toMatch(/FOR SELECT/);
    }
  });
  it("grants authenticated SELECT only", () => {
    const grants = (sql.match(/GRANT [^;]*TO authenticated;/g) ?? []).join("\n");
    expect(grants).toMatch(/GRANT SELECT ON TABLE public\.owner_sign_in_devices/);
    expect(grants).toMatch(/GRANT SELECT ON TABLE public\.owner_sign_in_alert_state/);
    expect(grants).not.toMatch(/INSERT|UPDATE|DELETE|ALL/);
  });
});
