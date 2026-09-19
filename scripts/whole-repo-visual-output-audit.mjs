#!/usr/bin/env node

/**
 * Whole-repository generated-site output audit.
 *
 * This intentionally scans the repository tree instead of assuming a fixed
 * file count. It verifies that the visual action vocabulary has a persistence
 * boundary and a public rendering consumer.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set([".git", "node_modules", "dist", ".output", ".tanstack", ".nitro", ".wrangler"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".js", ".mjs", ".sql", ".md", ".json"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

const contracts = [
  ["set_section_visual", "src/lib/site-agent.ts", "src/lib/site-agent.functions.ts"],
  ["set_component_visual", "src/lib/site-agent.ts", "src/lib/site-agent.functions.ts"],
  ["readSectionVisual", "src/lib/site-style.ts", "src/components/site/SiteSections.tsx"],
  ["readComponentVisual", "src/lib/site-style.ts", "src/components/site/SiteSections.tsx"],
  ["set_theme", "src/lib/site-agent.functions.ts", "src/lib/site-theme.ts"],
  ["set_backdrop", "src/lib/site-agent.functions.ts", "src/components/site/SiteBackdrop.tsx"],
];

const failures = [];
for (const [token, producer, consumer] of contracts) {
  if (!read(producer).includes(token)) failures.push(token + " producer missing");
  if (!read(consumer).includes(token)) failures.push(token + " consumer missing");
}

const renderer = read("src/components/site/SiteSections.tsx");
const executor = read("src/lib/site-agent.functions.ts");
const style = read("src/lib/site-style.ts");

if (!renderer.includes("rv-variant-")) failures.push("section variant renderer missing");
if (!renderer.includes("rv-generated-media")) failures.push("generated media renderer missing");
if (!renderer.includes("hero_image_url")) failures.push("hero image renderer missing");
if (!executor.includes('case "set_section_visual"')) failures.push("section visual executor missing");
if (!executor.includes('case "set_component_visual"')) failures.push("component visual executor missing");
if (!style.includes("SECTION_VISUAL_VALUES")) failures.push("visual token allowlist missing");

const result = {
  scannedFiles: files.length,
  scannedSourceFiles: sourceFiles.length,
  contractsChecked: contracts.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
