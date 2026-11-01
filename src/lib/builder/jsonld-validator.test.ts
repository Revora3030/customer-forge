import { describe, expect, it } from "vitest";
import type { FAQPage, Plumber, WithContext } from "schema-dts";
import { validateJsonLd, type JsonLdFacts } from "./jsonld-validator";
import { emittedJsonLd } from "./jsonld-emitted";
import { preflight, type PreflightInput } from "@/lib/preflight";

const business: JsonLdFacts["business"] = {
  name: "Harbor Plumbing",
  phone: "(919) 228-4417",
  street: "412 Oak Street",
  city: "Raleigh",
  state: "NC",
  zip: "27601",
};

const localBusiness: WithContext<Plumber> = {
  "@context": "https://schema.org",
  "@type": "Plumber",
  name: "Harbor Plumbing",
  telephone: "919-228-4417",
  address: {
    "@type": "PostalAddress",
    streetAddress: "412 Oak Street",
    addressLocality: "Raleigh",
    addressRegion: "NC",
    postalCode: "27601",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Services",
    itemListElement: [{ "@type": "Offer", itemOffered: { "@type": "Service", name: "Drain cleaning" } }],
  },
};

const faq: WithContext<FAQPage> = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "Do you offer weekend service?", acceptedAnswer: { "@type": "Answer", text: "Yes, Saturdays 8 to 2." } },
    { "@type": "Question", name: "Are you insured?", acceptedAnswer: { "@type": "Answer", text: "Fully insured." } },
  ],
};

const base: JsonLdFacts = {
  docs: [localBusiness, faq],
  business,
  serviceNames: ["Drain cleaning"],
  visibleFaqs: [
    { q: "Do you offer weekend service?", a: "Yes, Saturdays 8 to 2." },
    { q: "Are you insured?", a: "Fully insured." },
  ],
  verifiedReviewCount: 0,
};

const withBusiness = (patch: Record<string, unknown>): JsonLdFacts => ({
  ...base,
  docs: [{ ...(localBusiness as unknown as Record<string, unknown>), ...patch }, faq],
});

describe("validateJsonLd", () => {
  it("passes when the markup matches the intake facts and the visible FAQ", () => {
    expect(validateJsonLd(base)).toEqual([]);
  });

  it("accepts the same phone in another format and a +1 prefix", () => {
    expect(validateJsonLd(withBusiness({ telephone: "+1 (919) 228 4417" }))).toEqual([]);
  });

  it("names a business name mismatch", () => {
    const [f] = validateJsonLd(withBusiness({ name: "Harbour Plumbing Co" }));
    expect(f?.code).toBe("business_name_mismatch");
    expect(f?.message).toBe('Plumber name is "Harbour Plumbing Co" but your business name is "Harbor Plumbing".');
  });

  it("names a phone mismatch and a phone with no intake phone", () => {
    const [f] = validateJsonLd(withBusiness({ telephone: "919-555-0100" }));
    expect(f?.message).toBe('Plumber telephone is "919-555-0100" but your phone number is "(919) 228-4417".');
    const none = validateJsonLd({ ...withBusiness({ telephone: "919-228-4417" }), business: { ...business, phone: null } });
    expect(none[0]?.message).toContain("have no phone number");
  });

  it("names each address field that differs", () => {
    const found = validateJsonLd(
      withBusiness({
        address: { "@type": "PostalAddress", streetAddress: "9 Elm Road", addressLocality: "Raleigh", addressRegion: "NC", postalCode: "27609" },
      }),
    );
    expect(found.map((f) => f.message)).toEqual([
      'Plumber street address is "9 Elm Road" but your business details say "412 Oak Street".',
      'Plumber ZIP code is "27609" but your business details say "27601".',
    ]);
  });

  it("flags a Service that is not one of the owner's services", () => {
    const found = validateJsonLd({ ...base, serviceNames: ["Water heater repair"] });
    expect(found.map((f) => f.code)).toEqual(["service_name_mismatch"]);
    expect(found[0]?.message).toContain('"Drain cleaning"');
  });

  it("flags FAQ entries that are not on the page, differ, or are missing from the markup", () => {
    const found = validateJsonLd({
      ...base,
      visibleFaqs: [
        { q: "Do you offer weekend service?", a: "Yes, every day." },
        { q: "Do you give free quotes?", a: "Yes." },
      ],
    });
    expect(found.map((f) => f.code)).toEqual(["faq_answer_mismatch", "faq_not_on_page", "faq_missing_from_schema"]);
    expect(found[1]?.message).toBe('FAQ question "Are you insured?" is in the structured data but not on the page.');
    expect(found[2]?.message).toBe('FAQ question "Do you give free quotes?" is on the page but not in the structured data.');
  });

  it("ignores case, spacing and tags when matching FAQ text", () => {
    expect(
      validateJsonLd({
        ...base,
        visibleFaqs: [
          { q: "  do you offer   WEEKEND service? ", a: "<p>Yes, Saturdays 8 to 2.</p>" },
          { q: "Are you insured?", a: "Fully insured." },
        ],
      }),
    ).toEqual([]);
  });

  it("does not demand a FAQ entry the scrub dropped for a placeholder phone", () => {
    expect(
      validateJsonLd({
        ...base,
        visibleFaqs: [...base.visibleFaqs, { q: "Call us?", a: "Call 555-123-4567" }],
      }),
    ).toEqual([]);
  });

  it("rejects review and rating markup without verified reviews, once", () => {
    const rated = {
      ...localBusiness,
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.9, reviewCount: 120 },
      review: [{ "@type": "Review", reviewRating: { "@type": "Rating", ratingValue: 5 } }],
    };
    const found = validateJsonLd({ ...base, docs: [rated, faq] });
    expect(found.map((f) => f.code)).toEqual(["review_schema_unverified"]);
  });

  it("allows rating markup backed by verified reviews but not a larger count", () => {
    const rated = { ...localBusiness, aggregateRating: { "@type": "AggregateRating", ratingValue: 4.9, reviewCount: 12 } };
    expect(validateJsonLd({ ...base, docs: [rated, faq], verifiedReviewCount: 12 })).toEqual([]);
    const found = validateJsonLd({ ...base, docs: [rated, faq], verifiedReviewCount: 5 });
    expect(found.map((f) => f.code)).toEqual(["review_count_exceeds_verified"]);
    expect(found[0]?.message).toBe("Structured data claims 12 reviews but you have 5 verified.");
  });

  it("reads @graph wrappers", () => {
    const found = validateJsonLd({ ...base, docs: [{ "@context": "https://schema.org", "@graph": [{ ...localBusiness, telephone: "919-555-0100" }] }] });
    expect(found[0]?.code).toBe("business_phone_mismatch");
  });
});

