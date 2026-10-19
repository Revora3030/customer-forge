import { describe, expect, it, vi } from "vitest";

const prompts: string[] = [];
vi.mock("@/lib/ai/hall-of-fame.server", () => ({
  callBestThinker: vi.fn(async (request: { user: string }) => {
    prompts.push(request.user);
    return { ok: false, reason: "provider_unavailable", detail: "test", wanted: "test-model" };
  }),
}));

import { refineSectionWordingWithCollective } from "./collective-sections.server";
import { legalPageFacts } from "./content-completeness";

describe("page facts reach only their own page", () => {
  it("gives the privacy page the real data-handling facts and no other page", async () => {
    prompts.length = 0;
    const facts = legalPageFacts({ businessName: "Elite Mobile Detail", email: "hello@elite.example", goals: ["quote"] });
    await refineSectionWordingWithCollective({
      organizationId: "org",
      facts: { businessName: "Elite Mobile Detail" } as never,
      sections: [
        { id: "p1", page: "privacy", kind: "composition", heading: "Privacy", subheading: null, body: null },
        { id: "a1", page: "about", kind: "composition", heading: "About", subheading: null, body: null },
      ],
      pageFacts: { privacy: facts },
    });
    const privacy = prompts.find((prompt) => prompt.includes('"p1"') || prompt.includes("p1"))!;
    const about = prompts.find((prompt) => prompt.includes("a1"))!;
    expect(privacy).toContain("PAGE FACTS");
    expect(privacy).toContain("The site's forms collect: name, phone, email, city, service wanted, message.");
    expect(privacy).toContain("hello@elite.example");
    expect(about).not.toContain("PAGE FACTS");
  });
});

describe("legalPageFacts", () => {
  it("adds booking fields only when booking is a goal and marks unknowns", () => {
    expect(legalPageFacts({ businessName: "A", email: null, goals: [] }).join(" ")).not.toContain("preferred date");
    const booked = legalPageFacts({ businessName: "A", email: null, goals: ["book"] });
    expect(booked[0]).toContain("preferred date, preferred time");
    expect(booked.some((line) => line.startsWith("Not known"))).toBe(true);
  });
});
