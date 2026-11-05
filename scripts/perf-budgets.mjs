#!/usr/bin/env node
/**
 * JC-63 performance budgets (client bundle gzip sizes).
 * Usage: node scripts/perf-budgets.mjs [assetsDir]
 * Default assets dir: first existing of .output/public/assets, dist/assets.
 * Wired from client-bundle-guard (post-build CI) — no workflow edit.
 */
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveAssetsDir,
  listAssetFiles,
  evaluateBudgets,
  loadBudgetsConfig,
} from "./perf-budgets.lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const config = loadBudgetsConfig(join(here, "perf-budgets.json"));
const dirArg = process.argv[2];
const dir = dirArg
  ? isAbsolute(dirArg)
    ? dirArg
    : join(cwd, dirArg)
  : resolveAssetsDir(cwd, config.assetDirs ?? [".output/public/assets", "dist/assets"]);

if (!dir) {
  console.error(
    "perf-budgets: no assets dir found (tried " +
      (config.assetDirs ?? []).join(", ") +
      "); run the production build first.",
  );
  process.exit(1);
}

const files = listAssetFiles(dir).filter((f) => f.name.endsWith(".js") || f.name.endsWith(".css"));
const { ok, results, errors } = evaluateBudgets(files, config.budgets);

for (const r of results) {
  const status = r.skipped ? "skip" : r.ok ? "ok" : "FAIL";
  console.log(
    `perf-budgets: [${status}] ${r.id} value=${r.value} max=${r.maxBytes} matched=${r.matched}`,
  );
}
if (!ok) {
  console.error("perf-budgets: budget exceeded:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`perf-budgets: ${results.length} budgets ok (${files.length} js/css assets in ${dir}).`);
