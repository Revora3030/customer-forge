#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set([".git", "node_modules", "dist", ".output", ".tanstack", ".nitro", ".wrangler"]);

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
const hasFile = (file) => fs.existsSync(path.join(root, file));
const hasToken = (file, token) => hasFile(file) && read(file).includes(token);

/*
 * This audit must validate the contracts that actually exist in the current
 * builder architecture. The previous version asserted a set of removed
 * "ultimate" modules (master-engine, ultimate-site-quality, etc.), which made
 * CI fail even though those modules are not part of the repository.
 *
 * This is intentionally a structural contract audit, not a claim that the
 * creative-authority migration is complete. The migration itself has its own
 * architecture tests and acceptance checks.
 */
const required = [
  ["creative-authority", "src/lib/builder/creative-authority.ts", "requireAiDesignContract"],
  ["ai-design-contract", "src/lib/builder/ai-design-contract.ts", "validateAiDesignContract"],
  ["materializer", "src/lib/site-materialize.server.ts", "materializedSectionDesign"],
  ["site-agent", "src/lib/site-agent.ts", "set_component_visual"],
  ["site-agent-reorder", "src/lib/site-agent.ts", "reorder_components"],
  ["atomic-visual-journal", "src/lib/site-agent.atomic.ts", "set_component_visual"],
  ["media-integrity", "src/lib/builder/media-integrity.ts", "assertMediaIntegrity"],
  ["builder-ai-design", "src/lib/builder/ai-design-contract.ts", "AiDesignContract"],
];

const failures = [];
for (const [name, file, token] of required) {
  if (!hasFile(file)) failures.push(name + ": missing file");
  else if (!hasToken(file, token)) failures.push(name + ": missing contract " + token);
}

const result = {
  repositoryFiles: files.length,
  sourceFiles: files.filter((f) => /\.(ts|tsx|js|mjs|css|sql)$/.test(f)).length,
  requiredContracts: required.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
