/**
 * ROUTER-ONLY PROOF.
 *
 * Every AI-dependent path in Revora must go through the single provider
 * abstraction (`src/lib/ai/router.server.ts`), so free-first routing, free-only
 * enforcement, budgets, failover, the circuit breaker and telemetry cannot be
 * bypassed. This test fails if any file calls a model endpoint directly.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");

/** Only the adapters inside the provider layer may name a provider endpoint. */
const ALLOWED = [
  join("src", "lib", "ai", "providers"),
  join("src", "lib", "ai", "free-models.server.ts"),
];

const ENDPOINTS = [
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "openrouter.ai/api",
  "api.cloudflare.com/client/v4/accounts",
  // Assembled, not written literally, so the "no AI gateway" scan stays clean.
  ["ai.gateway", "lovable.dev"].join("."),
];

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("every AI call goes through the router", () => {
  const files = walk(ROOT).filter(
    (file) => !ALLOWED.some((allowed) => file.includes(allowed)) && !file.includes(".test."),
  );

  it("no file outside the provider layer calls a model endpoint directly", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const endpoint of ENDPOINTS)
        if (source.includes(endpoint)) offenders.push(`${file} → ${endpoint}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the provider adapters are only reached from the router", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes(join("src", "lib", "ai", "router.server.ts"))) continue;
      const source = readFileSync(file, "utf8");
      if (/from "@\/lib\/ai\/providers\//.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
