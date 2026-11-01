/**
 * Price-text drift guard. offer.ts is the single source of the commercial
 * offer; any "$NNN ... setup" wording elsewhere in src must agree with it, and
 * the prose that used to hard-code the price now reads it from GROWTH_SYSTEM.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM } from "@/lib/offer";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "migrations") continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|e2e)\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const EXCLUDED = new Set([join("src", "lib", "offer.ts"), join("src", "integrations", "supabase", "types.ts")]);
// A three-digit dollar amount followed closely by "setup", with no other
// dollar amount in between (so "$100/month ($350 setup)" reads as $350). The
// upper end of a range (a competitor price like "$300 – $800 setup" in
// a comparison table) is a comparison, not Revora's price, so it is skipped.
const PRICE_NEAR_SETUP = /(?<![–-]\s?)\$(\d{3})\b[^$\n]{0,24}?\bsetup\b/gi;

describe("offer price text", () => {
  it("is still the $350 setup offer", () => {
    expect(GROWTH_SYSTEM.setupPrice).toBe(350);
    expect(GROWTH_SYSTEM.monthlyPrice).toBe(100);
  });

  it("every '$NNN ... setup' phrase in src matches offer.ts", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of sourceFiles("src")) {
      if (EXCLUDED.has(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(PRICE_NEAR_SETUP)) {
        seen += 1;
        if (Number(match[1]) !== GROWTH_SYSTEM.setupPrice) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("billing prose builds prices from GROWTH_SYSTEM instead of hard-coding them", () => {
    for (const file of [
      "src/lib/email-templates/billing-lifecycle.tsx",
      "src/lib/email-templates/growth-assessment.tsx",
      "src/lib/builder/conversation.server.ts",
      "src/lib/analytics-taxonomy.ts",
      "src/lib/production.hooks.ts",
    ]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toContain("GROWTH_SYSTEM.setupPrice");
      expect(text, file).not.toMatch(/\$350\b/);
    }
  });

  it("checkout comments describe the real recurring amount", () => {
    expect(readFileSync("src/lib/stripe.functions.ts", "utf8")).toContain("never $450 recurring");
    expect(readFileSync(".github/workflows/security-gate.yml", "utf8")).toContain(
      "$350 + $100/month (DEFAULT_OFFER_RATES)",
    );
  });
});
