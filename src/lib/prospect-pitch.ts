/**
 * The text-only first email for pitch-first outreach: no demo site exists yet,
 * so it asks permission to build one. Deterministic on purpose (no AI call, no
 * invented figure): the only numbers are the typical entry-level tool prices in
 * software-savings.ts and the canonical offer. The sender footer and the
 * unsubscribe line are appended by the outreach backend, never here.
 */
import { GROWTH_SYSTEM } from "@/lib/offer";
import { typicalComparison } from "@/lib/software-savings";

const cleanName = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 80);

export function pitchOfferTerms(): string {
  return `If you decide to keep it, setup is $${GROWTH_SYSTEM.setupPrice} one time, the first month is free, then $${GROWTH_SYSTEM.monthlyPrice}/month. Nothing is charged unless you choose to sign up.`;
}

export function composePitchEmail(businessName: string): { subject: string; body: string } {
  const name = cleanName(businessName) || "your business";
  const { toolsMonthly } = typicalComparison();
  return {
    subject: `A quick question for ${name}`,
    body: [
      "Hello,",
      "",
      `Local service businesses often pay for several separate tools: a website, online scheduling, quote forms, lead tracking, email follow-up and review requests. At typical entry-level list prices those come to about $${toolsMonthly} a month, before any agency or freelancer.`,
      "",
      "Revora Growth Systems puts the website, lead capture, follow-up and bookings in one account. Those prices are typical list prices, not a quote for your business.",
      "",
      pitchOfferTerms(),
      "",
      `If you would like to see it, reply to this email and I will build a free private draft site for ${name} from your public business details. It stays private and you are not committed to anything.`,
    ].join("\n"),
  };
}
