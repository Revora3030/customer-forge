// The "pure" entry does not inject js.stripe.com on import; Stripe.js loads
// only when getStripe() is first called (i.e. when a checkout mounts). This
// keeps Stripe.js off pages that merely check isPaymentsConfigured().
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import { paymentsMode, paymentsPublishableKey } from "@/lib/payments-public-config";

type StripeEnv = "sandbox" | "live";

function paymentsEnvironment(): StripeEnv {
  const mode = paymentsMode();
  if (mode === "unconfigured") {
    throw new Error(
      "Card payments are not configured for this build. Finish payment go-live in your Revora project settings to enable production checkout.",
    );
  }
  return mode;
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(paymentsPublishableKey as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

export function isPaymentsConfigured(): boolean {
  return paymentsMode() !== "unconfigured";
}

export type { StripeEnv };
