import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261005000000_harden_website_rpc_execute.sql",
  "utf8",
);

const functions = [
  "apply_ai_website_changes(uuid, jsonb, uuid, text)",
  "apply_website_theme(uuid, text, text, text, text, text)",
  "create_website_snapshot(uuid)",
  "generate_industry_website(uuid, text, text, text, text)",
  "publish_website_draft(uuid, uuid)",
];

// The source-controlled migration is the deploy-time security contract.
// Each privileged RPC must be denied to public/anonymous/authenticated callers
// and explicitly available only to the service-role trust boundary.
const failures = [];
for (const signature of functions) {
  const normalized = signature.replace(/\s+/g, " ");
  if (!migration.includes(`REVOKE ALL ON FUNCTION public.${normalized}`)) {
    failures.push(`Missing revoke for ${signature}`);
  }
  if (!migration.includes(`TO service_role`)) {
    failures.push("Migration must explicitly grant service_role execution.");
    break;
  }
}
if (!migration.includes("FROM PUBLIC, anon, authenticated")) {
  failures.push("All website mutation RPCs must revoke PUBLIC, anon and authenticated.");
}
if (migration.includes("GRANT EXECUTE") && migration.includes("TO authenticated")) {
  failures.push("Website mutation RPCs must never grant direct authenticated execution.");
}
if (failures.length) {
  console.error("Website RPC security contract FAILED");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Website RPC security contract PASSED.");
