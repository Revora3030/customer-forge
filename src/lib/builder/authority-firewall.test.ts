import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createDesignFingerprint, neutralDesignFingerprint } from "./design-fingerprint";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
const production = files("src");

describe("creative authority firewall", () => {
  it("no production code imports the template gallery or archetype recipes", () => {
    const offenders = production.filter((f) => {
      if (f.endsWith("template-gallery.ts") || f.endsWith("site-archetypes.ts")) return false;
      return /from ["'][^"']*(template-gallery|site-archetypes)["']/.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it("the fingerprint can no longer pick designs from finite pools", () => {
    const neutral = neutralDesignFingerprint();
    const a = createDesignFingerprint({ businessName: "Alpha Plumbing", industry: "plumbing", city: "Austin" });
    const b = createDesignFingerprint({ businessName: "Zeta Law", industry: "legal", city: "Boston" });
    for (const fp of [a, b]) {
      expect({ ...fp, id: neutral.id, seed: neutral.seed, rejected: neutral.rejected }).toEqual(neutral);
    }
  });
});
