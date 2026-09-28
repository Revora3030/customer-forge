import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Layers, Rocket, Target, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

/** The single canonical offer summary line, used site-wide. */
export function OfferLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-muted-foreground ${className}`}>
      {GROWTH_SYSTEM.explainer}
    </p>
  );
}

export function TrialBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {GROWTH_SYSTEM.trialBadge}
    </span>
  );
}

/** Two visually distinct value blocks: one-time setup vs monthly management. */
export function ValueSplit() {
  return (
    <section className="mt-16" id="whats-included" aria-labelledby="whats-included-heading">
      <h2
        id="whats-included-heading"
        className="font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-semibold"
      >
        What you pay for, split clearly
      </h2>
      <div className="mt-6 grid items-stretch gap-4 md:grid-cols-2">
        <div className="panel card-lift flex h-full flex-col border-primary/35 p-6">
          <p className="eyebrow">One time</p>
          <h3 className="mt-2 font-display text-[19px] font-semibold">
            {usdExact(GROWTH_SYSTEM.setupPrice)} Launch &amp; Implementation
          </h3>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Charged today. This is the build — we do the work, you review and approve.
          </p>
          <ul className="mt-5 space-y-2.5">
            {GROWTH_SYSTEM.setupIncludes.map((item) => (
              <li key={item} className="flex gap-2 text-[13px] text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel card-lift flex h-full flex-col bg-card/40 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">Monthly</p>
            <TrialBadge />
          </div>
          <h3 className="mt-2 font-display text-[19px] font-semibold">
            {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month Growth &amp; Management
          </h3>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Free for your first {GROWTH_SYSTEM.trialDays} days, then{" "}
            {usdExact(GROWTH_SYSTEM.monthlyPrice)}/month unless canceled.
          </p>
          <ul className="mt-5 space-y-2.5">
            {GROWTH_SYSTEM.monthlyIncludes.map((item) => (
              <li key={item} className="flex gap-2 text-[13px] text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-[13px] font-medium text-foreground">
        Cancel anytime. No hidden fees.
      </p>
      <OfferLine className="mt-2 max-w-2xl" />
    </section>
  );
}

const WHY = [
  {
    icon: Wrench,
    title: "Done For You",
    body: "We build and configure the system instead of handing you software and leaving you to figure it out.",
  },
  {
    icon: Layers,
    title: "One Complete System",
    body: "Website, CRM, booking, quotes, follow-up, reviews, SEO and analytics work together.",
  },
  {
    icon: Target,
    title: "Built For Local Businesses",
    body: "Designed around how service businesses attract, convert and retain customers.",
  },
  {
    icon: Rocket,
    title: "Growth Focused",
    body: "We focus on leads, bookings and customer conversion — not vanity metrics.",
  },
] as const;

export function WhyRevora() {
  return (
    <section className="mt-16" id="why-revora" aria-labelledby="why-revora-heading">
      <p className="eyebrow">Why Revora</p>
      <h2
        id="why-revora-heading"
        className="mt-2 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-semibold"
      >
        Why businesses choose Revora
      </h2>
      <div className="mt-6 grid items-stretch gap-3 sm:grid-cols-2">
        {WHY.map(({ icon: Icon, title, body }) => (
          <div key={title} className="panel card-lift flex h-full flex-col p-6">
            <span className="grid size-9 place-items-center rounded-md border border-primary/35 bg-primary/10">
              <Icon className="size-4 text-primary" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-display text-[15px] font-semibold">{title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Start & onboard",
    body: `Pay the ${usdExact(GROWTH_SYSTEM.setupPrice)} setup and provide your business information.`,
  },
  { n: "02", title: "We build", body: "We customize your website and growth system." },
  {
    n: "03",
    title: "We configure",
    body: "CRM, booking, quotes, automation, analytics and SEO are connected.",
  },
  { n: "04", title: "We launch", body: "Your complete system goes live." },
  {
    n: "05",
    title: "We manage & grow",
    body: `Your first ${GROWTH_SYSTEM.trialDays} days of the monthly plan are free. After that, it continues at ${usdExact(GROWTH_SYSTEM.monthlyPrice)}/month unless you cancel.`,
  },
] as const;

export function AfterYouStart() {
  return (
    <section className="mt-16" id="after-you-start" aria-labelledby="after-you-start-heading">
      <p className="eyebrow">Process</p>
      <h2
        id="after-you-start-heading"
        className="mt-2 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-semibold"
      >
        What happens after you start
      </h2>
      <ol className="mt-6 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="panel card-lift flex h-full flex-col p-6">
            <span className="tnum font-display text-[13px] font-semibold tracking-[0.16em] text-primary">
              {step.n}
            </span>
            <h3 className="mt-3 font-display text-[15px] font-semibold">{step.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <Button asChild variant="signal" size="lg">
          <Link to="/get-started">{GROWTH_SYSTEM.ctaShort}</Link>
        </Button>
      </div>
    </section>
  );
}
