#!/usr/bin/env node
/**
 * Fails when server-only code reaches the browser bundle.
 *
 * Root cause this guards: an exported plain helper in a `*.functions.ts` file
 * (e.g. runJarvis, computePlatformFunnel) kept its dynamic imports of
 * `*.server.ts` modules in the client build, which pulled `node:async_hooks`
 * into the browser and crashed /admin/jarvis with "e[t??default]".
 * Wrap such helpers in `createServerOnlyFn` or move them into a `.server.ts`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? ".output/public/assets";
if (!existsSync(dir)) {
  console.error(`client-bundle-guard: ${dir} not found; run the production build first.`);
  process.exit(1);
}
const files = readdirSync(dir).filter((name) => name.endsWith(".js"));
const problems = [];
for (const name of files) {
  if (/\.server-[\w-]+\.js$/.test(name)) problems.push(`${name}: a *.server module was emitted as a browser chunk`);
  const source = readFileSync(join(dir, name), "utf8");
  if (/AsyncLocalStorage|async_hooks/.test(source)) problems.push(`${name}: references node:async_hooks / AsyncLocalStorage`);
}
if (problems.length) {
  console.error("client-bundle-guard: server-only code leaked into the browser bundle:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log(`client-bundle-guard: ${files.length} browser chunks clean (no *.server chunks, no async_hooks).`);
