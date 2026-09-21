import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard, ExternalLink, Receipt, Wallet } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { StripeServiceCheckout } from "@/components/app/StripeServiceCheckout";
import { PaymentTestModeBanner } from "@/components/app/PaymentTestModeBanner";
import { usePaymentProducts, usePayments, type PaymentProduct } from "@/lib/payments.hooks";
import { useBillingState } from "@/lib/stripe.hooks";
import { createBillingPortalSession } from "@/lib/stripe.functions";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { BUILDER_INCLUDED_DETAIL, BUILDER_INCLUDED_LABEL } from "@/lib/access-state";
import { useWorkspace } from "@/lib/use-tenant";
import { canManage } from "@/lib/use-tenant";
import { REVORA } from "@/lib/brand";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/ui/notify";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({
    meta: [
      { title: "Billing & payments — Revora" },
      {
        name: "description",
        content:
          "Your Revora plan, subscription and secure card, Apple Pay and Cash App Pay checkout.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const STATUS_LABEL: Record<string, string> = {
  created: "Started",
  pending: "Pending",
  approved: "Approved",
  completed: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  disputed: "Disputed",
};

function paymentReference(payment: { metadata: unknown }) {
  if (
    payment.metadata &&
    typeof payment.metadata === "object" &&
    !Array.isArray(payment.metadata)
  ) {
    const meta = payment.metadata as Record<string, unknown>;
    for (const key of ["stripe_payment_intent", "stripe_session_id", "stripe_id"]) {
      if (typeof meta[key] === "string") return meta[key] as string;
    }
  }
  return "—";
}

function BillingPage() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const manage = canManage(ws?.workspace?.role ?? "viewer");
  const { data: products, isLoading: loadingProducts } = usePaymentProducts();
  const { data: payments, isLoading: loadingPayments } = usePayments(orgId);
  const { data: billing } = useBillingState(orgId);
  const [cardService, setCardService] = useState<PaymentProduct | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const queryClient = useQueryClient();
  const cardsReady = isPaymentsConfigured();

  const rows = payments ?? [];
  const paid = rows.filter((p) => p.status === "completed");
  const paidTotal = paid.reduce((sum, p) => sum + Number(p.amount), 0);
  const pending = rows.filter((p) => p.status === "pending" || p.status === "approved").length;

  const services = (products ?? []).filter(
    (p) => p.kind !== "subscription" && p.id !== GROWTH_SYSTEM.setupProductId,
  );
  const subscription = billing?.subscription ?? null;
  const setupPaid = Boolean(billing?.setupPaid);

  // Stripe embedded checkout redirects here after a completed payment.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "complete") return;
    toast.success("Payment received — your service is being activated.");
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: ["payments", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["billing_state", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    }
    window.history.replaceState(null, "", "/app/billing");
    setCardService(null);
  }, [orgId, queryClient]);

  const openPortal = async () => {
    if (!orgId) return;
    setPortalBusy(true);
    try {
      const result = await createBillingPortalSession({
        data: {
          organizationId: orgId,
          returnUrl: `${window.location.origin}/app/billing`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Billing &amp; payments</p>
          <h1 className="mt-1 font-display text-[24px] font-semibold">Your plan and payments</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={subscription?.status === "active" ? "signal" : "neutral"}>
            {subscription ? subscription.status.replace("_", " ") : "No subscription"}
          </Pill>

          {/* Never claim card payments are live when checkout cannot take one. */}
          <Pill tone="neutral">
            {!cardsReady
              ? "Card payments unavailable"
              : `Card payments ${billing?.environment === "sandbox" ? "test" : "live"}`}
          </Pill>
        </div>
      </div>

      <PaymentTestModeBanner />

      {subscription?.status === "past_due" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <p className="font-medium">Your last payment did not go through.</p>
          <p className="mt-1">
            Update your card to keep your workspace active — access continues while Stripe retries
            the payment.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={openPortal}
            disabled={portalBusy || !manage}
          >
            <ExternalLink className="size-4" /> {portalBusy ? "Opening…" : "Update payment method"}
          </Button>
        </div>
      ) : null}

      {subscription?.cancel_at_period_end ? (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          Cancellation is scheduled. You keep full access until{" "}
          {subscription.current_period_end
            ? new Date(subscription.current_period_end).toLocaleDateString()
            : "the end of the paid period"}
          , then the workspace becomes read-only.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Your system"
          value={GROWTH_SYSTEM.name}
          hint={subscription?.status ?? org?.subscription_status ?? ""}
        />
        <MetricCard
          label="Setup fee"
          value={usdExact(GROWTH_SYSTEM.setupPrice)}
          hint={setupPaid ? "Paid" : "Due at checkout"}
        />

        <MetricCard
          label="Paid to date"
          value={money(paidTotal, "USD")}
          hint={`${paid.length} payment${paid.length === 1 ? "" : "s"}`}
        />
        <MetricCard
          label={
            subscription?.cancel_at_period_end
              ? "Access ends"
              : subscription?.status === "trialing"
                ? "Trial ends"
                : "Renews"
          }
          value={
            subscription?.status === "trialing" && subscription.trial_ends_at
              ? new Date(subscription.trial_ends_at).toLocaleDateString()
              : subscription?.current_period_end
                ? new Date(subscription.current_period_end).toLocaleDateString()
                : org?.trial_ends_at
                  ? new Date(org.trial_ends_at).toLocaleDateString()
                  : "—"
          }
          hint={subscription?.cancel_at_period_end ? "Cancellation scheduled" : "Next billing date"}
        />
      </div>

      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading eyebrow="Your system" title={GROWTH_SYSTEM.name} />
          {subscription?.provider_subscription_id ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openPortal}
              disabled={portalBusy || !manage}
            >
              <ExternalLink className="size-4" /> {portalBusy ? "Opening…" : "Manage subscription"}
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-4">
            <p className="text-[12px] text-muted-foreground">Setup</p>
            <p className="tnum mt-1 text-[22px] font-semibold">
              {usdExact(GROWTH_SYSTEM.setupPrice)}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{GROWTH_SYSTEM.setupLabel}</p>
            <Pill tone={setupPaid ? "signal" : "neutral"}>
              {setupPaid ? "Paid" : "Not paid yet"}
            </Pill>
          </div>
          <div className="rounded-md border border-primary/40 p-4">
            <p className="text-[12px] text-muted-foreground">Monthly</p>
            <p className="tnum mt-1 text-[22px] font-semibold">
              {usdExact(GROWTH_SYSTEM.monthlyPrice)}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{GROWTH_SYSTEM.monthlyLabel}</p>
            <Pill tone={billing?.active ? "signal" : "neutral"}>
              {subscription ? subscription.status.replace("_", " ") : "Not active"}
            </Pill>
          </div>
        </div>

        <ul className="mt-4 grid gap-1 text-[12px] text-muted-foreground sm:grid-cols-2">
          {GROWTH_SYSTEM.includes.map((feature) => (
            <li key={feature}>· {feature}</li>
          ))}
        </ul>

        {/* Builder usage is included with access: there is no credit or per-build charge. */}
        <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-[12.5px]">
          <span className="font-medium text-gold">{BUILDER_INCLUDED_LABEL}.</span>{" "}
          <span className="text-muted-foreground">{BUILDER_INCLUDED_DETAIL}</span>
        </p>

        {!cardsReady ? (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            Card checkout is not configured for this build yet, so no payment can be taken.
          </p>
        ) : billing?.active && subscription?.provider_subscription_id ? (
          <p className="mt-4 text-[12px] text-muted-foreground">
            Your system is active. Update your card, view invoices or cancel from Manage
            subscription — access continues until the end of the paid period.
          </p>
        ) : (
          <>
            <Button
              asChild
              variant="signal"
              size="lg"
              className="mt-4 w-full sm:w-auto"
              disabled={!manage}
            >
              <Link to="/get-started">
                <CreditCard className="size-4" /> {GROWTH_SYSTEM.ctaPrimary}
              </Link>
            </Button>
            <p className="mt-2 text-[12px] text-muted-foreground">{GROWTH_SYSTEM.ctaSecondary}</p>
          </>
        )}
        <p className="mt-4 text-[12px] text-muted-foreground">
          Checkout accepts cards, Apple Pay, Google Pay and Cash App Pay where the provider and your
          device support them. {GROWTH_SYSTEM.explainer}
        </p>
      </Panel>

      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading eyebrow="Payment methods" title="Saved cards & wallets" />
          {subscription?.provider_customer_id ? (
            <Button
              variant="outline"
              size="sm"
              onClick={openPortal}
              disabled={portalBusy || !manage}
            >
              <Wallet className="size-4" /> {portalBusy ? "Opening…" : "Manage payment methods"}
            </Button>
          ) : null}
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {subscription?.provider_customer_id
            ? "Your cards are stored securely by our payment provider — Revora never sees or stores card numbers. Add, remove or set a default card, and manage Apple Pay / Cash App Pay from the secure billing portal."
            : "A saved payment method is added automatically the first time you subscribe or pay by card. Cards, Apple Pay, Google Pay and Cash App Pay are supported where your device and the provider support them."}
        </p>
      </Panel>

      {cardService && orgId ? (
        <StripeServiceCheckout
          organizationId={orgId}
          product={cardService}
          onClose={() => {
            setCardService(null);
            void queryClient.invalidateQueries({ queryKey: ["payments", orgId] });
          }}
        />
      ) : null}

      {services.length > 0 ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="Services" title="Revora services" />
          {loadingProducts ? (
            <LoadingRows rows={3} />
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {services.map((product) => (
                <li key={product.id} className="rounded-md border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-medium">{product.name}</p>
                      {product.description ? (
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {product.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="tnum text-[15px] font-semibold">
                      {money(product.amount, product.currency)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="signal"
                      size="sm"
                      disabled={!manage || !cardsReady}
                      onClick={() => setCardService(product)}
                    >
                      <CreditCard className="size-4" /> Pay by card
                    </Button>
                  </div>
                  {!cardsReady ? (
                    <p className="mt-2 text-[11px] text-destructive">
                      Card checkout is not configured for this build yet.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <Panel className="p-5">
        <SectionHeading eyebrow="Support" title="Billing questions" />
        <p className="mt-3 text-[13px] text-muted-foreground">
          One-off services above are charged once by card. Software plans are billed as a
          subscription and can be changed or cancelled at any time. Questions: {REVORA.email} ·{" "}
          {REVORA.phoneDisplay ?? REVORA.phone}
        </p>
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="History" title="Payment history" />
        {loadingPayments ? (
          <LoadingRows rows={3} />
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="No payments yet."
              description="When you pay for a Revora service, the confirmed transaction appears here."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Service</th>
                  <th className="pb-2 pr-3">Amount</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Provider</th>
                  <th className="pb-2">Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {new Date(payment.completed_at ?? payment.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-3">
                      {payment.description ?? payment.product_id ?? "Revora service"}
                    </td>
                    <td className="tnum py-2.5 pr-3">
                      {money(Number(payment.amount), payment.currency)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Pill tone={payment.status === "completed" ? "signal" : "neutral"}>
                        {STATUS_LABEL[payment.status] ?? payment.status}
                      </Pill>
                    </td>
                    <td className="py-2.5 pr-3 capitalize">{payment.payment_provider}</td>
                    <td className="py-2.5 font-mono text-[11px]">{paymentReference(payment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
