import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BUSINESS } from "@/lib/business-identity";
import { GROWTH_SYSTEM } from "@/lib/offer";

/**
 * Honest-copy guard (Manager audit #4). Marketing pages must not promise
 * always-available humans or hours Revora does not staff, and the /pricing
 * charge wording must agree with the billing code and the offer module.
 */

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_authenticated" || name === "api") continue;
      walk(full, out);
    } else if (/\.(tsx?|md)$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const MARKETING_FILES = [
  ...walk(join(ROOT, "components", "marketing")),
  ...walk(join(ROOT, "routes")),
  ...walk(join(ROOT, "content", "seo")),
  join(ROOT, "lib", "crm-solutions.ts"),
  join(ROOT, "lib", "local-pages.ts"),
  join(ROOT, "lib", "offer.ts"),
];

/** Always-available promises. "Cancel anytime" is a cancellation term, not an availability claim. */
const BANNED = [
  /any hour/i,
  /24\s?\/\s?7/,
  /24 hours a day/i,
  /around[- ]the[- ]clock/i,
  /round[- ]the[- ]clock/i,
  /day or night/i,
  /reach a real person/i,
  /never stops working/i,
  /\b(reach|reply|replies|answer|answers|respond|responds|available|support)\b[^.\n]{0,40}\banytime\b/i,
];

describe("always-available wording stays off marketing pages", () => {
  it("scans a real set of files", () => {
    expect(MARKETING_FILES.length).toBeGreaterThan(40);
  });

  it.each(BANNED.map((re) => [String(re), re] as const))("no marketing copy matches %s", (_n, re) => {
    const hits = MARKETING_FILES.filter((f) => re.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("the footer business line points to the support email without promising hours", () => {
    const src = readFileSync(join(ROOT, "components", "marketing", "BusinessDetails.tsx"), "utf8");
    expect(src).toContain("{BUSINESS.email}");
    expect(src).toMatch(/will reply/);
    expect(BUSINESS.email).toBe("hello@revoragrowthsystems.com");
  });
});

describe("/pricing charge wording matches the offer module and billing code", () => {
  const { explainer } = GROWTH_SYSTEM;
  const pricing = readFileSync(join(ROOT, "routes", "pricing.tsx"), "utf8");
  const offerSections = readFileSync(join(ROOT, "components", "marketing", "OfferSections.tsx"), "utf8");

  it("the canonical explainer states when the setup is charged and when the first monthly payment lands", () => {
    expect(explainer).toContain(`$${GROWTH_SYSTEM.setupPrice} setup`);
    expect(explainer).toContain(`$${GROWTH_SYSTEM.monthlyPrice}/month`);
    expect(explainer).toContain(`${GROWTH_SYSTEM.fullAccessTrialDays} days of free access`);
    expect(explainer).toContain("needs no card");
    expect(explainer).toContain(`${GROWTH_SYSTEM.trialDays} days after setup`);
    expect(explainer).toMatch(/when you launch at checkout/);
    // The relative "today" is what read as a contradiction next to "3 days free, no card".
    expect(explainer).not.toMatch(/charged today/i);
  });

  it("the pricing page never pairs a relative 'charged today' with the free-access line", () => {
    expect(pricing).not.toMatch(/charged today/i);
    expect(offerSections).not.toMatch(/charged today/i);
    expect(pricing).toContain("Nothing is");
    expect(pricing).toContain("charged during it");
    expect(pricing).toContain("GROWTH_SYSTEM.fullAccessWindow");
  });

  it("the free-month length and trial length come from the offer module, not literals", () => {
    expect(GROWTH_SYSTEM.trialDays).toBe(30);
    expect(GROWTH_SYSTEM.fullAccessTrialDays).toBe(3);
    expect(pricing).not.toMatch(/\b3 days free\b/i);
  });
});
