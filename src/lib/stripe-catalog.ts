/**
 * The exact Stripe catalog Revora is bound to.
 *
 * Lookup keys are convenient but transferable, so they are NOT sufficient on
 * their own: the server also pins the exact Stripe **Product ID** and **Price
 * ID** per environment and refuses to open a checkout session against anything
 * else. Nothing here may ever be influenced by the browser, by request input or
 * by a database row.
 *
 * Naming rules used across the payment code:
 *   • `stripeProductId`  — Stripe Product object id (`prod_…`)
 *   • `stripePriceId`    — Stripe Price object id (`price_…`)
 *   • `priceLookupKey`   — Stripe Price `lookup_key` (stable across envs)
 *   • `internalProductId`— row id in our own `payment_products` table
 */
import { DEFAULT_OFFER_RATES, type OfferRates, type PriceShape, verifyGrowthPrices } from "./offer";

export type StripeEnvName = "sandbox" | "live";

export type CatalogEntry = {
  readonly stripeProductId: string;
  readonly stripePriceId: string;
  readonly priceLookupKey: string;
  /** Stripe Tax product tax code expected on the product. */
  readonly taxCode: string;
};

export const SETUP_PRICE_LOOKUP_KEY = "revora_system_setup";
export const MONTHLY_PRICE_LOOKUP_KEY = "revora_system_monthly";

/** Stripe Tax: "Software as a service (SaaS) — business use". */
export const SAAS_TAX_CODE = "txcd_10103001";

export const STRIPE_CATALOG: Record<
  StripeEnvName,
  { readonly setup: CatalogEntry; readonly monthly: CatalogEntry }
> = Object.freeze({
  live: Object.freeze({
    setup: Object.freeze({
      stripeProductId: "prod_V9zmxmIK9gzVz2",
      stripePriceId: "price_1UHbVYJiPGcf7LJpNHniO2Zb",
      priceLookupKey: SETUP_PRICE_LOOKUP_KEY,
      taxCode: SAAS_TAX_CODE,
    }),
    monthly: Object.freeze({
      stripeProductId: "prod_V9zmDZI7XZZhxT",
      stripePriceId: "price_1UHbVXJiPGcf7LJppBjfJU0L",
      priceLookupKey: MONTHLY_PRICE_LOOKUP_KEY,
      taxCode: SAAS_TAX_CODE,
    }),
  }),
  sandbox: Object.freeze({
    setup: Object.freeze({
      stripeProductId: "prod_V9zH61PKXQmCxN",
      stripePriceId: "price_1U9tZNPYftBUdyaNrUMTkDf7",
      priceLookupKey: SETUP_PRICE_LOOKUP_KEY,
      taxCode: SAAS_TAX_CODE,
    }),
    monthly: Object.freeze({
      stripeProductId: "prod_V9zHnbKX00HKg5",
      stripePriceId: "price_1U9tZiPYftBUdyaNW2QFW2YP",
      priceLookupKey: MONTHLY_PRICE_LOOKUP_KEY,
      taxCode: SAAS_TAX_CODE,
    }),
  }),
});

export type ProductShape =
  | { id?: string | null | undefined; active?: boolean | null | undefined; tax_code?: unknown }
  | null
  | undefined;

export type CatalogVerification = { ok: true } | { ok: false; reason: string };

const productIdOf = (price: PriceShape): string | null => {
  const raw = (price as { product?: unknown } | null)?.product;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const id = (raw as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
};

/**
 * Verifies the two live Stripe objects against the pinned catalog AND the
 * canonical offer amounts. Returns a customer-safe reason on failure.
 */
export function verifyGrowthCatalog(input: {
  environment: StripeEnvName;
  setupPrice: PriceShape;
  monthlyPrice: PriceShape;
  setupProduct?: ProductShape;
  monthlyProduct?: ProductShape;
  rates?: OfferRates;
}): CatalogVerification {
  const expected = STRIPE_CATALOG[input.environment];
  if (!expected) return { ok: false, reason: "Unknown payment environment." };

  // Amounts, currency, billing type and active state.
  const amounts = verifyGrowthPrices(
    input.setupPrice,
    input.monthlyPrice,
    input.rates ?? DEFAULT_OFFER_RATES,
  );
  if (!amounts.ok) return amounts;

  const pairs: Array<{
    label: string;
    entry: CatalogEntry;
    price: PriceShape;
    product: ProductShape;
  }> = [
    {
      label: "The one-time setup",
      entry: expected.setup,
      price: input.setupPrice,
      product: input.setupProduct,
    },
    {
      label: "The monthly subscription",
      entry: expected.monthly,
      price: input.monthlyPrice,
      product: input.monthlyProduct,
    },
  ];

  for (const { label, entry, price, product } of pairs) {
    if (price?.id !== entry.stripePriceId)
      return { ok: false, reason: `${label} price does not match the Revora price on file.` };
    if ((price?.lookup_key ?? "").trim() !== entry.priceLookupKey)
      return { ok: false, reason: `${label} price has the wrong lookup key.` };
    const linkedProduct = productIdOf(price);
    if (linkedProduct && linkedProduct !== entry.stripeProductId)
      return { ok: false, reason: `${label} price belongs to a different product.` };
    if (product !== undefined) {
      if (product?.id !== entry.stripeProductId)
        return { ok: false, reason: `${label} product does not match the Revora product on file.` };
      if (product?.active === false)
        return { ok: false, reason: `${label} product is archived in the payment provider.` };
      // Tax category must match the pinned SaaS code when one is set, otherwise
      // tax would be calculated against the wrong product category.
      const taxCode =
        typeof product?.tax_code === "string"
          ? product.tax_code
          : ((product?.tax_code as { id?: unknown } | null)?.id ?? null);
      if (typeof taxCode === "string" && taxCode !== entry.taxCode)
        return { ok: false, reason: `${label} product has the wrong tax category.` };
    }
  }

  return { ok: true };
}
