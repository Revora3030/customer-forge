import { describe, expect, it } from "vitest";
import {
  candidateQuality,
  candidateScore,
  modelQualityWeight,
  qualityFirstOrder,
} from "@/lib/ai/orchestration/order";

describe("quality-first runtime ordering", () => {
  it("never puts a weaker free model ahead of a stronger paid one", () => {
    const ordered = qualityFirstOrder(
      [
        { id: "free-lite", model: "gemini-3.5-flash-lite", provider: "google", healthy: true, paid: false },
        { id: "specialist", model: "gpt-5.6-sol", provider: "openai", healthy: true, paid: true },
      ],
      (entry) => entry,
    );
    expect(ordered.map((entry) => entry.id)).toEqual(["specialist", "free-lite"]);
  });

  it("uses cost only to break an otherwise exact tie", () => {
    const free = candidateScore({ model: "llama-3.3-70b", provider: "groq", healthy: true, paid: false });
    const paid = candidateScore({ model: "llama-3.3-70b", provider: "openai", healthy: true, paid: true });
    expect(free).toBeGreaterThan(paid);
    // …and that whole advantage is smaller than one point of reliability.
    expect(free - paid).toBeLessThan(1e5);
  });

  it("ranks capability fit above everything else", () => {
    const ordered = qualityFirstOrder(
      [
        { id: "incapable-top", model: "gpt-5.6-sol", provider: "openai", healthy: true, paid: true, capable: false },
        { id: "capable-small", model: "gemma-3-4b", provider: "google", healthy: true, paid: false },
      ],
      (entry) => entry,
    );
    expect(ordered[0]?.id).toBe("capable-small");
  });

  it("prefers a healthy model over an unhealthy peer of equal quality", () => {
    const ordered = qualityFirstOrder(
      [
        { id: "sick", model: "qwen-32b", provider: "nvidia", healthy: false, paid: false },
        { id: "well", model: "qwen-32b", provider: "groq", healthy: true, paid: false },
      ],
      (entry) => entry,
    );
    expect(ordered[0]?.id).toBe("well");
  });

  it("is deterministic and stable for identical candidates", () => {
    const entries = [
      { id: "a", model: "qwen-32b", provider: "groq", healthy: true, paid: false },
      { id: "b", model: "qwen-32b", provider: "nvidia", healthy: true, paid: false },
    ];
    expect(qualityFirstOrder(entries, (entry) => entry).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("reads quality from the model id's size class, not marketing words", () => {
    expect(modelQualityWeight("llama-3.1-70b-instruct")).toBeGreaterThan(
      modelQualityWeight("llama-3.1-8b-instruct"),
    );
    expect(candidateQuality("gpt-5.6-sol")).toBe(98);
  });
});
