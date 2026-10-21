import { describe, expect, it } from "vitest";
import { parseFirstBuildInstruction, withFirstBuildInstruction } from "./first-build-request";
import { readBrief } from "@/lib/site-brief";
import { websiteRequestInstruction } from "./website-request";

describe("owner website brief", () => {
  it("keeps the entire supported owner request across saved-brief parsing", () => {
    const brief = readBrief({ positioning: "Owner supplied business", factAnswers: { city: "Raleigh" } });
    if (!brief) throw new Error("Invalid fixture");
    const instruction = "x".repeat(1200);
    const saved = readBrief(withFirstBuildInstruction(brief, instruction));
    expect(saved?.factAnswers["build_request"]).toBe(instruction);
    expect(saved?.factAnswers["city"]).toBe("Raleigh");
  });
  it("rejects oversized requests instead of silently dropping owner preferences", () => {
    expect(() => parseFirstBuildInstruction("x".repeat(1201))).toThrow(/1,200/);
    expect(parseFirstBuildInstruction("  editorial site  ")).toBe("editorial site");
    expect(parseFirstBuildInstruction(undefined)).toBeNull();
  });
  it("preserves client facts and distinguishes the reference from business evidence", () => {
    const instruction = websiteRequestInstruction({ businessName: "Owner business", industry: "Plumbing", services: "Drain cleaning", serviceArea: "Raleigh", brandPreferences: "Editorial, green", referenceUrl: "https://example.com/design" });
    expect(instruction).toContain("Services: Drain cleaning");
    expect(instruction).toContain("Brand preferences: Editorial, green");
    expect(instruction).toContain("Design reference only (not business facts): https://example.com/design");
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "not a url"])("rejects unsafe or invalid reference %s", (referenceUrl) => {
    expect(() => websiteRequestInstruction({ businessName: "Business", industry: "", services: "Services", serviceArea: "", brandPreferences: "", referenceUrl })).toThrow(/https/);
  });
});