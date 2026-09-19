#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set([".git","node_modules","dist",".output",".tanstack",".nitro",".wrangler"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(root);
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  ["master-engine", "src/lib/builder/master-engine.ts", "compileUltimateSiteQuality"],
  ["quality", "src/lib/builder/ultimate-site-quality.ts", "ULTIMATE_QUALITY_DOMAINS"],
  ["design", "src/lib/builder/site-design-system.ts", "compileDesignSystemActions"],
  ["images", "src/lib/builder/site-image-intelligence.ts", "compileImageQualityActions"],
  ["conversion", "src/lib/builder/site-conversion-architecture.ts", "compileConversionArchitecture"],
  ["responsive", "src/lib/builder/site-responsive-autopilot.ts", "compileResponsiveAutopilot"],
  ["accessibility", "src/lib/builder/site-accessibility-autopilot.ts", "compileAccessibilityAutopilot"],
  ["seo", "src/lib/builder/site-seo-autopilot.ts", "compileSeoAutopilot"],
  ["renderer", "src/components/site/SiteSections.tsx", "readSectionVisual"],
  ["media-overlay", "src/styles.css", "rv-overlay-gradient"],
  ["catalog", "src/lib/builder/remaining-upgrades-catalog.ts", "REMAINING_SITE_UPGRADES"],
];

const failures = [];
for (const [name, file, token] of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(name + ": missing file");
  else if (!read(file).includes(token)) failures.push(name + ": missing contract " + token);
}

const result = {
  repositoryFiles: files.length,
  sourceFiles: files.filter((f) => /\.(ts|tsx|js|mjs|css|sql)$/.test(f)).length,
  requiredContracts: required.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
