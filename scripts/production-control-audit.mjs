import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "SECURITY.md",
  "docs/PRODUCTION_10_10_MASTER_PLAN.md",
  "docs/runbooks/tenant-isolation.md",
  "docs/runbooks/backup-restore.md",
  "docs/runbooks/incident-response.md",
  "docs/runbooks/release-rollback.md",
  "docs/runbooks/observability.md",
  "docs/runbooks/activation-measurement.md",
  "docs/runbooks/generated-site-qa.md",
  "src/lib/production-control-plane.ts",
  "src/lib/production-control-plane.test.ts",
];

const missing = requiredFiles.filter((file) => !existsSync(resolve(root, file)));
if (missing.length) {
  console.error("Missing production control files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const requiredScripts = ["typecheck", "lint", "test", "build", "security:audit", "production:readiness", "production:controls"];
const missingScripts = requiredScripts.filter((name) => !pkg.scripts?.[name]);
if (missingScripts.length) {
  console.error("Missing package scripts:", missingScripts.join(", "));
  process.exit(1);
}

console.log("Production control audit: PASS");
console.log("Structural checks passed; live database, browser, observability and backup evidence remain environment-owned.");
