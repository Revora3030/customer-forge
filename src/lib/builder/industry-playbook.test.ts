import { describe, expect, it } from "vitest";
import { TRADE_PLAYBOOKS, playbookFor, playbookNote } from "./industry-playbook";

describe("trade playbooks", () => {
  it("gives every playbook a signature, a story arc of at least four scenes and what the owner must supply", () => {
    const keys = new Set<string>();
    for (const p of TRADE_PLAYBOOKS) {
      expect(keys.has(p.key)).toBe(false);
      keys.add(p.key);
      expect(p.signature.length).toBeGreaterThan(30);
      expect(p.storyArc.length).toBeGreaterThanOrEqual(4);
      expect(p.needsFromOwner.length).toBeGreaterThan(20);
    }
  });
  it("matches the trades it names", () => {
    const cases: [string, string][] = [
      ["Pressure washing", "exterior-cleaning"],
      ["Mobile auto detailing", "auto-detailing"],
      ["Roofing contractor", "roofing"],
      ["Lawn care & landscaping", "landscaping"],
      ["House cleaning", "cleaning"],
      ["HVAC", "hvac"],
      ["Plumbing", "plumbing"],
      ["Barber shop", "beauty"],
      ["Family dentist", "health"],
      ["Wedding photographer", "photo-creative"],
      ["Tax preparation", "real-estate-pro"],
    ];
    for (const [industry, key] of cases) expect(playbookFor(industry)?.key, industry).toBe(key);
  });
  it("returns nothing for an unknown or empty industry rather than guessing", () => {
    expect(playbookFor("Interstellar cheese")).toBeNull();
    expect(playbookFor("")).toBeNull();
    expect(playbookFor(null)).toBeNull();
    expect(playbookNote("Interstellar cheese")).toBeNull();
  });
  it("only ever asks for before-and-after material the owner supplies, never generated pictures", () => {
    for (const p of TRADE_PLAYBOOKS.filter((x) => /before_after_slider|revealMode|spin_viewer/.test(x.signature))) {
      expect(p.needsFromOwner, p.key).toMatch(/real|owner/i);
    }
    expect(JSON.stringify(TRADE_PLAYBOOKS)).not.toMatch(/AI-made|generated before|fake/i);
  });
  it("writes the note as ideas with the owner requirement attached", () => {
    const note = playbookNote("Pressure washing")!;
    expect(note).toContain("revealMode");
    expect(note).toContain("never invent proof");
    expect(note).toContain("What the owner must supply");
  });
});
