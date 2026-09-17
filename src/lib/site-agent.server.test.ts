import { describe, expect, it, vi } from "vitest";

const buildAutonomousPlan = vi.fn();

vi.mock("@/lib/builder/autonomous-brain", () => ({
  buildAutonomousPlan,
}));

describe("site agent native planner handoff", () => {
  it("uses the autonomous brain before an external planner when native work is safe", async () => {
    buildAutonomousPlan.mockReturnValue({
      actions: [{ type: "set_section_text", sectionId: "section-1", field: "heading", value: "Better" }],
      requiresExternalReasoning: false,
      reply: "Updated the section.",
      summary: "Improve the section",
      questions: [],
      notes: [],
      trace: ["Autonomous Brain v2: compiled one bounded plan"],
    });

    const { planChanges } = await import("./site-agent.server");
    const result = await planChanges(
      {
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
      },
      "make it better",
      [],
    );

    expect(result["actions"]).toHaveLength(1);
    expect(result["reply"]).toBe("Updated the section.");
  });
});
