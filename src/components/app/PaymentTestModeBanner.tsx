import { paymentsMode } from "@/lib/payments-public-config";

export function PaymentTestModeBanner() {
  const mode = paymentsMode();

  if (mode === "unconfigured") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-[12px] text-destructive">
        Live card checkout is not configured yet. Finish payment go-live in your Revora project to
        accept real payments.
      </div>
    );
  }

  if (mode === "sandbox") {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-[12px] text-primary">
        Test mode — payments made here are not real charges. Use card 4242 4242 4242 4242 to test
        checkout.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-elevated px-4 py-2 text-[12px] text-muted-foreground">
      Secure live checkout — your card is charged for real by Stripe. Setup is a one-time payment
      and the monthly plan starts after your free first month.
    </div>
  );
}
