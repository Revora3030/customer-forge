import { describe, expect, it } from "vitest";
import { ARCHETYPES, TRADE_PLAYBOOKS, archetypeFor, playbookFor, playbookNote, starterIdeasFor } from "./industry-playbook";
import { COMPOSITION_PRIMITIVES, COMPOSITION_WIDGETS } from "./composition-tree";
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
      ["Pressure washing", "pressure-washing"],
      ["Gutter and window cleaning", "exterior-cleaning"],
      ["Mobile auto detailing", "auto-detailing"],
      ["Roofing contractor", "roofing"],
      ["Lawn care & landscaping", "landscaping"],
      ["House cleaning", "cleaning"],
      ["HVAC", "hvac"],
      ["Plumbing", "plumbing"],
      ["Barber shop", "salons-barbers"],
      ["Med spa", "med-spa"],
      ["Botox and filler clinic", "med-spa"],
      ["Family dentist", "dentist"],
      ["Orthodontist", "dentist"],
      ["CrossFit gym", "gyms-fitness"],
      ["Yoga studio", "gyms-fitness"],
      ["Chiropractor", "medical-wellness"],
      ["Personal injury law firm", "law-firms"],
      ["Realtor", "real-estate"],
      ["Italian restaurant", "restaurants"],
      ["Coffee shop", "restaurants"],
      ["Wedding photographer", "photo-creative"],
      ["Tax preparation", "professional-services"],
      ["Mortgage broker", "professional-services"],
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
    for (const [industry, key] of [["Pressure washing", "pressure-washing"], ["House cleaning", "cleaning"], ["Day spa", "salons-barbers"], ["Accident attorney", "law-firms"], ["Plumbing", "plumbing"], ["Tree service", "landscaping"]] as const)
      expect(playbookFor(industry)?.key, industry).toBe(key);
  });
  it("has no specific trade for an unknown industry, and no note at all for no industry", () => {
    expect(playbookFor("Interstellar cheese")).toBeNull();
    expect(playbookFor("")).toBeNull();
    expect(playbookFor(null)).toBeNull();
    expect(playbookNote("")).toBeNull();
    expect(playbookNote(null)).toBeNull();
    expect(playbookNote(undefined, "")).toBeNull();
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
    // An unmatched business still gets its archetype's signature moment and story; no business at all gets only the generic two.
    expect(starterIdeasFor("Interstellar cheese").map((idea) => idea.label)).toEqual(["Add the signature moment for my business", "Tell my story as I scroll", "Make every page richer", "Add a mobile action bar"]);
    expect(starterIdeasFor(null).map((idea) => idea.label)).toEqual(["Make every page richer", "Add a mobile action bar"]);
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
    // A business with no specific trade gets the general design guide, never nothing.
    const general = designGuidancePrompt("Interstellar cheese", "Brie Co");
    expect(general).not.toContain("TRADE PLAYBOOK");
    expect(general).toContain("DESIGN GUIDE for this kind of business, General local business");
  });
});

