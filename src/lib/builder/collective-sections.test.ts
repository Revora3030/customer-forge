import { describe, expect, it } from "vitest";
import { reviewSectionWording, type SectionWording } from "./collective-sections.server";
import type { DnaFacts } from "@/lib/business-dna";

const facts: DnaFacts = {
  businessName: "Supreme Detailing",
  industry: "auto detailing",
  services: ["Full detail"],
  description: "Mobile auto detailing in Raleigh.",
  city: "Raleigh",
  region: "NC",
  serviceArea: "Raleigh",
  phone: "9843653695",
  email: null,
  yearsInBusiness: null,
  testimonialCount: 0,
  hasPrices: true,
  goals: ["enquiries"],
  hasHours: false,
} as unknown as DnaFacts;

const baseline: SectionWording[] = [
  { id: "s1", page: "home", kind: "hero", heading: "One clear service", subheading: "Full", body: null },
  { id: "s2", page: "home", kind: "cta", heading: "Next step", subheading: null, body: null },
];

describe("reviewSectionWording", () => {
  it("accepts stronger truthful wording for an approved section", () => {
    const review = reviewSectionWording({
      proposal: {
        sections: [{ id: "s1", heading: "Mobile detailing that comes to your driveway" }],
      },
      facts,
      baseline,
      approvedIds: ["s1"],
    });
    expect(review.accepted).toEqual([
      { id: "s1", heading: "Mobile detailing that comes to your driveway" },
    ]);
  });

  it("drops a section the reviewer did not approve", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "s2", heading: "Book your detail today" }] },
      facts,
      baseline,
      approvedIds: ["s1"],
    });
    expect(review.accepted).toEqual([]);
    expect(review.rejected[0]?.reason).toContain("not approved");
  });

  it("refuses an invented phone number", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "s1", heading: "Call 555 010 2030 now" }] },
      facts,
      baseline,
      approvedIds: ["s1"],
    });
    expect(review.accepted).toEqual([]);
    expect(review.rejected.some((entry) => entry.field === "s1.heading")).toBe(true);
  });

  it("refuses a section that is not part of the build", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "ghost", heading: "Anything" }] },
      facts,
      baseline,
      approvedIds: ["ghost"],
    });
    expect(review.accepted).toEqual([]);
  });

  it("keeps deterministic wording when the answer is unreadable", () => {
    expect(reviewSectionWording({ proposal: null, facts, baseline }).accepted).toEqual([]);
  });
});
