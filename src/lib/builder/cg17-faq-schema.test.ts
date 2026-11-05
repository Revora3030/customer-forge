/**
 * CG-17 (G-SGE-7): FAQ block + FAQPage JSON-LD for generated sites, checked
 * with New Bot 4's B13-6 validator (#563). FAQ answers come only from the
 * owner's facts or the owner's own words; nothing is invented.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emittedJsonLd } from "./jsonld-emitted";
import { faqFactsFor } from "./faq-from-facts";
import { validateJsonLd } from "./jsonld-validator";

const section = (items: { question: string; answer: string }[]) => ({
  settings: { composition: { version: 1, root: { type: "faq_accordion", faqItems: items } } },
});
const profile = { phone: "(919) 228-4417", address: "412 Oak Street", city: "Raleigh", state: "NC", zip: "27601", hours: "Mon–Sat 8am–6pm" };
const business = { name: "Harbor Plumbing", phone: profile.phone, street: profile.address, city: "Raleigh", state: "NC", zip: "27601" };
const services = [{ name: "Drain cleaning", price: 120 }];
const sections = [
  section([
    { question: "What are your hours?", answer: "" },
    { question: "Do you offer a warranty?", answer: "Yes, a lifetime warranty." },
    { question: "Where are you?", answer: "We're at 412 Oak Street in Raleigh." },
  ]),
];
const faqFacts = faqFactsFor({ businessName: "Harbor Plumbing", profile, services });
const emit = (withFacts: boolean) =>
  emittedJsonLd({ name: "Harbor Plumbing", url: "https://harbor.example", profile, services, sections, ...(withFacts ? { faqFacts } : {}) });
const faqDoc = (docs: unknown[]) => docs.find((d) => (d as { "@type"?: string })["@type"] === "FAQPage") as
  | { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
  | undefined;
const check = (docs: unknown[], visibleFaqs: { q: string; a: string }[]) =>
  validateJsonLd({ docs, business, serviceNames: ["Drain cleaning"], visibleFaqs, verifiedReviewCount: 0 });

describe("CG-17 FAQPage schema from grounded facts", () => {
  it("emits the fact-backed answer and the owner's supported answer, and validates clean", () => {
    const out = emit(true);
    const qa = faqDoc(out.docs)!.mainEntity.map((e) => [e.name, e.acceptedAnswer.text]);
    expect(qa).toContainEqual(["What are your hours?", expect.stringContaining("Mon–Sat 8am–6pm")]);
    expect(qa.map(([q]) => q)).toContain("Where are you?");
    expect(check(out.docs, out.visibleFaqs)).toEqual([]);
  });

  it("never publishes an invented answer (an unsupported warranty claim is dropped, not advertised)", () => {
    for (const withFacts of [true, false]) {
      expect(JSON.stringify(emit(withFacts).docs)).not.toMatch(/warranty/i);
    }
  });

  it("without facts the preflight missed the fact-answered question the published page shows (the old drift)", () => {
    const names = (withFacts: boolean) => (faqDoc(emit(withFacts).docs)?.mainEntity ?? []).map((e) => e.name);
    expect(names(true)).toContain("What are your hours?");
    expect(names(false)).not.toContain("What are your hours?");
  });

  it("no answered questions means no FAQPage at all", () => {
    const out = emittedJsonLd({ name: "Harbor Plumbing", url: "https://harbor.example", profile: {}, services: [], sections: [section([{ question: "Do you offer a warranty?", answer: "Yes." }])], faqFacts: faqFactsFor({ businessName: "Harbor Plumbing" }) });
    expect(faqDoc(out.docs)).toBeUndefined();
    expect(check(out.docs, out.visibleFaqs)).toEqual([]);
  });

  it("the owner's preflight passes the same grounded facts as the published head", () => {
    const page = readFileSync("src/routes/_authenticated/app.website.tsx", "utf8");
    const head = readFileSync("src/lib/site-head.ts", "utf8");
    expect(head).toMatch(/compositionFaqItems\(\s*sections[^,]*,\s*faqFactsFor\(/);
    expect(page).toMatch(/emittedJsonLd\(\{[\s\S]*?faqFacts: faqFactsFor\(\{[\s\S]*?generation: settings\?\.generation/);
  });
});
