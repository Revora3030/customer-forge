import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_FACT_CHOICES, factChoices } from "./fact-choices";

describe("factChoices (COMP-13)", () => {
  it("offers up to three service-area taps built from the owner's own city", () => {
    const choices = factChoices("service_area", { city: "  Raleigh " });
    expect(choices).toEqual(["Raleigh only", "Raleigh and nearby towns", "Within 25 miles of Raleigh"]);
    expect(choices.length).toBeLessThanOrEqual(MAX_FACT_CHOICES);
  });
  it("offers nothing when it would have to guess", () => {
    expect(factChoices("service_area", { city: "" })).toEqual([]);
    expect(factChoices("service_area", {})).toEqual([]);
    for (const key of ["phone", "email", "city", "hours", "description", "business-name"]) {
      expect(factChoices(key, { city: "Raleigh" })).toEqual([]);
    }
  });
  it("the chat shows the taps alongside Skip, and a tap goes through the normal answer path", () => {
    const chat = readFileSync("src/components/app/BuilderAssistant.tsx", "utf8");
    expect(chat).toContain('data-testid="builder-fact-choice"');
    expect(chat).toContain("onClick={() => send(choice)}");
    expect(chat).toContain("Skip for now");
  });
});
