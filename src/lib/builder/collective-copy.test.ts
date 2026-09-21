import { describe, expect, it } from "vitest";
import {
  approvableFields,
  mergeRefinement,
  parseRefinement,
  parseReview,
  reviewRefinement,
  screenText,
} from "./collective-copy";
import type { DnaFacts } from "@/lib/business-dna";
import type { SiteCopy } from "@/lib/site-engine";

const facts: DnaFacts = {
  businessName: "Hop Hop Detail",
  industry: "mobile car detailing",
  services: ["Interior detail", "Exterior detail"],
  phone: "555-0100",
  email: "hello@hophop.example",
  city: "Austin",
  hasPrices: false,
  testimonialCount: 0,
};

const baseline: SiteCopy = {
  heroHeadline: "Mobile detailing in Austin",
  heroSubheadline: "We come to you.",
  primaryCta: "Get a quote",
  secondaryCta: "Call us",
  intro: "Interior and exterior detailing.",
  benefits: ["We come to you", "Interior and exterior"],
  serviceCards: [
    { name: "Interior detail", copy: "Seats and carpets." },
    { name: "Exterior detail", copy: "Wash and wax." },
  ],
  faqs: [{ question: "Do you travel?", answer: "Yes." }],
  areaCopy: "Austin and nearby.",
  about: "A detailing business in Austin.",
  metaTitle: "Hop Hop Detail",
  metaDescription: "Mobile detailing in Austin.",
  ogTitle: "Hop Hop Detail",
  ogDescription: "Mobile detailing in Austin.",
};

describe("parseRefinement", () => {
  it("reads a fenced JSON answer", () => {
    expect(parseRefinement('```json\n{"heroHeadline":"Hi"}\n```')).toEqual({ heroHeadline: "Hi" });
  });
  it("returns null for prose", () => {
    expect(parseRefinement("I cannot help with that.")).toBeNull();
  });
  it("returns null for a JSON array", () => {
    expect(parseRefinement("[1,2,3]")).toBeNull();
  });
});

describe("screenText", () => {
  it("rejects an invented phone number", () => {
    expect(screenText("Call 512 555 9182 today", facts, 200)).toContain("phone number");
  });
  it("allows the owner's own phone number", () => {
    expect(screenText("Call 555-0100 today", facts, 200)).toBeNull();
  });
  it("rejects an invented price", () => {
    expect(screenText("Details from $99", facts, 200)).toContain("price");
  });
  it("rejects an invented email", () => {
    expect(screenText("Write to sales@other.example", facts, 200)).toContain("email");
  });
  it("rejects an unsupported claim", () => {
    expect(screenText("Award-winning 5-star detailing", facts, 200)).toContain("unsupported");
  });
  it("rejects text past its ceiling", () => {
    expect(screenText("x".repeat(120), facts, 90)).toContain("longer than");
  });
});

describe("reviewRefinement", () => {
  it("accepts safe wording", () => {
    const review = reviewRefinement({
      proposal: { heroHeadline: "Austin detailing that comes to your driveway" },
      facts,
      baseline,
    });
    expect(review.accepted.heroHeadline).toBe("Austin detailing that comes to your driveway");
    expect(review.rejected).toHaveLength(0);
  });

  it("drops a field the reviewer did not approve", () => {
    const review = reviewRefinement({
      proposal: { heroHeadline: "New words here" },
      facts,
      baseline,
      approvedFields: ["about"],
    });
    expect(review.accepted.heroHeadline).toBeUndefined();
    expect(review.rejected[0]?.reason).toContain("not approved");
  });

  it("refuses renamed services", () => {
    const review = reviewRefinement({
      proposal: {
        serviceCards: [
          { name: "Premium interior", copy: "Seats." },
          { name: "Exterior detail", copy: "Wash." },
        ],
      },
      facts,
      baseline,
    });
    expect(review.accepted.serviceCards).toBeUndefined();
    expect(review.rejected[0]?.field).toBe("serviceCards");
  });

  it("refuses a dropped service", () => {
    const review = reviewRefinement({
      proposal: { serviceCards: [{ name: "Interior detail", copy: "Seats." }] },
      facts,
      baseline,
    });
    expect(review.rejected[0]?.reason).toContain("missing");
  });

  it("accepts improved service wording with locked names", () => {
    const review = reviewRefinement({
      proposal: {
        serviceCards: [
          { name: "Interior detail", copy: "Seats, carpets and glass, done at your kerb." },
          { name: "Exterior detail", copy: "Hand wash, decontamination and wax." },
        ],
      },
      facts,
      baseline,
    });
    expect(review.accepted.serviceCards).toHaveLength(2);
  });

  it("refuses an invented FAQ question", () => {
    const review = reviewRefinement({
      proposal: { faqs: [{ question: "Are you insured?", answer: "Yes." }] },
      facts,
      baseline,
    });
    expect(review.rejected[0]?.field).toBe("faqs");
  });

  it("reports an unreadable proposal without accepting anything", () => {
    const review = reviewRefinement({ proposal: null, facts, baseline });
    expect(review.accepted).toEqual({});
    expect(review.rejected[0]?.reason).toBe("unreadable answer");
  });

  it("never lets a model change the call to action", () => {
    const review = reviewRefinement({
      proposal: { primaryCta: "Buy now" },
      facts,
      baseline,
    });
    expect(Object.keys(review.accepted)).toHaveLength(0);
  });
});

describe("mergeRefinement", () => {
  it("applies accepted fields and leaves the rest untouched", () => {
    const merged = mergeRefinement(baseline, { heroHeadline: "New headline" });
    expect(merged.heroHeadline).toBe("New headline");
    expect(merged.primaryCta).toBe(baseline.primaryCta);
    expect(merged.serviceCards).not.toBe(baseline.serviceCards);
  });
  it("returns the deterministic copy unchanged when nothing was accepted", () => {
    expect(mergeRefinement(baseline, {})).toEqual(baseline);
  });
});

describe("review plumbing", () => {
  it("lists only refinable fields as approvable", () => {
    expect(approvableFields({ heroHeadline: "a", nonsense: "b" })).toEqual(["heroHeadline"]);
  });
  it("reads a reviewer answer", () => {
    const parsed = parseReview('{"approvedFields":["about"],"rejected":[{"field":"intro","reason":"vague"}]}');
    expect(parsed?.approvedFields).toEqual(["about"]);
    expect(parsed?.notes[0]?.reason).toBe("vague");
  });
  it("returns null when the reviewer did not answer in the agreed shape", () => {
    expect(parseReview("looks fine to me")).toBeNull();
  });
});
