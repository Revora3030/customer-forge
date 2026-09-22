import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoadingRows, Panel, Pill, SectionHeading, MetricCard } from "@/components/app/Bits";
import { getOfferConfig, listClients } from "@/lib/admin.functions";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { currency, number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({
    meta: [{ title: "Plans — Revora admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPlans,
});

function AdminPlans() {
  const clientsFn = useServerFn(listClients);
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => clientsFn({}) });
  const rows = clients.data ?? [];

  const paid = rows.filter((c) => Boolean(c.setup_paid_at) && c.subscription_state === "active");
  const awaiting = rows.filter(
    (c) => !c.is_demo && !(c.setup_paid_at && c.subscription_state === "active"),
  );
  const collected = rows.reduce((sum, c) => sum + Number(c.paid_total ?? 0), 0);
  const mrr = paid.length * GROWTH_SYSTEM.monthlyPrice;

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Offer" title="Revora Growth System" />

      {clients.isLoading ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Active subscribers" value={number(paid.length)} />
            <MetricCard label="Recurring revenue" value={`${currency(mrr)}/mo`} />
            <MetricCard label="Collected to date" value={currency(collected)} />
            <MetricCard label="Awaiting payment" value={number(awaiting.length)} />
          </div>

          <Panel className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-[15px] font-semibold">{GROWTH_SYSTEM.name}</p>
              <Pill tone="signal">Only offer</Pill>
            </div>
            <p className="text-[12px] text-muted-foreground">{GROWTH_SYSTEM.positioning}</p>
            <p className="font-display text-[24px] font-semibold">
              {currency(GROWTH_SYSTEM.setupPrice)}
              <span className="text-[12px] font-normal text-muted-foreground"> one-time setup</span>
            </p>
            <p className="font-display text-[20px] font-semibold">
              + {currency(GROWTH_SYSTEM.monthlyPrice)}
              <span className="text-[12px] font-normal text-muted-foreground">/month</span>
            </p>
            <ul className="space-y-1 border-t border-border pt-3 text-[12px] text-muted-foreground">
              {GROWTH_SYSTEM.includes.map((feature) => (
                <li key={feature}>· {feature}</li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Setup lookup key <code>{GROWTH_SYSTEM.setupPriceKey}</code> · monthly lookup key{" "}
              <code>{GROWTH_SYSTEM.monthlyPriceKey}</code>
            </p>
          </Panel>
        </>
      )}

      <PricingControls />

      <p className="text-[12px] text-muted-foreground">
        Every client is on this single offer. Payment state, renewal dates and collected revenue are
        synced from verified payment webhooks — see each client's detail page for their billing
        timeline.
      </p>
    </div>
  );
}

function PricingControls() {
  const configFn = useServerFn(getOfferConfig);
  const config = useQuery({ queryKey: ["admin", "offer-config"], queryFn: () => configFn({}) });

  return (
    <Panel className="space-y-4">
      <SectionHeading
        eyebrow="Canonical Revora offer"
        title="Locked — $750 setup + $100/month"
        action={<Pill tone="signal">Not editable</Pill>}
      />
      <p className="text-[12px] text-muted-foreground">
        Revora sells exactly one commercial offer. The amounts below are fixed in the platform
        itself, mirrored into the database and enforced again by the payment provider before any
        checkout opens. They cannot be changed from this dashboard.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="product-tile">
          <p className="font-display text-[22px] font-semibold">
            {currency(GROWTH_SYSTEM.setupPrice)}
          </p>
          <p className="text-[12px] text-muted-foreground">One-time setup, charged today</p>
        </div>
        <div className="product-tile">
          <p className="font-display text-[22px] font-semibold">
            {currency(GROWTH_SYSTEM.monthlyPrice)}
            <span className="text-[12px] font-normal text-muted-foreground">/month</span>
          </p>
          <p className="text-[12px] text-muted-foreground">
            First month free · {GROWTH_SYSTEM.trialDays}-day platform trial
          </p>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{GROWTH_SYSTEM.explainer}</p>

      {config.isLoading ? (
        <LoadingRows rows={2} />
      ) : config.data ? (
        <ul className="space-y-1 border-t border-border pt-3 text-[12px] text-muted-foreground">
          <li>
            Full-system free access at signup: {config.data.fullAccessDays} days · monthly fee
            trial: {config.data.trialDays} days
          </li>
          {config.data.environments.map((env) => (
            <li key={env.environment}>
              {env.environment === "live" ? "Live payments" : "Test payments"}:{" "}
              {env.reachable
                ? `${env.setupAmount === null ? "no setup price" : currency(env.setupAmount)} setup · ${
                    env.monthlyAmount === null
                      ? "no monthly price"
                      : `${currency(env.monthlyAmount)}/mo`
                  }${env.matchesOffer ? " — matches the offer" : " — does NOT match; checkout is blocked"}`
                : "not connected yet"}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
