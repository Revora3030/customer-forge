import { describe, expect, it, vi } from "vitest";

const generateStructuredOutput = vi.fn();

vi.mock("@/lib/ai/router.server", () => ({
  generateStructuredOutput,
  transcribeAudio: vi.fn(),
}));

const context = {
  business: {
    name: "Test Business",
    industry: "cleaning",
    tagline: null,
    description: null,
    city: null,
    state: null,
    serviceArea: null,
    phone: null,
    email: null,
    yearsInBusiness: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    fontPreference: null,
    services: [],
    publishedReviewCount: 0,
    photoCount: 0,
  },
  pages: [],
  sectionKinds: [],
  pageKinds: [],
  componentKinds: [],
};

describe("site agent planner", () => {
  it("authors every request with the model team and never a rule-based plan", async () => {
    generateStructuredOutput.mockResolvedValue({
      data: {
        reply: "Updated the section.",
        summary: "Improve the section",
        actions: [
          { type: "set_section_text", sectionId: "section-1", field: "heading", value: "Better" },
        ],
      },
    });

    const { planChanges } = await import("./site-agent.server");
    const result = await planChanges(context, "make it better", []);

    expect(generateStructuredOutput).toHaveBeenCalled();
    expect(result["actions"]).toHaveLength(1);
    expect(result["reply"]).toBe("Updated the section.");
  }, 30_000);

  it.each(["Add ai pictures", "Change all pictures", "Create new photos"])(
    "routes plural picture request '%s' to the image-capable planner",
    async (instruction) => {
      generateStructuredOutput.mockResolvedValue({
        data: {
          reply: "Prepared real pictures.",
          actions: [{
            type: "generate_component_image",
            componentId: "component-1",
            prompt: "Editorial business photography for this exact website section",
            alt: "Business service photograph",
            mode: "create",
          }],
        },
      });

      const { planChanges } = await import("./site-agent.server");
      const result = await planChanges(context, instruction, []);

      expect(generateStructuredOutput).toHaveBeenCalled();
      expect(result["actions"]).toEqual([
        expect.objectContaining({ type: "generate_component_image" }),
      ]);
    },
  );
});
