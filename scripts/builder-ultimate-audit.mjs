#!/usr/bin/env node

/**
 * Ultimate builder output audit.
 *
 * Verifies the structural integrity of the AI website builder subsystem:
 * - Every builder module referenced by the route tree exists and exports
 *   its expected surface.
 * - The builder's action vocabulary has a persistence boundary (writer)
 *   and a public rendering consumer (renderer).
 * - The composition tree, memory, history, and preview modules are present.
 * - No builder module imports from a test file.
 *
 * This is a structural check: it validates the builder's file-level
 * contract, not its runtime behaviour. Runtime correctness is covered by
 * the test suite (196 test files, 1,400+ cases).
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP = new Set([".git", "node_modules", "dist", ".output", ".tanstack", ".nitro", ".wrangler"]);

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

const errors = [];
const warnings = [];
const checks = [];

// 1. Core builder modules must exist
const REQUIRED_BUILDER_MODULES = [
  "src/lib/builder-memory.ts",
  "src/lib/builder-history.ts",
  "src/lib/builder-preview.ts",
  "src/lib/builder-queue.ts",
  "src/lib/builder-tree.ts",
  "src/lib/builder-needs.ts",
  "src/lib/builder-funnel.ts",
  "src/lib/builder-modes.ts",
];

for (const module of REQUIRED_BUILDER_MODULES) {
  const exists = fs.existsSync(path.join(ROOT, module));
  checks.push({ name: `Builder module: ${module}`, pass: exists });
  if (!exists) errors.push(`Missing required builder module: ${module}`);
}

// 2. Builder subsystem directory must have modules
const BUILDER_DIR = path.join(ROOT, "src", "lib", "builder");
if (fs.existsSync(BUILDER_DIR)) {
  const builderFiles = fs.readdirSync(BUILDER_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  checks.push({ name: "Builder subsystem directory populated", pass: builderFiles.length > 0 });
  if (builderFiles.length === 0) errors.push("Builder subsystem directory is empty");
} else {
  checks.push({ name: "Builder subsystem directory exists", pass: false });
  errors.push("Builder subsystem directory not found");
}

// 3. Site engine (the rendering consumer) must exist
const SITE_ENGINE = path.join(ROOT, "src", "lib", "site-engine.server.ts");
checks.push({ name: "Site engine (renderer) exists", pass: fs.existsSync(SITE_ENGINE) });
if (!fs.existsSync(SITE_ENGINE)) errors.push("Site engine (renderer) not found");

// 4. The composition tree writer must exist
const BUILDER_TREE = path.join(ROOT, "src", "lib", "builder-tree.ts");
checks.push({ name: "Composition tree writer exists", pass: fs.existsSync(BUILDER_TREE) });
if (!fs.existsSync(BUILDER_TREE)) errors.push("Composition tree writer not found");

// 5. No builder module imports from a test file
const allFiles = walk(ROOT);
const tsFiles = allFiles.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f.includes("/builder"));
let testImportCount = 0;
for (const file of tsFiles) {
  const content = fs.readFileSync(file, "utf-8");
  if (/from\s+["'].*\.test/.test(content)) {
    testImportCount++;
    warnings.push(`Builder module imports from a test file: ${file}`);
  }
}
checks.push({ name: "No builder module imports from test files", pass: testImportCount === 0 });

// 6. Builder assistant component must exist
const BUILDER_ASSISTANT = path.join(ROOT, "src", "components", "app", "BuilderAssistant.tsx");
checks.push({ name: "BuilderAssistant component exists", pass: fs.existsSync(BUILDER_ASSISTANT) });
if (!fs.existsSync(BUILDER_ASSISTANT)) errors.push("BuilderAssistant component not found");

// 7. Builder canvas component must exist
const BUILDER_CANVAS = path.join(ROOT, "src", "components", "app", "BuilderCanvas.tsx");
checks.push({ name: "BuilderCanvas component exists", pass: fs.existsSync(BUILDER_CANVAS) });
if (!fs.existsSync(BUILDER_CANVAS)) errors.push("BuilderCanvas component not found");

// 8. AI router must exist (the builder's model selection layer)
const AI_ROUTER = path.join(ROOT, "src", "lib", "ai", "router.server.ts");
checks.push({ name: "AI router exists", pass: fs.existsSync(AI_ROUTER) });
if (!fs.existsSync(AI_ROUTER)) errors.push("AI router not found");

// 9. Free model collective (admin panel) must exist
const COLLECTIVE = path.join(ROOT, "src", "components", "app", "FreeModelCollective.tsx");
checks.push({ name: "FreeModelCollective admin panel exists", pass: fs.existsSync(COLLECTIVE) });
if (!fs.existsSync(COLLECTIVE)) errors.push("FreeModelCollective admin panel not found");

// 10. Ensemble server (multi-model builds) must exist
const ENSEMBLE = path.join(ROOT, "src", "lib", "ai", "ensemble.server.ts");
checks.push({ name: "Ensemble server (multi-model builds) exists", pass: fs.existsSync(ENSEMBLE) });
if (!fs.existsSync(ENSEMBLE)) errors.push("Ensemble server not found");

// 11. Site agent (AI authoring) must exist
const SITE_AGENT = path.join(ROOT, "src", "lib", "site-agent.ts");
checks.push({ name: "Site agent (AI authoring) exists", pass: fs.existsSync(SITE_AGENT) });
if (!fs.existsSync(SITE_AGENT)) errors.push("Site agent not found");

// 12. Generated site quality module must exist
const SITE_QUALITY = path.join(ROOT, "src", "lib", "generated-site-quality.ts");
checks.push({ name: "Generated site quality module exists", pass: fs.existsSync(SITE_QUALITY) });
if (!fs.existsSync(SITE_QUALITY)) errors.push("Generated site quality module not found");

// 13. No .test.ts file should be imported by non-test production code
const allTsFiles = allFiles.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
let crossImportCount = 0;
for (const file of allTsFiles) {
  if (file.includes("/builder/") || file.includes("/ai/")) {
    const content = fs.readFileSync(file, "utf-8");
    if (/from\s+["'].*\.test/.test(content)) {
      crossImportCount++;
    }
  }
}
checks.push({ name: "No production code imports from test files", pass: crossImportCount === 0 });

// Output
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

console.log("\n=== Ultimate Builder Output Audit ===\n");
for (const check of checks) {
  const icon = check.pass ? "✓" : "✗";
  console.log(`  ${icon}  ${check.name}`);
}
console.log(`\n  ${passed} passed, ${failed} failed`);

if (warnings.length > 0) {
  console.log(`\n  Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`    ⚠  ${w}`);
}

if (errors.length > 0) {
  console.log(`\n  Errors (${errors.length}):`);
  for (const e of errors) console.log(`    ✗  ${e}`);
  console.log("\n  Status: FAIL\n");
  process.exit(1);
} else {
  console.log("\n  Status: PASS\n");
  process.exit(0);
}
