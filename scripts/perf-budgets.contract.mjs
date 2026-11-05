#!/usr/bin/env node
/**
 * Contract: perf-budgets passes under measured headroom fixtures and fails when over.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { evaluateBudgets, listAssetFiles, matchFiles, metricValue } from "./perf-budgets.lib.mjs";
import { minimatch } from "./perf-budgets-minimatch.mjs";

const failures = [];

function expect(cond, msg) {
  if (!cond) failures.push(msg);
}

expect(minimatch("CityScene-abc.js", "CityScene-*.js"), "CityScene glob");
expect(!minimatch("admin.city-x.js", "CityScene-*.js"), "CityScene negative");
expect(minimatch("foo.js", "*.js"), "*.js");

const dir = mkdtempSync(join(tmpdir(), "perf-budgets-"));
const assets = join(dir, "assets");
mkdirSync(assets);
// ~1KB raw → small gzip
writeFileSync(join(assets, "CityScene-test.js"), "console.log('city');\n".repeat(50));
writeFileSync(join(assets, "admin.city-test.js"), "console.log('admin');\n".repeat(40));
writeFileSync(join(assets, "other.js"), "x".repeat(100));
writeFileSync(join(assets, "styles.css"), "body{color:red}\n".repeat(20));

const files = listAssetFiles(assets).filter((f) => f.name.endsWith(".js") || f.name.endsWith(".css"));
const city = matchFiles(files, "CityScene-*.js");
expect(city.length === 1, "match CityScene");
const cityGz = metricValue(city, "gzipMax");

const pass = evaluateBudgets(files, [
  { id: "city", glob: "CityScene-*.js", metric: "gzipMax", maxBytes: cityGz + 10, required: true },
  { id: "js-sum", glob: "*.js", metric: "gzipSum", maxBytes: 10_000_000 },
  { id: "css-sum", glob: "*.css", metric: "gzipSum", maxBytes: 10_000_000 },
]);
expect(pass.ok, "should pass under headroom");

const fail = evaluateBudgets(files, [
  { id: "city-tight", glob: "CityScene-*.js", metric: "gzipMax", maxBytes: Math.max(0, cityGz - 1), required: true },
]);
expect(!fail.ok, "should fail when over budget");
expect(fail.errors.some((e) => e.includes("city-tight")), "fail mentions id");

const missing = evaluateBudgets(files, [
  { id: "need-three", glob: "three.module-*.js", metric: "gzipMax", maxBytes: 1, required: true },
]);
expect(!missing.ok, "required missing file fails");

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error("perf-budgets.contract FAIL:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("perf-budgets.contract: ok");
// prove gzip of fixture is deterministic-ish
void gzipSync(Buffer.from("x"));
