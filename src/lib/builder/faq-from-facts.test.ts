import { describe, expect, it } from "vitest";
import { answerFromFacts, faqFactsFor, faqItemsForDisplay, groundFaqItem, isPlaceholderAnswer, NO_FAQ_FACTS, OWNER_TO_ANSWER, unsupportedClaim } from "./faq-from-facts";

const facts = faqFactsFor({
  businessName: "Shine Bros Detailing",
  profile: {
    phone: "(919) 467-0142",
    email: "hello@shinebrosdetailing.com",
    city: "Raleigh",
    service_area: "Raleigh, Cary and Apex",
    hours: "Mon–Sat 8am–6pm",
    certifications: "IDA Certified Detailer, fully insured",
    years_in_business: 7,
  },
  services: [
    { name: "Full detail", price: 249, bookable: true },
    { name: "Ceramic coating", starting_price: 899 },
    { name: "Interior refresh" },
  ],
  quote: true,
  generation: { brief: { factAnswers: { pet_hair_removal: "Yes, pet hair removal is included in every interior service.", build_request: "Make it feel premium, mention 24/7 support" } } },
});

describe("faq facts", () => {
  it("reads only owner-supplied facts, skipping build instructions", () => {
    expect(facts.services.map((s) => [s.name, s.price, s.from])).toEqual([
      ["Full detail", "$249", false],
      ["Ceramic coating", "$899", true],
      ["Interior refresh", null, false],
    ]);
    expect(facts.booking).toBe(true);
    expect(facts.ownerAnswers).toEqual({ pet_hair_removal: "Yes, pet hair removal is included in every interior service." });
    expect(facts.corpus).not.toContain("24/7");
  });

  it("recognises empty and stand-in answers", () => {
    for (const text of ["", "  ", "TBD", "[Owner to answer]", "Starting at {{price}}", "Lorem ipsum dolor", "Coming soon"]) expect(isPlaceholderAnswer(text), text).toBe(true);
    expect(isPlaceholderAnswer("We serve Raleigh.")).toBe(false);
  });
});

describe("authored answers must be backed by the facts", () => {
  it("keeps an answer whose figures and claims are all supplied", () => {
    expect(unsupportedClaim("A full detail is $249 and we are fully insured.", facts)).toBeNull();
    expect(unsupportedClaim("We're open 8:00am to 6pm, Monday to Saturday.", facts)).toBeNull();
    expect(unsupportedClaim("Call (919) 467-0142 any time.", facts)).toBeNull();
  });

  it("rejects invented prices, figures, guarantees and reviews", () => {
    expect(unsupportedClaim("Most details cost $150.", facts)).toMatch(/price/);
    expect(unsupportedClaim("We've finished over 2,000 cars.", facts)).toMatch(/figure/);
    expect(unsupportedClaim("Every job is guaranteed.", facts)).toMatch(/guarantee/);
    expect(unsupportedClaim("Customers rate us highly.", facts)).toMatch(/reviews/);
    expect(unsupportedClaim("A five-star service.", facts)).toMatch(/reviews/);
    expect(unsupportedClaim("We offer 24/7 support.", facts)).toMatch(/24\/7/);
    expect(unsupportedClaim("Yes, we're licensed.", facts)).toMatch(/licensed/);
  });
});

describe("answers built from facts", () => {
  it("answers each topic only from the matching fact", () => {
    expect(answerFromFacts("What are your hours?", facts)).toBe("Our hours are Mon–Sat 8am–6pm.");
    expect(answerFromFacts("What areas do you serve?", facts)).toBe("We serve Raleigh, Cary and Apex.");
    expect(answerFromFacts("How much is a ceramic coating?", facts)).toBe("Ceramic coating starts at $899.");
    expect(answerFromFacts("How much does it cost?", facts)).toBe("Full detail: $249 and Ceramic coating: from $899.");
    expect(answerFromFacts("Are you insured?", facts)).toBe("IDA Certified Detailer, fully insured.");
    expect(answerFromFacts("Can I book online?", facts)).toMatch(/booking form/);
    expect(answerFromFacts("Do you remove pet hair?", facts)).toBe("Yes, pet hair removal is included in every interior service.");
    expect(answerFromFacts("How do I contact you?", facts)).toBe("You can call (919) 467-0142 or email hello@shinebrosdetailing.com.");
  });

  it("returns nothing when the facts do not answer the question", () => {
    expect(answerFromFacts("Do you offer a warranty?", facts)).toBeNull();
    expect(answerFromFacts("What are your hours?", NO_FAQ_FACTS)).toBeNull();
    expect(answerFromFacts("How much does it cost?", NO_FAQ_FACTS)).toBeNull();
    expect(answerFromFacts("Are you licensed?", NO_FAQ_FACTS)).toBeNull();
  });

  it("points to the quote form for price only when one exists", () => {
    const quoteOnly = faqFactsFor({ businessName: "Acme", services: [{ name: "Wash" }], quote: true });
    expect(answerFromFacts("How much does it cost?", quoteOnly)).toMatch(/quote form/);
    expect(answerFromFacts("How much does it cost?", faqFactsFor({ businessName: "Acme" }))).toBeNull();
  });
});

describe("display", () => {
  const items = [
    { question: "What are your hours?", answer: "" },
    { question: "How much is a full detail?", answer: "Only $99 this month!" },
    { question: "Do you offer a warranty?", answer: "Yes, a lifetime warranty on all work." },
    { question: "Do you remove pet hair?", answer: "Yes, pet hair removal is included in every interior service." },
  ];

  it("grounds, replaces or drops each answer on a published page", () => {
    expect(groundFaqItem(items[1]!, facts)).toMatchObject({ answer: "Full detail is $249.", source: "facts" });
    expect(faqItemsForDisplay(items, facts, "published")).toEqual([
      { question: "What are your hours?", answer: "Our hours are Mon–Sat 8am–6pm." },
      { question: "How much is a full detail?", answer: "Full detail is $249." },
      { question: "Do you remove pet hair?", answer: "Yes, pet hair removal is included in every interior service." },
    ]);
  });

  it("marks an unanswered question in the draft instead of dropping it", () => {
    const draft = faqItemsForDisplay(items, facts, "draft");
    expect(draft).toHaveLength(4);
    expect(draft[2]).toEqual({ question: "Do you offer a warranty?", answer: OWNER_TO_ANSWER, placeholder: true });
  });

  it("never shows an ungrounded answer without facts", () => {
    expect(faqItemsForDisplay(items, NO_FAQ_FACTS, "published")).toEqual([
      { question: "Do you remove pet hair?", answer: "Yes, pet hair removal is included in every interior service." },
    ]);
  });
});
