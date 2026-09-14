/** Deterministic conversion strategy derived only from available site facts. */

export type ConversionBlueprint = {
  primaryOutcome: "leads" | "calls" | "bookings" | "sales" | "contact";
  sections: string[];
  ctaLabels: string[];
  objections: string[];
  mobileActions: string[];
};

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

export function conversionBlueprint(input: {
  instruction: string;
  hasPhone: boolean;
  hasEmail: boolean;
  hasBooking: boolean;
  hasServices: boolean;
  hasReviews: boolean;
}): ConversionBlueprint {
  const text = input.instruction.toLowerCase();
  const booking = includesAny(text, ["booking", "book", "appointment", "schedule"]);
  const calls = includesAny(text, ["call", "phone"]);
  const sales = includesAny(text, ["sell", "sales", "buy", "purchase"]);
  const primaryOutcome = booking && input.hasBooking
    ? "bookings"
    : calls && input.hasPhone
      ? "calls"
      : sales
        ? "sales"
        : input.hasEmail
          ? "leads"
          : "contact";

  const sections = ["hero"];
  if (input.hasServices) sections.push("services");
  if (input.hasReviews) sections.push("reviews");
  sections.push("faq", "cta");

  const ctaLabels = primaryOutcome === "bookings"
    ? ["Book Now", "Schedule Service"]
    : primaryOutcome === "calls"
      ? ["Call Now", "Get a Quote"]
      : primaryOutcome === "sales"
        ? ["Get Started", "Buy Now"]
        : primaryOutcome === "leads"
          ? ["Get Started", "Request Information"]
          : ["Contact Us", "Get Started"];

  const objections = [
    "What does this business offer?",
    "Why should I choose this business?",
    "What should I do next?",
  ];

  if (!input.hasServices) objections.push("Which services are available?");
  if (!input.hasReviews) objections.push("What proof or experience is available?");

  const mobileActions = primaryOutcome === "bookings"
    ? ["keep booking CTA visible", "shorten form friction"]
    : primaryOutcome === "calls" && input.hasPhone
      ? ["keep call CTA visible", "make tap target prominent"]
      : ["keep primary CTA visible", "reduce navigation friction"];

  return { primaryOutcome, sections: [...new Set(sections)], ctaLabels, objections, mobileActions };
}
