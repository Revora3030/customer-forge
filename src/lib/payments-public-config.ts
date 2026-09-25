/**
 * PUBLIC payment configuration.
 *
 * Stripe publishable keys are designed to ship in browser code — they can only
 * create checkout sessions, never read or move money. The secret key lives only
 * in server configuration (STRIPE_SECRET_KEY) and is never imported here.
 *
 * The generated env file is rewritten by the platform, so the publishable key is
 * kept here as the stable source of truth and any valid env override wins.
 */
const REVORA_PUBLISHABLE_KEY =
  "pk_live_51U9eAbJiPGcf7LJpskAB6TDwPybHMDCvfAmSNwkDzSTVlSAivXMrNrts84B1Y5oW2TKibe9SnnGjHoTVH5YUYrxr000fbRTnne";

const envToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

/** The publishable key the browser should use, or undefined when unusable. */
export const paymentsPublishableKey: string | undefined =
  envToken && /^pk_(test|live)_/.test(envToken) ? envToken : REVORA_PUBLISHABLE_KEY;

export function paymentsMode(): "sandbox" | "live" | "unconfigured" {
  if (paymentsPublishableKey?.startsWith("pk_test_")) return "sandbox";
  if (paymentsPublishableKey?.startsWith("pk_live_")) return "live";
  return "unconfigured";
}
