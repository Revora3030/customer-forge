import { describe, expect, it } from "vitest";
import { buildPromptPack, monthKey, monthlyTrend, placePhrase, PROMPT_COUNT, tradePhrase } from "./ai-visibility";

describe("AI visibility prompt pack", () => {
  it("builds five prompts from the trade and city", () => {
    const pack = buildPromptPack({ industry: "Auto Detailing", city: "Raleigh", state: "nc", serviceArea: null })!;
    expect(pack).toHaveLength(PROMPT_COUNT);
    for (const p of pack) expect(p).toContain("auto detailing");
    for (const p of pack) expect(p).toContain("Raleigh, NC");
    expect(new Set(pack).size).toBe(PROMPT_COUNT);
  });
  it("falls back to the service area and never guesses a missing trade or place", () => {
    expect(placePhrase({ city: "", state: "TX", serviceArea: "Wake County" })).toBe("Wake County");
    expect(buildPromptPack({ industry: "Plumbing", city: null, state: null, serviceArea: null })).toBeNull();
    expect(buildPromptPack({ industry: null, city: "Durham", state: "NC", serviceArea: null })).toBeNull();
    expect(tradePhrase("Other")).toBeNull();
  });
  it("makes no ranking claims, prices or phone numbers", () => {
    const text = buildPromptPack({ industry: "HVAC", city: "Austin", state: "TX", serviceArea: null })!.join(" ");
    expect(text).not.toMatch(/\$|\d{3}[-. ]\d{3}[-. ]\d{4}|#1|rank/i);
  });
  it("keys months to the first day and counts only recorded answers", () => {
    expect(monthKey(new Date(2026, 10, 5))).toBe("2026-11-01");
    expect(monthlyTrend([
      { month: "2026-11-01", prompt_index: 0, mentioned: true },
      { month: "2026-10-01", prompt_index: 0, mentioned: false },
      { month: "2026-11-01", prompt_index: 1, mentioned: false },
    ])).toEqual([
      { month: "2026-10-01", mentioned: 0, checked: 1 },
      { month: "2026-11-01", mentioned: 1, checked: 2 },
    ]);
  });
});
