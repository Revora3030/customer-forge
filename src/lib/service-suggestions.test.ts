import { describe, expect, it } from "vitest";
import {
  SUGGESTION_LIMITS,
  buildSuggestionMessages,
  menuNeedsHelp,
  parseSuggestedPackages,
  suggestionProblem,
} from "./service-suggestions";

const answer = (packages: unknown[]) => JSON.stringify({ packages });

describe("suggestionProblem", () => {
  it("accepts plain descriptions of the work", () => {
    expect(suggestionProblem("Interior vacuum, wipe-down of surfaces and glass.", 260)).toBeNull();
  });

  it("refuses figures, prices, guarantees and credentials", () => {
    expect(suggestionProblem("Two hours of work", 260)).toMatch(/claim/);
    expect(suggestionProblem("Done the same day", 260)).toMatch(/claim/);
    expect(suggestionProblem("Same-day service", 260)).toMatch(/claim/);
    expect(suggestionProblem("From $99", 260)).toMatch(/figure/);
    expect(suggestionProblem("A 20% deeper clean", 260)).toMatch(/figure/);
    expect(suggestionProblem("Backed by our satisfaction guarantee", 260)).toMatch(/claim/);
    expect(suggestionProblem("Fully insured and licensed crew", 260)).toMatch(/claim/);
    expect(suggestionProblem("The best detail in town", 260)).toMatch(/claim/);
    expect(suggestionProblem("Award-winning finish", 260)).toMatch(/claim/);
  });

  it("refuses empty and over-long text", () => {
    expect(suggestionProblem("  ", 60)).toBe("empty");
    expect(suggestionProblem("x".repeat(61), 60)).toMatch(/longer/);
  });
});

describe("parseSuggestedPackages", () => {
  it("keeps clean suggestions and drops claim-making, figure-bearing and duplicate ones", () => {
    const result = parseSuggestedPackages(
      answer([
        { name: "Interior reset", description: "Vacuum, wipe-down and glass cleaning inside the cabin.", category: "Interior" },
        { name: "Exterior wash and wax", description: "Hand wash, dry and a protective wax coat.", category: "Exterior" },
        { name: "Premium detail", description: "Our best, award-winning detail.", category: "Full" },
        { name: "Express 60", description: "A quick clean.", category: "Quick" },
        { name: "FULL", description: "Everything.", category: "Full" },
      ]),
      ["Full"],
    );
    expect(result.map((item) => item.name)).toEqual(["Interior reset", "Exterior wash and wax"]);
  });

  it("never returns a price or duration field, and caps the list", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ name: `Package ${String.fromCharCode(65 + i)}`, description: "Plain scope of work.", price: 99, duration: 60 }));
    const result = parseSuggestedPackages(answer(rows), []);
    expect(result).toHaveLength(SUGGESTION_LIMITS.count);
    for (const item of result) expect(Object.keys(item).sort()).toEqual(["category", "description", "name"]);
  });

  it("returns nothing for unreadable answers", () => {
    expect(parseSuggestedPackages("sorry, I cannot", [])).toEqual([]);
    expect(parseSuggestedPackages("{not json}", [])).toEqual([]);
    expect(parseSuggestedPackages(JSON.stringify({ packages: "x" }), [])).toEqual([]);
  });

  it("reads JSON wrapped in other text", () => {
    const wrapped = `Here you go: ${answer([{ name: "Wheel and tyre care", description: "Wheels cleaned and tyres dressed.", category: "Exterior" }])} Done.`;
    expect(parseSuggestedPackages(wrapped, [])).toHaveLength(1);
  });
});

describe("menuNeedsHelp", () => {
  it("flags a thin menu or a service with no description", () => {
    expect(menuNeedsHelp([{ name: "Full", description: "All" }])).toBe(true);
    expect(menuNeedsHelp([{ name: "A", description: "x" }, { name: "B", description: "y" }, { name: "C", description: null }])).toBe(true);
    expect(menuNeedsHelp([{ name: "A", description: "x" }, { name: "B", description: "y" }, { name: "C", description: "z" }])).toBe(false);
  });
});

describe("buildSuggestionMessages", () => {
  it("forbids invented facts and lists what the owner already has", () => {
    const { system, user } = buildSuggestionMessages({ businessName: "Elite mobile detail", industry: "Auto Detailing", existing: [{ name: "Full", description: "All", price: 150 }] });
    expect(system).toMatch(/Never state or imply: a price, a duration/);
    expect(user).toContain("Elite mobile detail");
    expect(user).toContain("Full — All");
    expect(user).not.toContain("150");
  });
});
