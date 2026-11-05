/**
 * LIVE routing audit (credential-gated, read-only).
 * ================================================
 *
 * Runs the lead-delivery routing audit over the REAL stored delivery rows of
 * the last 72 hours and fails on any wrong workspace, wrong recipient, missing
 * delivery or failed alert. It only SELECTs: nothing is emailed, texted,
 * written or charged, and test leads (source "test_lead") are skipped.
 *
 * Without credentials every case is skipped and announced as NOT_VERIFIED; a
 * skip is never a pass.
 *
 *   LEAD_DELIVERY_AUDIT_LIVE=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     bunx vitest run src/lib/lead-delivery-audit.live.test.ts
 */
import { describe, expect, it } from "vitest";

const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const enabled = process.env["LEAD_DELIVERY_AUDIT_LIVE"] === "1" && !!url && !!key;

if (!enabled)
  console.log(
    "[live:lead-delivery-audit] NOT_VERIFIED: set LEAD_DELIVERY_AUDIT_LIVE=1, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to audit real delivery rows.",
  );

describe("lead delivery routing audit on real rows", () => {
  it.skipIf(!enabled)("every recent real lead reached its own workspace and recipient", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { loadLeadDeliveryAudit } = await import("@/lib/lead-delivery-audit.server");
    const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const report = await loadLeadDeliveryAudit(db);
    console.log(
      `[live:lead-delivery-audit] ${report.leadsChecked} leads, ${report.alertRowsChecked} alert rows, ${report.webhookRowsChecked ?? "no"} webhook rows; findings: ${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium`,
    );
    // Findings are printed without any lead PII (workspace, kind, masked address).
    expect(
      report.findings.map((f) => `${f.severity} ${f.kind} ${f.workspace} lead ${f.leadId}: ${f.detail}`),
    ).toEqual([]);
  });
});