describe("what the site really emits", () => {
  const section = (items: { question: string; answer: string }[]) => ({
    settings: {
      composition: {
        version: 1,
        root: { type: "faq_accordion", faqItems: items },
      },
    },
  });
  const profile = { phone: "(919) 228-4417", address: "412 Oak Street", city: "Raleigh", state: "NC", zip: "27601" };
  const emitted = emittedJsonLd({
    name: "Harbor Plumbing",
    url: "https://harbor.example",
    industry: "plumber",
    profile,
    services: [{ name: "Drain cleaning", price: 120 }],
    sections: [section([{ question: "Are you insured?", answer: "Fully insured." }])],
  });

  it("builds docs from the real emitters and they validate clean (and never carry ratings)", () => {
    expect(JSON.stringify(emitted.docs)).not.toMatch(/aggregateRating|"Review"|ratingValue/);
    expect(
      validateJsonLd({
        docs: emitted.docs,
        business,
        serviceNames: ["Drain cleaning"],
        visibleFaqs: emitted.visibleFaqs,
        verifiedReviewCount: 0,
      }),
    ).toEqual([]);
  });

  it("catches a phone that drifted from the intake facts", () => {
    const found = validateJsonLd({
      docs: emitted.docs,
      business: { ...business, phone: "(919) 000-1111" },
      serviceNames: ["Drain cleaning"],
      visibleFaqs: emitted.visibleFaqs,
      verifiedReviewCount: 0,
    });
    expect(found.map((f) => f.code)).toEqual(["business_phone_mismatch"]);
  });
});

describe("publish warning in Pre-Flight", () => {
  const input = (jsonLd: JsonLdFacts | null): PreflightInput => ({
    pages: [],
    businessName: "Harbor Plumbing",
    phone: "(919) 228-4417",
    email: null,
    city: "Raleigh",
    serviceArea: null,
    description: null,
    hasHours: false,
    servicesCount: 1,
    pricedServicesCount: 0,
    bookableCount: 0,
    quoteFormCount: 0,
    quoteQuestionCount: null,
    mediaCount: 0,
    analyticsConfigured: false,
    notifiesOwner: false,
    followUpAutomations: 0,
    seoTitle: "t",
    seoDescription: "d",
    publicHost: null,
    httpsVerified: false,
    canPublish: true,
    jsonLd,
  });
  const find = (jsonLd: JsonLdFacts | null) =>
    preflight(input(jsonLd)).checks.find((c) => c.key === "structured-data");

  it("is absent when no structured data was built", () => {
    expect(find(null)).toBeUndefined();
  });

  it("passes when everything matches", () => {
    expect(find(base)?.status).toBe("pass");
  });

  it("warns, naming the mismatch, and never blocks publishing", () => {
    const check = find(withBusiness({ telephone: "919-555-0100" }));
    expect(check?.status).toBe("warn");
    expect(check?.severity).toBe("warning");
    expect(check?.detail).toContain('telephone is "919-555-0100" but your phone number is "(919) 228-4417"');
    expect(preflight(input(withBusiness({ telephone: "919-555-0100" }))).blockers.some((b) => b.key === "structured-data")).toBe(false);
  });
});
