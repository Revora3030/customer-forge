import { useCallback, useMemo, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createGrowthSystemCheckout, type GrowthSystemIntake } from "@/lib/stripe.functions";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { trackConversion } from "@/lib/conversion";
import { REVORA, revoraMailto } from "@/lib/brand";

type Props = {
  organizationId: string;
  intake: GrowthSystemIntake;
  returnUrl?: string;
  onClose: () => void;
};

/** Secure embedded checkout for the single Revora offer: setup + monthly. */
export function GrowthSystemCheckout({ organizationId, intake, returnUrl, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    // No synchronous setState here: Stripe calls this while the provider is
    // still rendering, and updating state during render warns and can drop the
    // update. Errors are cleared by the retry button and set after the await.
    trackConversion("checkout_started", {
      email: intake.email,
      amountCents: GROWTH_SYSTEM.setupPrice * 100,
    });

    try {
      const result = await createGrowthSystemCheckout({
        data: {
          organizationId,
          intake,
          returnUrl:
            returnUrl ??
            `${window.location.origin}/app/welcome?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in result) throw new Error(result.error);
      if (!result.clientSecret)
        throw new Error("The payment provider did not return a checkout session.");
      return result.clientSecret;
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : "Checkout could not be started. Check your connection and try again.";
      setError(message);
      // Re-throw so the Stripe provider knows the attempt failed instead of
      // waiting on a secret that will never arrive.
      throw cause;
    }
  }, [organizationId, intake, returnUrl]);

  // `attempt` is deliberately a dependency: bumping it rebuilds the options object
  // so Stripe mounts a fresh checkout instead of reusing a dead client secret.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret, attempt]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h2 className="mt-1 font-display text-[18px] font-semibold">{GROWTH_SYSTEM.name}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Cards, Apple Pay, Google Pay and Cash App Pay appear where supported.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close checkout">
          <X className="size-4" />
        </Button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {usdExact(GROWTH_SYSTEM.setupPrice)} charged today. Then{" "}
        {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month after your first {GROWTH_SYSTEM.trialDays}{" "}
        days.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Want to look first? Open the{" "}
        <a
          className="text-primary hover:underline"
          href="/demo"
          target="_blank"
          rel="noopener noreferrer"
        >
          live demo
        </a>{" "}
        or a{" "}
        <a
          className="text-primary hover:underline"
          href="/s/elite-mobile-detailing"
          target="_blank"
          rel="noopener noreferrer"
        >
          sample client site
        </a>
        . Questions before you pay? Email{" "}
        <a className="text-primary hover:underline" href={revoraMailto("Question before checkout")}>
          {REVORA.email}
        </a>
        .
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-destructive">
                Checkout could not be started
              </p>
              <p className="mt-1 text-[12px] break-words text-destructive/90">{error}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
                <a
                  className="text-[12px] text-primary hover:underline"
                  href={revoraMailto("Revora checkout problem")}
                >
                  Contact {REVORA.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div id="checkout" className="mt-4">
        <EmbeddedCheckoutProvider key={attempt} stripe={getStripe()} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
