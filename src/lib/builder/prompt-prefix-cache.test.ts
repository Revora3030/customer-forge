/**
 * OpenAI-family models on the Lovable gateway cache a prompt prefix
 * automatically once it is ≥1,024 tokens and byte-identical. These lock the
 * builder's big system prompts into that shape and the cache-hit logging.
 */
import { describe, expect, it } from "vitest";
import { PLANNER_STATIC_PREFIX, plannerSystemPrompt } from "@/lib/builder/ai-agent-plan.server";
import { FIRST_BUILD_RULES } from "@/lib/builder/first-build-compositions.server";
import { designGuidancePrompt } from "@/lib/builder/design-guidance";

/**
 * Conservative token estimate for English prompt text: real BPE tokenizers
 * average ~4 chars/token on prose like this; 4.5 under-counts on purpose so
 * the ≥1,024 assertion cannot pass on an optimistic estimate.
 */
const tokensAtLeast = (text: string) => Math.floor(text.length / 4.5);

describe("static cache prefix", () => {
  it("the edit planner's static prefix is ≥1,024 tokens and comes first", () => {
    expect(tokensAtLeast(PLANNER_STATIC_PREFIX)).toBeGreaterThanOrEqual(1024);
    // ~6k tokens today (rules + checklist + static action contract); guard against it silently shrinking.
    expect(tokensAtLeast(PLANNER_STATIC_PREFIX)).toBeGreaterThanOrEqual(4096);
  });

  it("is byte-identical across businesses: only the tail varies", () => {
    const a = plannerSystemPrompt(designGuidancePrompt("roofing", "Summit Roofing", "Slate and tile roofs"));
    const b = plannerSystemPrompt(designGuidancePrompt("med_spa", "Glow Aesthetics", null));
    expect(a.startsWith(`${PLANNER_STATIC_PREFIX}\n\n`)).toBe(true);
    expect(b.startsWith(`${PLANNER_STATIC_PREFIX}\n\n`)).toBe(true);
    expect(a).not.toBe(b);
    let common = 0;
    while (common < a.length && a[common] === b[common]) common++;
    expect(common).toBeGreaterThanOrEqual(PLANNER_STATIC_PREFIX.length);
  });

  it("carries the whole static action contract, leaving only site-specific limits for the user message", () => {
    expect(PLANNER_STATIC_PREFIX).toContain("Action is one of:");
    expect(PLANNER_STATIC_PREFIX).toContain('"type":"set_composition"');
    expect(PLANNER_STATIC_PREFIX).toContain("Style keys:");
    expect(PLANNER_STATIC_PREFIX).not.toContain("Allowed section kinds");
    expect(PLANNER_STATIC_PREFIX).not.toContain("BUTTONS AND LINKS");
  });

  it("holds nothing that changes per call (no dates, ids or business data)", () => {
    expect(PLANNER_STATIC_PREFIX).not.toMatch(/\b20\d\d-\d\d-\d\d|[0-9a-f]{8}-[0-9a-f]{4}-|Summit|Glow/);
    expect(PLANNER_STATIC_PREFIX).toBe(PLANNER_STATIC_PREFIX.normalize("NFC"));
  });

  it("the first-build composition rules (sent as the whole system prompt) are static and ≥1,024 tokens", () => {
    expect(typeof FIRST_BUILD_RULES).toBe("string");
    expect(tokensAtLeast(FIRST_BUILD_RULES)).toBeGreaterThanOrEqual(1024);
  });
});
