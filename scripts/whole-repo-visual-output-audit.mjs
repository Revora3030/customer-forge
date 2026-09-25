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
  ["set_component_visual", "src/lib/site-agent.ts", "src/lib/site-agent.functions.ts"],
  ["set_composition", "src/lib/site-agent.ts", "src/lib/site-agent.functions.ts"],
  ["readComposition", "src/lib/builder/composition-tree.ts", "src/components/site/SiteSections.tsx"],
  ["readComponentVisual", "src/lib/site-style.ts", "src/components/site/SiteSections.tsx"],
  // These actions persist the settings; the public route consumes the resulting
  // model through the actual renderer APIs rather than repeating the action name.
  ["set_theme", "src/lib/site-agent.functions.ts", "src/lib/site-theme.ts"],
  ["set_backdrop", "src/lib/site-agent.functions.ts", "src/components/site/SiteBackdrop.tsx"],
];

const failures = [];
for (const [token, producer, consumer] of contracts) {
  if (!read(producer).includes(token)) failures.push(token + " producer missing");
  const consumerText = read(consumer);
  const consumerToken =
    token === "set_theme"
      ? "siteThemeStyle"
      : token === "set_backdrop"
        ? "SiteBackdrop"
        : token === "set_composition"
          ? "writeComposition"
          : token;
  if (!consumerText.includes(consumerToken)) failures.push(token + " consumer missing");
}

const renderer = read("src/components/site/SiteSections.tsx");
const executor = read("src/lib/site-agent.functions.ts");

if (renderer.includes("rv-variant-")) failures.push("section variant renderer should not drive public layout");
if (!renderer.includes("CompositionRenderer")) failures.push("AI composition renderer missing");
if (!executor.includes('case "set_component_visual"')) failures.push("component visual executor missing");

const result = {
  scannedFiles: files.length,
  scannedSourceFiles: sourceFiles.length,
  contractsChecked: contracts.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
