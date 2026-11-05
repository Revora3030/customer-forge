import { describe, expect, it } from "vitest";
import { fillFromSentence, impliedStylePickId, readOneSentence } from "./one-sentence";

describe("readOneSentence (CG-06)", () => {
  it("reads trade and place from the shortest form", () => {
    expect(readOneSentence("pressure washing in Raleigh")).toEqual({ businessType: "pressure washing", city: "Raleigh" });
  });
  it("reads a leading business name, trade, city and state", () => {
    expect(readOneSentence("Smith Roofing is a family roofing company in Austin, TX.")).toEqual({
      businessName: "Smith Roofing",
      businessType: "family roofing",
      city: "Austin",
      state: "TX",
    });
  });
  it("reads 'called' names and drops openers", () => {
    expect(readOneSentence("We run a mobile detailing business called Shine Squad in San Diego CA")).toEqual({
      businessName: "Shine Squad",
      businessType: "mobile detailing",
      city: "San Diego",
      state: "CA",
    });
  });
  it("invents nothing that isn't in the sentence", () => {
    expect(readOneSentence("I do landscaping")).toEqual({ businessType: "landscaping" });
    expect(readOneSentence("")).toEqual({});
    expect(readOneSentence("in Boise")).toEqual({ city: "Boise" });
  });
  it("does not treat 'I am' as a business name or a two-letter word as a state", () => {
    const facts = readOneSentence("I am a plumber in Mesa, ZZ");
    expect(facts.businessName).toBeUndefined();
    expect(facts.state).toBeUndefined();
    expect(facts.city).toBe("Mesa");
    expect(facts.businessType).toBe("plumber");
  });
});

describe("impliedStylePickId (CG-06 amendment)", () => {
  it("returns the one look the sentence implies", () => {
    expect(impliedStylePickId("High-end detailing for luxury cars in Miami")).toBe("dark-premium");
    expect(impliedStylePickId("A cozy family-run bakery")).toBe("warm-crafted");
  });
  it("asks as usual when no look or several looks are implied", () => {
    expect(impliedStylePickId("HVAC repair in Tulsa")).toBeNull();
    expect(impliedStylePickId("rustic but luxury cabins")).toBeNull();
    expect(impliedStylePickId(null)).toBeNull();
  });
});

describe("fillFromSentence", () => {
  it("fills only empty fields", () => {
    const current = { businessName: "Typed Name", businessType: "", city: " ", state: "" };
    expect(fillFromSentence(current, { businessName: "Other", businessType: "roofing", city: "Austin", state: "TX" })).toEqual({
      businessName: "Typed Name",
      businessType: "roofing",
      city: "Austin",
      state: "TX",
    });
  });
});

describe("CG-06 wiring", () => {
  it("get-started offers the one-sentence box and fills only empty fields", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/routes/get-started.tsx", "utf8");
    expect(page).toContain("Or describe your business in one sentence");
    expect(page).toContain("fillFromSentence(intake, facts)");
    expect(page).toContain("Just add:");
  });
  it("the wizard skips the look cards when the description already implies a look", async () => {
    const { readFileSync } = await import("node:fs");
    const wizard = readFileSync("src/components/app/BuilderWizard.tsx", "utf8");
    expect(wizard).toContain('impliedStylePickId(text(profile, "description"))');
    expect(wizard).toContain("impliedLook && !showAllLooks");
    expect(wizard).toContain("Show other looks");
  });
});
