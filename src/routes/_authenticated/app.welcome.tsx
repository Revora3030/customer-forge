import { useEffect } from "react";
import { trackConversion } from "@/lib/conversion";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, Clock, Headphones } from "lucide-react";
import { MetricCard, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useBillingState } from "@/lib/stripe.hooks";
import { useWorkspace } from "@/lib/use-tenant";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";
import { REVORA, revoraMailto, revoraTel } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/app/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to Revora — your system is being set up" },
      {
        name: "description",
        content:
          "Your Revora Growth System payment confirmation, subscription status and onboarding next steps.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WelcomePage,
});

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

function WelcomePage() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const { data: billing } = useBillingState(orgId);
  const subscription = billing?.subscription ?? null;
  const queryClient = useQueryClient();

  // Stripe returns here after checkout; refresh the verified server state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "complete") return;
    // Marketing telemetry only. Paid status comes exclusively from the
    // signature-verified Stripe webhook, never from this browser return.
    trackConversion("checkout_return");
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: ["billing_state", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["payments", orgId] });
    }
    window.history.replaceState(null, "", "/app/welcome");
  }, [orgId, queryClient]);

  const setupPaid = Boolean(billing?.setupPaid);
  const trialing = subscription?.status === "trialing";
  const trialEnd = subscription?.trial_ends_at ?? null;
  const subActive = Boolean(billing?.active);
  const steps = [
    { label: "Setup payment received", done: setupPaid },
    {
      label: trialing
        ? `${GROWTH_SYSTEM.trialDays}-day platform trial active`
        : "Monthly subscription active",
      done: subActive,
    },
    { label: "Business details completed", done: Boolean(org?.onboarding_completed) },
    { label: "Website generated and reviewed", done: false, link: "/app/website" as const },
  ];

  return (
    <div className="product-page">
      <div>
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold">
          {setupPaid && subActive
            ? "You're officially onboard with Revora."
            : "We're confirming your payment"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {setupPaid && subActive
            ? `Your ${usdExact(GROWTH_SYSTEM.setupPrice)} setup payment was received. Your ${GROWTH_SYSTEM.trialDays}-day ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month platform trial is active. ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month begins after the trial unless canceled.`
            : "Payment confirmation comes directly from our payment provider. If you just paid, this page updates within a few seconds — nothing is activated until the payment is verified."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Setup payment"
          value={setupPaid ? "Paid" : "Pending"}
          hint={`${usdExact(GROWTH_SYSTEM.setupPrice)} one-time`}
        />
        <MetricCard
          label="Subscription"
          value={subscription ? subscription.status.replace("_", " ") : "Not active"}
          hint={`${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month`}
        />
        <MetricCard
          label={trialing ? "Trial ends" : "Next billing date"}
          value={date(trialEnd ?? subscription?.current_period_end)}
          hint={
            trialing
              ? `First ${usdExact(GROWTH_SYSTEM.monthlyPrice)} charge on this date`
              : `Then ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month`
          }
        />

        <MetricCard
          label="Workspace"
          value={org?.name ?? "—"}
          hint={org?.slug ? `${org.slug}.revora.app` : ""}
        />
      </div>

      <Panel className="p-5">
        <SectionHeading eyebrow="Onboarding" title="Your next steps" />
        <ol className="mt-4 space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-[13px]">
              {step.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={step.done ? "" : "text-muted-foreground"}>{step.label}</span>
              {!step.done && step.link ? (
                <Button asChild variant="ghost" size="sm" className="ml-auto">
                  <Link to={step.link}>Open</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="signal" size="lg">
            <Link to="/app/website">
              Build my website <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/app">Go to my dashboard</Link>
          </Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="What's included" title={GROWTH_SYSTEM.name} />
        <ul className="mt-4 grid gap-1 text-[13px] text-muted-foreground sm:grid-cols-2">
          {GROWTH_SYSTEM.includes.map((feature) => (
            <li key={feature}>· {feature}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill tone="neutral">
            <Clock className="mr-1 inline size-3" /> Billed {usdExact(GROWTH_SYSTEM.monthlyPrice)}
            /month
          </Pill>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/billing">View billing</Link>
          </Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading eyebrow="Support" title="Talk to a human" />
        <p className="mt-3 text-[13px] text-muted-foreground">
          Setup questions, changes or anything else — reach us directly.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={revoraMailto("Revora onboarding")}>
              <Headphones className="size-4" /> {REVORA.email}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={revoraTel}>{REVORA.phoneDisplay}</a>
          </Button>
        </div>
      </Panel>
    </div>
  );
}
