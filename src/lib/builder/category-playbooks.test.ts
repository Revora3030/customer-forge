import { describe, expect, it } from "vitest";
import { TRADE_PLAYBOOKS, blueprintFor, playbookFor, playbookNote, archetypeFor, starterIdeasFor } from "@/lib/builder/industry-playbook";
import { referenceMomentsFor, tradeStructureNote, ESTIMATE_TRADE_KEYS } from "@/lib/builder/reference-standard";
import { blueprintForKey } from "@/lib/builder/trade-blueprints";
import { PLAYBOOK_CATALOG } from "@/lib/builder/playbook-catalog.generated";
import { CATALOG_TO_EXISTING, catalogEntryFor, catalogNote } from "@/lib/builder/playbook-catalog";

const WATER = ["Jet ski rental", "Jetski rentals", "PWC rental", "Watercraft rental", "Boat rental and tours", "Pontoon boat rental", "Waverunner rentals", "Paddle board and kayak rental tours", "Water sports rental", "Powersports rentals"];
const GOLF = ["Golf course", "Golf club", "Country club", "Public golf course and driving range", "Mini golf", "Golf resort"];
const BUILDER = ["Luxury home builder", "Custom home builder", "Homebuilder", "Luxury custom homes", "Design-build firm", "Custom home building", "Residential home builder"];

describe("category names reach their own playbook", () => {
  it.each(WATER)("%s -> watersports-rentals", (name) => {
    expect(playbookFor(name)?.key).toBe("watersports-rentals");
    expect(blueprintFor(name)?.key).toBe("watersports-rentals");
  });
  it.each(GOLF)("%s -> golf-course", (name) => {
    expect(playbookFor(name)?.key).toBe("golf-course");
    expect(blueprintFor(name)?.key).toBe("golf-course");
  });
  it.each(BUILDER)("%s -> home-builder", (name) => {
    expect(playbookFor(name)?.key).toBe("home-builder");
    expect(blueprintFor(name)?.key).toBe("home-builder");
  });
  it("a broader trade word in the same name does not steal the category", () => {
    expect(playbookFor("Luxury home builder with pool and kitchen design")?.key).toBe("home-builder");
    expect(playbookFor("Golf club with pool and restaurant")?.key).toBe("golf-course");
    expect(playbookFor("Jet ski and boat rental, tours and charter")?.key).toBe("watersports-rentals");
  });
  it("does not capture unrelated businesses", () => {
    expect(playbookFor("Website builder software")?.key).not.toBe("home-builder");
    expect(playbookFor("Kitchen remodeling contractor")?.key).toBe("contracting");
    expect(playbookFor("Real estate agent")?.key).toBe("real-estate");
    expect(playbookFor("Pressure washing")?.key).toBe("pressure-washing");
    expect(playbookFor("Plumbing")?.key).toBe("plumbing");
    expect(playbookFor("Swimming pool service")?.key).toBe("pool");
  });
  it("gives each a look archetype instead of the generic one", () => {
    expect(archetypeFor("Jet ski rental")?.key).toBe("hospitality-lifestyle");
    expect(archetypeFor("Golf course")?.key).toBe("hospitality-lifestyle");
    expect(archetypeFor("Luxury home builder")?.key).toBe("precision-craft");
  });
});

