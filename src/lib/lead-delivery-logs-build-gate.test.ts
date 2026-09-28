import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "public-site.functions.ts"), "utf8");

describe("lead delivery telemetry build gate", () => {
  it("never looks up lead_delivery_logs through the generated schema types", () => {
    // Lovable regenerates types.ts from the live database; a direct typed
    // lookup breaks `tsc` whenever the migration has not been applied yet.
    expect(source).not.toMatch(/supabase\s*\.from\(\s*["']lead_delivery_logs["']\s*\)/);
    expect(source).toContain("leadDeliveryLogs(supabase).insert(");
  });

  it("still surfaces telemetry insert errors instead of failing silently", () => {
    expect(source).toMatch(/if \(telemetryInsertError\)/);
    expect(source).toContain("Lead delivery telemetry not saved");
  });
});