describe("universal archetypes", () => {
  const key = (industry: string | null, hints: string | null = null) => archetypeFor(industry, hints)?.key;

  it("puts businesses with no specific trade into the right archetype, from the categories people actually enter", () => {
    const cases: [string, string][] = [
      ["AI agency", "tech-growth"],
      ["SaaS platform", "tech-growth"],
      ["Industrial crane leasing", "tech-growth"],
      ["Digital marketing agency", "tech-growth"],
      ["Freight and logistics", "tech-growth"],
      ["Boutique law firm", "clinical-trust"],
      ["Wealth management", "clinical-trust"],
      ["Architecture practice", "clinical-trust"],
      ["Senior care", "clinical-trust"],
      ["Artisanal chocolatier", "hospitality-lifestyle"],
      ["Boutique hotel", "hospitality-lifestyle"],
      ["Escape room", "hospitality-lifestyle"],
      ["Wine bar", "hospitality-lifestyle"],
      ["Florist", "hospitality-lifestyle"],
      ["Bespoke jewelry", "precision-craft"],
      ["Furniture restoration", "precision-craft"],
      ["Ceramic studio", "precision-craft"],
      ["Interior design", "precision-craft"],
      ["Dog grooming", "home-services"],
      ["Chimney sweep", "home-services"],
      ["Snow plowing", "home-services"],
      ["Water damage restoration", "emergency-dispatch"],
      ["24/7 emergency boiler breakdown", "emergency-dispatch"],
      ["Disaster recovery", "emergency-dispatch"],
      ["Interstellar cheese", "general"],
    ];
    for (const [industry, expected] of cases) expect(key(industry), industry).toBe(expected);
  });

  it("keeps a specific trade's own guidance and gives it its archetype's look", () => {
    expect(playbookFor("Mobile auto detailing")?.key).toBe("auto-detailing");
    expect(key("Mobile auto detailing")).toBe("precision-craft");
    expect(key("Plumbing")).toBe("emergency-dispatch");
    expect(key("Family dentist")).toBe("clinical-trust");
    // A gym and a dance school share a playbook with other trades but not their look.
    expect(key("Boutique fitness gym")).toBe("hospitality-lifestyle");
    expect(key("Dance academy")).toBe("hospitality-lifestyle");
    const note = playbookNote("Mobile auto detailing")!;
    expect(note).toContain("TRADE PLAYBOOK for Auto detailing and car care");
    // The look now comes from the trade blueprint, not one obsidian canvas for every business.
    expect(note).toContain("Auto detailing blueprint");
    expect(note).not.toContain("the canvas is the cinematic obsidian studio");
    // Only a business with no category signal keeps the reference's obsidian studio.
    expect(playbookNote("Mystery business")).toContain("the canvas is the cinematic obsidian studio on every page");
  });

  it("falls back to the description or service names when the industry says nothing, and to the general archetype otherwise", () => {
    expect(key("", "We lease cranes and heavy lifting rigs to builders")).toBe("tech-growth");
    expect(key("Consultancy-ish thing", "")).toBe("clinical-trust");
    expect(key("Mystery business", "")).toBe("general");
    expect(archetypeFor(null, null)).toBeNull();
    expect(playbookNote("Mystery business")).toContain("DESIGN GUIDE for this kind of business, General local business");
  });

  it("is well formed: one of each key, general last and matchless, and a story of at least four beats", () => {
    const keys = ARCHETYPES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["emergency-dispatch", "tech-growth", "clinical-trust", "hospitality-lifestyle", "precision-craft", "home-services", "general"]);
    expect(ARCHETYPES.at(-1)!.match).toBeNull();
    for (const a of ARCHETYPES) {
      expect(a.signature.length, a.key).toBeGreaterThan(60);
      expect(a.storyArc.length, a.key).toBeGreaterThanOrEqual(4);
      expect(a.needsFromOwner.length, a.key).toBeGreaterThan(40);
      expect(a.look.length, a.key).toBeGreaterThan(40);
    }
  });

  it("only names building blocks the composer really has, in archetypes and in every trade playbook", () => {
    const known = new Set<string>([...COMPOSITION_PRIMITIVES, ...COMPOSITION_WIDGETS]);
    const texts = [...ARCHETYPES.map((a) => `${a.signature} ${a.needsFromOwner}`), ...TRADE_PLAYBOOKS.map((p) => `${p.signature} ${p.needsFromOwner}`)];
    for (const text of texts) for (const name of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) expect(known.has(name), `${name} in "${text.slice(0, 50)}…"`).toBe(true);
  });

  it("suggests and promises nothing it cannot back: no colours, fonts, figures or proof words in what it asks Sol to build", () => {
    for (const a of ARCHETYPES) {
      const asked = `${a.signature} ${a.look} ${a.storyArc.join(" ")}`;
      expect(asked, a.key).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(asked, a.key).not.toMatch(/space grotesk|instrument serif|cormorant|plus jakarta|syne|manrope|inter\b/i);
      expect(asked, a.key).not.toMatch(/guarantee|award|certified|licensed|\d+%|\$\s?\d/i);
      expect(a.look, a.key).not.toMatch(/must|always use|required/i);
    }
  });

  it("asks only for real material: every archetype says what the owner must supply and bars invented proof", () => {
    for (const a of ARCHETYPES) expect(a.needsFromOwner, a.key).toMatch(/real|owner|supplied|instead of inventing/i);
    expect(ARCHETYPES.find((a) => a.key === "emergency-dispatch")!.needsFromOwner).toMatch(/never state arrival times/i);
    expect(ARCHETYPES.find((a) => a.key === "tech-growth")!.needsFromOwner).toMatch(/no customer counts, uptime, savings/i);
    expect(ARCHETYPES.find((a) => a.key === "clinical-trust")!.needsFromOwner).toMatch(/never imply a cure/i);
  });
});
