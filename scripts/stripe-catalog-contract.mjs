#!/usr/bin/env node
/**
 * Pre-deploy Stripe catalog contract.
 *
 * The commercial offer ($350 setup + $100/month) is immutable in code and the
 * checkout flow pins exact Stripe Product/Price ids per environment. This
 * script proves at deploy time that the LIVE Stripe objects still match the
 * pinned catalog and the canonical offer — if anyone edits prices, archives a
 * product or repoints a lookup key in the Stripe dashboard, the deploy fails
 * loudly instead of silently charging customers the wrong amount.
 *
 * Usage (run with bun — the repo is bun-based and the script imports the
 * TypeScript offer/catalog modules directly so it can never drift from them):
 *   STRIPE_SECRET_KEY=sk_live_... bun scripts/stripe-catalog-contract.mjs
 *   STRIPE_SECRET_KEY=sk_test_... bun scripts/stripe-catalog-contract.mjs --env=sandbox
 *
 * Exit 0 = catalog matches. Exit 1 = divergence (or missing key) with reason.
 */
import { DEFAULT_OFFER_RATES } from "../src/lib/offer.ts";
import { STRIPE_CATALOG, verifyGrowthCatalog } from "../src/lib/stripe-catalog.ts";

const envArg = process.argv.find((a) => a.startsWith("--env="));
const environment = envArg ? envArg.slice("--env=".length) : "live";
if (environment !== "live" && environment !== "sandbox") {
  console.error(`[stripe-catalog-contract] unknown env "${environment}" (expected live|sandbox)`);
  process.exit(1);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("[stripe-catalog-contract] STRIPE_SECRET_KEY is not set — refusing to deploy unverified.");
  process.exit(1);
}

const API = "https://api.stripe.com/v1";
const auth = { Authorization: `Bearer ${secretKey}` };

async function stripeGet(path) {
  const response = await fetch(`${API}${path}`, { headers: auth });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Stripe GET ${path} failed (${response.status}): ${body?.error?.message ?? "unknown error"}`,
    );
  }
  return body;
}

const catalog = STRIPE_CATALOG[environment];

const [setupPrice, monthlyPrice, setupProduct, monthlyProduct] = await Promise.all([
  stripeGet(`/prices/${catalog.setup.stripePriceId}`),
  stripeGet(`/prices/${catalog.monthly.stripePriceId}`),
  stripeGet(`/products/${catalog.setup.stripeProductId}`),
  stripeGet(`/products/${catalog.monthly.stripeProductId}`),
]);

const verdict = verifyGrowthCatalog({
  environment,
  setupPrice,
  monthlyPrice,
  setupProduct,
  monthlyProduct,
  rates: DEFAULT_OFFER_RATES,
});

if (!verdict.ok) {
  console.error(`[stripe-catalog-contract] FAILED (${environment}): ${verdict.reason}`);
  console.error(
    "[stripe-catalog-contract] The live Stripe catalog diverges from the pinned offer " +
      `($${DEFAULT_OFFER_RATES.setupPrice} setup + $${DEFAULT_OFFER_RATES.monthlyPrice}/month). ` +
      "Do not deploy until the Stripe dashboard matches src/lib/stripe-catalog.ts.",
  );
  process.exit(1);
}

console.log(
  `[stripe-catalog-contract] OK (${environment}): live Stripe catalog matches the pinned ` +
    `$${DEFAULT_OFFER_RATES.setupPrice} setup + $${DEFAULT_OFFER_RATES.monthlyPrice}/month offer.`,
);
