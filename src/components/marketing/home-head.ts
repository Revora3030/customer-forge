import { FAQ_ITEMS } from "@/components/marketing/FAQ";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { MARKETING_SEARCH, marketingSearchHead } from "@/lib/marketing-seo";
import { GROWTH_SYSTEM_SCHEMA, LOCAL_BUSINESS_SCHEMA, faqPageSchema, jsonLdScript } from "@/lib/seo";

const SETUP = usd(GROWTH_SYSTEM.setupPrice);

/** The homepage H1: what a local service business gets, with no numbers or promises. */
export const HOME_HEADLINE = "Your AI-built website, booking and customer follow-up in one system";

/**
 * Shown before the shared checkout disclosure, whose "charged today" means the
 * day you check out. Free access collects no card, so nothing can be charged
 * during it; the setup is billed on the first invoice of the launch checkout
 * (/get-started → "Pay $350 today" → GrowthSystemCheckout).
 */
export const HOME_TRIAL_CHARGE_NOTE = `Nothing is charged during your ${GROWTH_SYSTEM.fullAccessWindow} of free access. The ${SETUP} setup is charged when you choose to launch.`;

/**
 * The <head> of Revora's own marketing homepage. The FAQPage is generated from
 * the same FAQ_ITEMS the page renders, and the offer comes from the shared
 * Service schema (which reads its prices from offer.ts), so neither can drift.
 */
export function marketingHomeHead() {
  return {
    // Title, description, social tags and canonical come from the shared marketing SEO table.
    ...marketingSearchHead(MARKETING_SEARCH.home),
    scripts: [
      jsonLdScript(LOCAL_BUSINESS_SCHEMA),
      jsonLdScript(GROWTH_SYSTEM_SCHEMA),
      jsonLdScript(faqPageSchema(FAQ_ITEMS)),
    ],
  };
}