describe("category playbook content (from the catalog)", () => {
  it("states that every number comes from the owner", () => {
    for (const name of ["Jet ski rental", "Golf course", "Luxury home builder"]) {
      const playbook = playbookFor(name)!;
      expect(playbook.needsFromOwner, name).toMatch(/Owner-supplied values, never defaulted/);
      expect(playbook.needsFromOwner, name).toMatch(/Omit when missing: .*any number without an owner key/);
      expect(playbook.storyArc.length, name).toBeGreaterThanOrEqual(5);
      expect(`${playbook.signature} ${playbook.needsFromOwner}`, name).not.toMatch(/\$\s?\d|\d+\s?(?:mph|psi|hp)\b|\d+\s?%|\d+\+/i);
    }
  });
  it("jet ski is request mode with a signature tool, owner rates and owner specs only", () => {
    const note = playbookNote("Jet ski rental")!;
    expect(note).toContain("CATALOG PLAYBOOK (");
    expect(note).toMatch(/Signature tool: Reserve your ride \(BookingPicker, request mode\)/);
    expect(note).toMatch(/never shows a time as open, held or confirmed/);
    expect(note).toMatch(/countUp only for figures the owner supplied/);
    expect(referenceMomentsFor("watersports-rentals").tryIt).toMatch(/booking_form/);
  });
  it("golf is request mode with an optional owner tee-sheet link", () => {
    const note = playbookNote("Golf course")!;
    expect(note).toMatch(/BookingPicker, request mode/);
    expect(note).toMatch(/own booking or tee-sheet URL, add one secondary link button/);
    expect(note).toMatch(/with no URL, leave it out\. Never invent the URL/);
    expect(note).toMatch(/measured data only/);
  });
  it("the luxury builder has a time-lapse and configurator and never an instant price", () => {
    const note = playbookNote("Luxury home builder")!;
    expect(note).toMatch(/scrub_sequence/);
    expect(note).toMatch(/ConfiguratorSwitch, configure mode/);
    expect(note).toMatch(/never an instant price/);
    expect(note).toMatch(/budget pill appears ONLY if the owner set/);
    expect(tradeStructureNote("home-builder", "precision-craft")).toBeNull();
    expect(note).not.toContain("TRADE STRUCTURE");
  });
  it("the luxury real estate moment offers a floor selector from developer data only", () => {
    expect(referenceMomentsFor("real-estate").tryIt).toMatch(/building_explorer floor selector.*only the unit, level, size and price lines the developer supplied/);
    const note = playbookNote("New condo tower development")!;
    expect(note).toMatch(/CATALOG PLAYBOOK|Floor selector/);
    expect(playbookFor("Pre-construction condo development")?.key).toMatch(/luxury-real-estate-tower|condo-floor-selector/);
  });
  it("tells every video hero what reduced motion shows", () => {
    for (const name of ["Jet ski rental", "Golf course", "Luxury home builder"]) expect(playbookNote(name), name).toMatch(/poster frame with a visible play\/pause control/);
  });
  it("blueprints exist, are dark, and carry the catalog palette with no proof or price claims", () => {
    for (const key of ["watersports-rentals", "golf-course", "home-builder"]) {
      const b = blueprintForKey(key)!;
      const c = PLAYBOOK_CATALOG.find((e) => e.slug === key)!;
      expect(b.tone).toBe("dark");
      expect(b.palette.canvas).toBe(c.palette.base);
      expect(b.palette.accent).toBe(c.palette.accent);
      expect(b.fonts.display).toBe(c.fonts.display);
      expect([b.signatureWidget, b.look, b.cta.primary, b.cta.secondary].join(" ")).not.toMatch(/\$|\d|award|best |guarantee|rated/i);
    }
  });
  it("offers starter ideas for them", () => {
    for (const name of ["Jet ski rental", "Golf course", "Luxury home builder"]) {
      expect(starterIdeasFor(name)[0]!.reason).toBe(playbookFor(name)!.label);
    }
  });
});

