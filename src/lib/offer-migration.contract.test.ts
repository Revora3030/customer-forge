import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015170000_restore_canonical_offer_750_one_day.sql", import.meta.url),
  "utf8",
);

describe("canonical Revora offer database contract", () => {
  it("locks the setup and monthly offer to $750 once and $100/month with the first month free", () => {
    expect(migration).toContain("SET setup_price = 750, monthly_price = 100, trial_days = 30, full_access_days = 1");
    expect(migration).toContain("amount = 750 AND upper(currency) = 'USD' AND kind = 'setup_fee'");
    expect(migration).toContain("monthly_price = 100 AND setup_price = 750 AND annual_price = 0");
    expect(migration).toContain("trial_days = 30 AND full_access_days = 1");
  });

  it("sets all new signup defaults and provisioning to one day", () => {
    expect(migration).toContain("ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '1 day')");
    expect(migration).toContain("NEW.trial_ends_at := now() + interval '1 day'");
    expect(migration).toContain("_trial_days integer DEFAULT 1");
    expect(migration).toContain("v_ends := now() + interval '1 day'");
  });

  it("does not retroactively shorten already-issued trial end timestamps", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.organizations/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.platform_trials/i);
    expect(migration).toContain("Existing explicitly granted trial end timestamps are not shortened");
  });

  it("keeps database publish-lock messages aligned with the same setup fee", () => {
    expect(migration).toContain("private.guard_production_activation()");
    expect(migration).toContain("Complete your one-time $750 setup to publish your website");
    expect(migration).not.toContain("Complete your one-time $350 setup");
  });

  it("keeps existing server-only workspace-provisioning grants intact", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) FROM authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.provision_workspace_server(uuid, text, text, jsonb, integer) TO service_role");
  });
});
