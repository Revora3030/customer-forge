import { describe, expect, it, vi } from "vitest";
import { IMAGE_WITHOUT_MEDIA_PROBLEM, imageWithoutMediaFeedback, missingCompositionFeedback } from "./apply-plan";

const generateStructuredOutput = vi.fn();
vi.mock("@/lib/ai/router.server", () => ({ generateStructuredOutput, transcribeAudio: vi.fn() }));

const hero = { type: "add_section", pageId: "page-1", ref: "temp_hero", kind: "hero", heading: "A cleaner car." };
const composition = { type: "set_composition", sectionId: "temp_hero", tree: { version: 1, root: { type: "stack", children: [] } } };

describe("new content sections need the AI's own layout", () => {
  it("gives feedback for an add_section hero with no set_composition", () => {
    const feedback = missingCompositionFeedback([hero]);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ index: 0, type: "add_section", target: "temp_hero", reason: "needs_composition" });
  });

  it("gives none when the same ref gets a set_composition", () => {
    expect(missingCompositionFeedback([hero, composition])).toEqual([]);
    expect(missingCompositionFeedback({ actions: [hero, composition] })).toEqual([]);
  });

  it("ignores kinds that are not legacy content kinds (custom blocks, quote, booking)", () => {
    expect(missingCompositionFeedback([{ type: "add_section", pageId: "p", ref: "temp_c", kind: "custom" }])).toEqual([]);
  });
  it("returns invalid layout properties for AI repair instead of accepting a missing layout", () => {
    const feedback = missingCompositionFeedback([hero, { ...composition, tree: { version: 1, root: { type: "stack", style: { bgColor: "#000000" } } } }]);
    expect(feedback.some(item => item.reason === "invalid_composition")).toBe(true);
    expect(feedback.some(item => item.reason === "needs_composition")).toBe(true);
  });
});

describe("image items need a real picture", () => {
  it("rejects an image component without media", () => {
    const feedback = imageWithoutMediaFeedback([{ type: "add_component", sectionId: "s1", ref: "temp_img", kind: "image", label: "Wheel detail" }]);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.problem).toBe(IMAGE_WITHOUT_MEDIA_PROBLEM);
  });

  it("accepts an image component that gets a picture in the same plan", () => {
    expect(imageWithoutMediaFeedback([
      { type: "add_component", sectionId: "s1", ref: "temp_img", kind: "image" },
      { type: "generate_component_image", componentId: "temp_img", prompt: "p", alt: "a", mode: "create" },
    ])).toEqual([]);
  });

  it("rejects editing an existing image item that still has no picture", () => {
    const existing = new Map([["c1", { kind: "image", hasMedia: false }], ["c2", { kind: "image", hasMedia: true }]]);
    expect(imageWithoutMediaFeedback([{ type: "set_component", componentId: "c1", patch: { label: "x" } }], existing)).toHaveLength(1);
    expect(imageWithoutMediaFeedback([{ type: "set_component", componentId: "c2", patch: { label: "x" } }], existing)).toEqual([]);
  });
});

const context = {
  business: {
    name: "Test", industry: null, tagline: null, description: null, city: null, state: null, serviceArea: null,
    phone: null, email: null, yearsInBusiness: null, primaryColor: null, secondaryColor: null, accentColor: null,
    fontPreference: null, services: [], publishedReviewCount: 0, photoCount: 0,
  },
  pages: [],
  sectionKinds: [],
  pageKinds: [],
  componentKinds: [],
};

describe("site agent planner verification", () => {
  it("sends the feedback back on the same request and keeps the corrected plan", async () => {
    generateStructuredOutput.mockReset();
    generateStructuredOutput
      .mockResolvedValueOnce({ data: { reply: "r", actions: [hero] } })
      .mockResolvedValueOnce({ data: { reply: "r2", actions: [hero, composition] } });
    const { planChanges } = await import("@/lib/site-agent.server");
    const result = await planChanges(context, "rebuild the hero", [], [], { organizationId: "org-1", task: "site.plan" });
    expect(generateStructuredOutput).toHaveBeenCalledTimes(2);
    const callers = generateStructuredOutput.mock.calls.map((call) => call[0]);
    expect(callers[1]).toEqual(callers[0]);
    const feedbackTurn = JSON.stringify(generateStructuredOutput.mock.calls[1]?.[1]);
    expect(feedbackTurn).toContain("set_composition");
    expect(result["actions"]).toHaveLength(2);
    expect(result["skipped"]).toBeUndefined();
  });

  it("skips the step with reason needs_composition (never templated) when the planner still omits it", async () => {
    generateStructuredOutput.mockReset();
    const styled = { type: "set_block_style", target: "section", targetId: "temp_hero", device: "desktop", patch: { padTop: 40 } };
    const keep = { type: "set_section_text", sectionId: "s-1", field: "heading", value: "Hi" };
    generateStructuredOutput.mockResolvedValue({ data: { reply: "r", actions: [hero, styled, keep] } });
    const { planChanges } = await import("@/lib/site-agent.server");
    const result = await planChanges(context, "rebuild the hero", []);
    expect(result["actions"]).toEqual([keep]);
    expect(result["skipped"]).toEqual([{ type: "add_section", target: "temp_hero", reason: "needs_composition" }]);
  });
});
