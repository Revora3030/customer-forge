import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "SECURITY.md",
  "docs/PRODUCTION_10_10_MASTER_PLAN.md",
  "docs/runbooks/tenant-isolation.md",
  "docs/runbooks/backup-restore.md",
  "docs/runbooks/incident-response.md",
  "docs/runbooks/release-rollback.md",
  "scripts/security-audit.mjs",
];

const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const requiredScripts = ["typecheck", "lint", "test", "build", "security:audit"];
const missingScripts = requiredScripts.filter((name) => !packageJson.scripts?.[name]);

if (missing.length || missingScripts.length) {
  if (missing.length) console.error("Missing readiness files:", missing.join(", "));
  if (missingScripts.length) console.error("Missing package scripts:", missingScripts.join(", "));
  process.exit(1);
}

console.log("Production readiness contract: structural checks passed.");
console.log("Runtime/database evidence is environment-dependent and is not inferred.");