describe("the whole catalog reaches the builder", () => {
  it("has 53 categories", () => expect(PLAYBOOK_CATALOG).toHaveLength(53));
  it("every category except the fallback has a playbook, a blueprint and a catalog note", () => {
    for (const e of PLAYBOOK_CATALOG) {
      if (e.slug === "generic-fallback") continue;
      const key = CATALOG_TO_EXISTING[e.slug] ?? e.slug;
      expect(TRADE_PLAYBOOKS.some((p) => p.key === key), e.slug).toBe(true);
      expect(blueprintForKey(key), e.slug).not.toBeNull();
      expect(catalogNote(catalogEntryFor(key, e.label)), e.slug).toContain(e.tool.name);
    }
  });
  it("names reach new categories without disturbing existing ones", () => {
    const cases: Array<[string, string]> = [
      ["Tree service", "landscaping"], ["Flooring installer", "flooring"], ["Fencing and decking", "fencing-decking"], ["Pet grooming", "pet-grooming-vet"],
      ["Junk removal", "junk-removal"], ["Tattoo studio", "tattoo"], ["Wedding venue", "wedding-event-venue"],
      ["Brewery and taproom", "brewery-winery"], ["Winery", "brewery-winery"], ["Food truck", "catering-food-truck"], ["Private chef", "catering-food-truck"], ["Wedding photographer", "photo-creative"], ["Restaurant and catering", "restaurants"], ["Florist", "florist-gifts"],
      ["Bookkeeping and tax prep", "professional-services"], ["Insurance agency", "professional-services"], ["Senior home care", "home-care-senior"],
      ["Fishing charter", "outdoor-guide-charter"], ["Yoga studio", "gyms-fitness"], ["Interior design studio", "interior-design"],
      ["Dog grooming and veterinary", "pet-grooming-vet"], ["Concrete and masonry", "concrete-masonry"],
      ["Barbershop", "salons-barbers"], ["Family dentist", "dentist"], ["Italian restaurant", "restaurants"], ["Personal injury law firm", "law-firms"],
    ];
    for (const [name, key] of cases) expect(playbookFor(name)?.key, name).toBe(key);
  });
  it("loose catalog words do not capture other businesses", () => {
    expect(playbookFor("Software developer")?.key ?? "").not.toMatch(/tower|condo/);
    expect(playbookFor("Interior painting")?.key).toBe("painting");
    expect(playbookFor("Pool construction")?.key).not.toBe("home-builder");
    expect(playbookFor("Luxury real estate agent")?.key).toBe("real-estate");
    expect(playbookFor("Condo specialist realtor")?.key ?? "real-estate").not.toBe("condo-floor-selector");
  });
  it("a tree company and a yoga studio keep their older playbook and get the catalog note that fits", () => {
    expect(catalogEntryFor("landscaping", "Tree service")?.slug).toBe("tree-service");
    expect(catalogEntryFor("landscaping", "Landscaping")?.slug).toBe("landscaping");
    expect(catalogEntryFor("gyms-fitness", "Yoga studio")?.slug).toBe("martial-arts-yoga");
    expect(catalogEntryFor("gyms-fitness", "Gym")?.slug).toBe("fitness");
    expect(catalogEntryFor("professional-services", "Insurance agency")?.slug).toBe("insurance-agency");
    expect(catalogEntryFor("professional-services", "Bookkeeping")?.slug).toBe("accounting-tax");
  });
  it("a hair salon gets the hair entry and a barber the barber entry", () => {
    expect(catalogEntryFor("salons-barbers", "Hair salon")?.slug).toBe("hair-stylists");
    expect(catalogEntryFor("salons-barbers", "Barbershop")?.slug).toBe("barbers");
  });
  it("no generated text carries a price, statistic or rating", () => {
    for (const e of PLAYBOOK_CATALOG) {
      // A quoted example of what NOT to do ("from $19" bait) is a rule, not a claim.
      const text = [e.hero.concept, e.hero.primaryCta, e.tool.name, e.tool.output, ...e.chapters, ...e.truth.disclaimers].join(" ").replace(/no 'from \$\d+' style bait/g, "");
      expect(text, e.slug).not.toMatch(/\$\s?\d|\d+ ?stars?|5-star|#1\b|rated \d/i);
    }
  });
});

describe("trade structure is forced for trades", () => {
  it("requires the quote calculator and a services section on a pressure washing site", () => {
    const note = playbookNote("Pressure washing")!;
    expect(note).toContain("TRADE STRUCTURE");
    expect(note).toMatch(/MUST contain the trade's lead tool: a quote_calculator/);
    expect(note).toMatch(/MUST have a services section/);
    expect(note).toMatch(/its own services page/);
    expect(note).toMatch(/no tool behind it is a defect/);
  });
  it("shows a from price only when the owner set a rate; otherwise request-only", () => {
    const note = tradeStructureNote("pressure-washing")!;
    expect(note).toMatch(/only when the owner set a rate/);
    expect(note).toMatch(/request-only/);
    expect(note).toMatch(/shows no number at all/);
  });
  it("allows stat bands only with real owner numbers", () => {
    expect(tradeStructureNote("roofing")).toMatch(/only with real numbers the owner supplied/);
  });
  it("covers trades and generic trade archetypes but not non-trades", () => {
    for (const key of ["plumbing", "hvac", "roofing", "cleaning", "landscaping", "auto-detailing", "home-services", "precision-craft"]) {
      expect(ESTIMATE_TRADE_KEYS.has(key), key).toBe(true);
      expect(tradeStructureNote(key), key).not.toBeNull();
    }
    for (const name of ["Plumbing", "Roofing contractor", "House cleaning", "Mobile auto detailing"]) expect(playbookNote(name), name).toContain("TRADE STRUCTURE");
    for (const name of ["Family dentist", "Italian restaurant", "Personal injury law firm", "Golf course", "Jet ski rental"]) expect(playbookNote(name), name).not.toContain("TRADE STRUCTURE");
    expect(tradeStructureNote(null)).toBeNull();
  });
});
