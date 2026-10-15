import { createServerFn } from "@tanstack/react-start";
import { GROWTH_SYSTEM } from "@/lib/offer";

export type PublicOfferRates = {
  setupPrice: number;
  monthlyPrice: number;
  trialDays: number;
  fullAccessDays: number;
};

/**
 * The live offer rates the platform actually charges. Revora has exactly one
 * commercial offer and it is immutable: $750 one-time setup + $100/month with
 * the first month free. These values come from the canonical code-level offer,
 * never from a database row a client or admin could drift.
 */
export const getPublicOfferRates = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicOfferRates> => ({
    setupPrice: GROWTH_SYSTEM.setupPrice,
    monthlyPrice: GROWTH_SYSTEM.monthlyPrice,
    trialDays: GROWTH_SYSTEM.trialDays,
    fullAccessDays: GROWTH_SYSTEM.fullAccessTrialDays,
  }),
);
