/**
 * Read-only billing reconciliation (DB vs Stripe). Never writes anywhere.
 *
 *   npx tsx scripts/reconcile-billing.ts --input reconcile-input.json
 *
 * reconcile-input.json = { orgs, subscriptions, payments, stripeSessions,
 * stripeSubscriptions } exported read-only (SELECTs on organizations,
 * subscriptions, payments; Stripe GET /v1/checkout/sessions and
 * /v1/subscriptions). See src/lib/billing-reconcile.ts for the checks.
 * Prints workspace names and mismatch kinds only; exits 1 if any mismatch.
 */
import { readFileSync } from "node:fs";
import { reconcileBilling, summarizeByWorkspace, type ReconcileInput } from "../src/lib/billing-reconcile";

const idx = process.argv.indexOf("--input");
const file = idx >= 0 ? process.argv[idx + 1] : undefined;
if (!file) {
  console.error("usage: tsx scripts/reconcile-billing.ts --input <file.json>");
  process.exit(2);
}
const input = JSON.parse(readFileSync(file, "utf8")) as ReconcileInput;
const result = reconcileBilling(input);
console.log(`Checked ${result.checked} workspaces, ${result.mismatches.length} mismatches`);
for (const [workspace, n] of Object.entries(summarizeByWorkspace(result))) console.log(`  ${workspace}: ${n}`);
for (const m of result.mismatches) console.log(`- [${m.kind}] ${m.workspace}: ${m.detail}`);
process.exit(result.mismatches.length ? 1 : 0);
