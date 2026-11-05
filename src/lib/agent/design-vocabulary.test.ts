import { beforeEach, describe, expect, it, vi } from "vitest";

const callJson = vi.fn();
vi.mock("@/lib/site-agent.server", () => ({ callJson: (...args: unknown[]) => callJson(...args) }));

import { designDirection } from "@/lib/agent/design-brief.server";
import { DESIGN_VOCABULARY, designVocabularyBrief, unknownVocabularyPrimitives } from "@/lib/agent/design-vocabulary";

describe("design vocabulary (LPL-3)", () => {
  it("only names primitives the builder really has", () => {
    expect(unknownVocabularyPrimitives()).toEqual([]);
  });
  it("every available entry names at least one primitive; unavailable ones name none", () => {
    for (const entry of DESIGN_VOCABULARY) {
      if (entry.available) expect(entry.primitives.length, entry.name).toBeGreaterThan(0);
      else expect(entry.primitives, entry.name).toEqual([]);
    }
  });
  it("covers the names owners use", () => {
    const names = DESIGN_VOCABULARY.map((entry) => entry.name).join(" | ");
    for (const word of ["bento", "pricing", "stats", "logo", "timeline", "tabs", "FAQ", "before / after", "split", "testimonials"]) expect(names).toContain(word);
  });
  it("entries that show figures, logos, reviews, prices or pictures say which real facts they need", () => {
    for (const word of ["stats strip", "logo wall", "testimonials", "pricing tiers", "before / after"]) {
      const entry = DESIGN_VOCABULARY.find((item) => item.name.startsWith(word))!;
      expect(entry.needs, word).toBeTruthy();
    }
  });
  it("is framed as a vocabulary, not a template or a picker", () => {
    const brief = designVocabularyBrief();
    expect(brief).toMatch(/only when it fits THIS business/);
    expect(brief).toMatch(/not a template/);
    expect(brief).toMatch(/never required to use any of it/);
    expect(brief).toMatch(/rather than inventing them/);
  });
  it("tells the model what is not available instead of inventing primitives", () => {
    expect(designVocabularyBrief()).toMatch(/NOT AVAILABLE: breadcrumbs, pagination/);
  });
  it("never tells the model to type a price", () => {
    expect(designVocabularyBrief()).toMatch(/never type a price/);
  });
  it("renders only what it is given (no hidden entries)", () => {
    expect(designVocabularyBrief([])).not.toContain("- bento");
  });
});

describe("design stage prompt", () => {
  beforeEach(() => callJson.mockReset());
  it("includes the vocabulary in the system prompt and still keeps the model's own direction", async () => {
    callJson.mockResolvedValue({ goal: "Get calls", layout: "bento services", story: ["hero: outcome"] });
    const direction = await designDirection("make it bento", "bento look", "A detailer in Raleigh");
    const messages = callJson.mock.calls[0]![1] as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain("DESIGN VOCABULARY");
    expect(messages[0]!.content).toContain("bento grid");
    expect(messages[0]!.content).toContain("You are deciding taste");
    expect(direction.source).toBe("model");
    expect(direction.layout).toBe("bento services");
  });
  it("adds nothing to the owner's own messages", async () => {
    callJson.mockResolvedValue({ goal: "x" });
    await designDirection("make it bento", "g", "summary");
    const messages = callJson.mock.calls[0]![1] as Array<{ role: string; content: string }>;
    expect(messages.slice(1).some((message) => message.content.includes("DESIGN VOCABULARY"))).toBe(false);
  });
});
