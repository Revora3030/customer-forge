/**
 * Revora's single commercial offer. Every price shown or charged anywhere in
 * the application derives from this module — there is exactly one offer:
 * $350 one-time setup + $100/month.
 */

/**
 * THE single source of truth for the no-card, full-access free trial at
 * signup, in days. Owner rule: 3 days. Every trial label, email, prompt, test
 * and server-side trial stamp derives from this number (see `src/lib/trial.ts`).
 * The database mirrors it in migration 20261004090000 (column default,
 * `provision_workspace_server` and `offer_config.full_access_days`); change both
 * together and never hard-code a trial length in copy.
 */
export const FULL_ACCESS_TRIAL_DAYS: number = 3;

const fullAccessWindowLabel = `${FULL_ACCESS_TRIAL_DAYS} ${FULL_ACCESS_TRIAL_DAYS === 1 ? "day" : "days"}`;

export const GROWTH_SYSTEM = {
  planId: "revora_growth_system",
  name: "Revora Growth System",
  setupProductId: "revora_growth_system_setup",
  setupPrice: 350,
  monthlyPrice: 100,
  /** Stripe lookup keys (stable across test and live). */
  setupPriceKey: "revora_system_setup",
  monthlyPriceKey: "revora_system_monthly",
  headline: "Launch Your Revora Growth System",
  positioning:
    "A complete done-for-you customer acquisition and growth system for local businesses — built, launched and managed for you.",
  setupLabel: "One-time implementation and customization.",
  monthlyLabel:
    "Ongoing platform, automation, support, hosting/system management, and growth services.",
  /**
   * Length of the free FIRST MONTH of the $100/month plan, in days. It only
   * starts once the $350 setup is paid (Stripe `trial_period_days` on the
   * monthly subscription). It is not a no-card trial — that is the separate
   * `fullAccessTrialDays` window at signup. Customer copy should say
   * `firstMonthFree`, never "30-day trial".
   */
  trialDays: 30,
  /** Truthful wording for the paid plan's free first month. */
  firstMonthFree: "first month free (30 days after $350 setup)",
  /** Length of the full-system free access window at signup, in days. */
  fullAccessTrialDays: FULL_ACCESS_TRIAL_DAYS,
  /** Human-readable full-access window, e.g. "3 days". */
  fullAccessWindow: fullAccessWindowLabel,
  /** Adjective form for prose, e.g. "3-day". */
  fullAccessWindowAdjective: `${FULL_ACCESS_TRIAL_DAYS}-day`,
  /** Uppercase variant for badges/CTAs, e.g. "3 DAYS". */
  fullAccessWindowUpper: fullAccessWindowLabel.toUpperCase(),
  trialBadge: "FIRST MONTH FREE",
  ctaPrimary: "START MY REVORA SYSTEM — $350 SETUP",
  ctaSecondary:
    "$350 one-time setup + first month free + $100/month from month two. Cancel anytime. No hidden fees.",
  ctaShort: "START MY REVORA SYSTEM",
  /** The single secondary CTA label used site-wide. */
  ctaDemo: "SEE REVORA IN ACTION",

  /** The single canonical offer sentence. Use this verbatim wherever the offer is explained. */
  explainer:
    "$350 one-time setup, charged today. Your first month of the $100/month platform fee is FREE — your first monthly payment is charged 30 days later (month two) and continues at $100/month unless canceled.",
  setupIncludes: [
    "Custom website",
    "Domain setup",
    "CRM configuration",
    "Lead capture",
    "Quote system",
    "Booking system",
    "Automated follow-up",
    "Local SEO foundation",
    "Analytics setup",
    "System configuration",
    "Launch",
  ],
  monthlyIncludes: [
    "Platform access",
    "Hosting/system management",
    "Automation",
    "Maintenance",
    "Website updates",
    "Technical support",
    "Reporting",
    "Ongoing optimization",
  ],
  includes: [
    "Professional business website",
    "Custom domain connection/setup",
    "Lead capture system",
    "CRM",
    "Online booking",
    "Quote/request system",
    "Automated lead follow-up",
    "Customer notifications",
    "Review/reputation automation",
    "Local SEO foundation",
    "Analytics and reporting",
    "AI-powered business tools",
    "Ongoing website/system updates",
    "Technical support",
  ],
} as const;

export const usd = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

export const usdExact = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

/* ---------------------------------------------------------------------------
 * Stripe price verification
 *
 * The checkout session must never be created against a price that disagrees
 * with the published offer. A mis-set price in the payment provider would
 * silently charge the customer the wrong amount, so the server verifies the
 * live Price objects against GROWTH_SYSTEM before any session is opened.
 * ------------------------------------------------------------------------- */

/** The subset of a Stripe Price the verifier reads. */
export type PriceShape =
  | {
      id?: string | null;
      lookup_key?: string | null;
      active?: boolean | null;
      currency?: string | null;
      unit_amount?: number | null;
      type?: string | null;
      recurring?: { interval?: string | null; interval_count?: number | null } | null;
    }
  | null
  | undefined;

export type PriceVerification = { ok: true } | { ok: false; reason: string };

const money = (cents: number) => usd(cents / 100);

/**
 * The rates Revora charges. Immutable: there is exactly one offer and it is
 * not configurable from the admin dashboard, the database or the browser.
 */
export type OfferRates = { readonly setupPrice: number; readonly monthlyPrice: number };

export const DEFAULT_OFFER_RATES: OfferRates = Object.freeze({
  setupPrice: GROWTH_SYSTEM.setupPrice,
  monthlyPrice: GROWTH_SYSTEM.monthlyPrice,
});

/** Alias that reads as what it is: the one canonical offer. */
export const CANONICAL_OFFER_RATES = DEFAULT_OFFER_RATES;

/**
 * Verifies the two Revora prices against the offer that is actually configured:
 * currency, exact amount, one-time vs monthly recurring, and active state.
 * Returns a customer-safe reason on failure — never a raw provider payload.
 */
export function verifyGrowthPrices(
  setup: PriceShape,
  monthly: PriceShape,
  expected: OfferRates = DEFAULT_OFFER_RATES,
): PriceVerification {
  const check = (
    price: PriceShape,
    label: string,
    expectedDollars: number,
    recurring: boolean,
  ): string | null => {
    if (!price?.id) return `${label} price is not set up in the payment provider yet.`;
    if (price.active === false) return `${label} price is archived in the payment provider.`;
    if ((price.currency ?? "usd").toLowerCase() !== "usd")
      return `${label} price is not in US dollars.`;
    const cents = Math.round(expectedDollars * 100);
    if (price.unit_amount !== cents)
      return `${label} price is ${
        typeof price.unit_amount === "number" ? money(price.unit_amount) : "unset"
      } but the Revora offer is ${usd(expectedDollars)}.`;
    if (recurring) {
      if (price.type !== "recurring")
        return `${label} price is not a recurring subscription price.`;
      if (price.recurring?.interval !== "month" || (price.recurring?.interval_count ?? 1) !== 1)
        return `${label} price does not bill once per month.`;
    } else if (price.type === "recurring") {
      return `${label} price is recurring but the setup fee is charged once.`;
    }
    return null;
  };

  const reason =
    check(setup, "The one-time setup", expected.setupPrice, false) ??
    check(monthly, "The monthly subscription", expected.monthlyPrice, true);
  return reason ? { ok: false, reason } : { ok: true };
}
