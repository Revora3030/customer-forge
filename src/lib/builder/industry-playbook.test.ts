import { describe, expect, it } from "vitest";
import { TRADE_PLAYBOOKS, playbookFor, playbookNote, starterIdeasFor } from "./industry-playbook";
import { designGuidancePrompt } from "./design-guidance";

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
      ["Mobile locksmith", "locksmith"],
      ["24/7 towing and roadside", "towing"],
      ["Solar panel installation", "solar"],
      ["Solar panel cleaning", "solar"],
      ["Pool cleaning", "pool"],
      ["Garage door repair", "garage-door"],
      ["Appliance repair", "appliance-repair"],
    ];
    for (const [industry, key] of cases) expect(playbookFor(industry)?.key, industry).toBe(key);
  });
  it("does not let the new trades steal older ones", () => {
    for (const [industry, key] of [["Pressure washing", "exterior-cleaning"], ["House cleaning", "cleaning"], ["Day spa", "beauty"], ["Plumbing", "plumbing"], ["Tree service", "landscaping"]] as const)
      expect(playbookFor(industry)?.key, industry).toBe(key);
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

describe("starter ideas and chat guidance", () => {
  it("gives a known trade its signature and story first, and every trade the generic two", () => {
    const labels = starterIdeasFor("Mobile auto detailing").map((idea) => idea.label);
    expect(labels).toEqual(["Add my trade's signature moment", "Tell my story as I scroll", "Make every page richer", "Add a mobile action bar"]);
    expect(starterIdeasFor("Interstellar cheese").map((idea) => idea.label)).toEqual(["Make every page richer", "Add a mobile action bar"]);
    expect(starterIdeasFor(null)).toHaveLength(2);
  });

  it("never asks for invented proof: missing material is asked for, and no result is promised", () => {
    for (const trade of ["Pressure washing", "Mobile auto detailing", "Roofing contractor", "Locksmith", "Family dentist"]) {
      const signature = starterIdeasFor(trade).find((idea) => idea.label.includes("signature"));
      expect(signature, trade).toBeDefined();
      expect(signature!.instruction, trade).toContain("ask me for it instead of inventing it");
    }
    expect(JSON.stringify(starterIdeasFor("Pressure washing"))).not.toMatch(/guarantee|best in|award|#1/i);
  });

  it("puts the trade playbook into the chat planner's design guidance", () => {
    expect(designGuidancePrompt("Mobile auto detailing", "Elite Mobile Detail")).toContain("TRADE PLAYBOOK for Auto detailing and car care");
    expect(designGuidancePrompt("Interstellar cheese", "Brie Co")).not.toContain("TRADE PLAYBOOK");
  });
});
