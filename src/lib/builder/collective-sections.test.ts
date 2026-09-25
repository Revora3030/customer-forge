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
  it("accepts truthful wording without a taste approval list", () => {
    const review = reviewSectionWording({
      proposal: {
        sections: [{ id: "s1", heading: "Mobile detailing that comes to your driveway" }],
      },
      facts,
      baseline,
    });
    expect(review.accepted).toEqual([
      { id: "s1", heading: "Mobile detailing that comes to your driveway" },
    ]);
  });

  it("keeps safe AI wording without reviewer creative veto", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "s2", heading: "Book your detail today" }] },
      facts,
      baseline,
    });
    expect(review.accepted).toEqual([{ id: "s2", heading: "Book your detail today" }]);
    expect(review.rejected).toEqual([]);
  });

  it("refuses an invented phone number", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "s1", heading: "Call 555 010 2030 now" }] },
      facts,
      baseline,
    });
    expect(review.accepted).toEqual([]);
    expect(review.rejected.some((entry) => entry.field === "s1.heading")).toBe(true);
  });

  it("refuses a section that is not part of the build", () => {
    const review = reviewSectionWording({
      proposal: { sections: [{ id: "ghost", heading: "Anything" }] },
      facts,
      baseline,
    });
    expect(review.accepted).toEqual([]);
  });

  it("keeps deterministic wording when the answer is unreadable", () => {
    expect(reviewSectionWording({ proposal: null, facts, baseline }).accepted).toEqual([]);
  });
});
