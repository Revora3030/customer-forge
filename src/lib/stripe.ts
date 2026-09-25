import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

// Publishable key (safe to ship in client code). Hardcoded fallback because the env file is regenerated.
const REVORA_LIVE_PUBLISHABLE_KEY =
  "pk_live_51U9eAbJiPGcf7LJpskAB6TDwPybHMDCvfAmSNwkDzSTVlSAivXMrNrts84B1Y5oW2TKibe9SnnGjHoTVH5YUYrxr000fbRTnne";
const envToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;
const clientToken: string | undefined = envToken?.startsWith("pk_") ? envToken : REVORA_LIVE_PUBLISHABLE_KEY;

function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Card payments are not configured for this build. Finish payment go-live in your Revora project settings to enable production checkout.",
  );
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

export function isPaymentsConfigured(): boolean {
  return Boolean(clientToken?.startsWith("pk_test_") || clientToken?.startsWith("pk_live_"));
}

export type { StripeEnv };
