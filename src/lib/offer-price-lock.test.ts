import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_OFFER_RATES, GROWTH_SYSTEM } from "./offer";
import { formatRevoraOffer } from "./jarvis-acquisition-policy";

// Owner decision (2026-10-22): $350 setup, first month free, then $100/month, everywhere.
describe("Revora price lock", () => {
  it("canonical rates are $350 setup and $100/month", () => {
    expect(CANONICAL_OFFER_RATES).toEqual({ setupPrice: 350, monthlyPrice: 100 });
    expect(GROWTH_SYSTEM.setupPrice).toBe(350);
    expect(GROWTH_SYSTEM.monthlyPrice).toBe(100);
  });

  it("outreach and Jarvis offer sentence states $350 and $100/month", () => {
    const offer = formatRevoraOffer();
    expect(offer).toContain("$350");
    expect(offer).toContain("$100/month");
  });

  it("no app source outside tests mentions a $750 setup", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|css|md)$/.test(name) && !/\.test\.tsx?$/.test(name) && /\$750/.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    walk("src");
    expect(hits).toEqual([]);
  });
});
