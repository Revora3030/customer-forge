import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Pill } from "@/components/app/Bits";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { useExperiment } from "@/lib/experiments.hooks";
import { START_FREE_COPY } from "@/lib/experiments";
import { trackConversion } from "@/lib/conversion";

/** The single destination for "try it free": create an account, then continue to setup. */
export const FREE_ACCESS_TO = "/auth" as const;
export const FREE_ACCESS_SEARCH = { mode: "signup", redirect: "/get-started" } as const;
export const FREE_ACCESS_LABEL = `TRY ${GROWTH_SYSTEM.fullAccessTrialDays} DAYS FREE — FULL ACCESS`;

/** Primary "try the free access" button. Used in the hero, pricing and closing CTA. */
export function FreeAccessButton({
  className = "",
  label,
  size = "lg",
}: {
  className?: string;
  label?: string;
  size?: "sm" | "lg" | "default";
}) {
  // A/B test the primary button copy. An explicit label always wins.
  const variant = useExperiment("start_free_copy");
  const tested =
    variant === "trial_days" ? FREE_ACCESS_LABEL : (START_FREE_COPY[variant] ?? FREE_ACCESS_LABEL);
  const text = label ?? tested;

  return (
    <Button
      asChild
      variant="signal"
      size={size}
      className={`h-auto py-3 text-center leading-snug whitespace-normal ${className}`}
    >
      <Link
        to={FREE_ACCESS_TO}
        search={FREE_ACCESS_SEARCH}
        onClick={() =>
          trackConversion("cta_click", {
            metadata: { location: "free_access_button", copy: variant },
          })
        }
      >
        <Sparkles className="size-4" aria-hidden="true" />
        {text}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}

/** Compact gold banner that tells visitors the free access exists and how to get it. */
export function FreeAccessBanner({ className = "" }: { className?: string }) {
  return (
    // Container query, not a viewport query: this banner is reused inside narrow
    // pricing columns, where a viewport-width row layout cramped the text.
    <div
      className={`gold-glow @container flex flex-col gap-3 rounded-lg border border-primary/35 bg-primary/5 p-4 @md:flex-row @md:items-center @md:justify-between ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] leading-snug">
          <span className="gold-hl">
            Full system access. Zero risk. {GROWTH_SYSTEM.fullAccessTrialDays} days.
          </span>{" "}
          If it doesn't pay for itself, walk away — no card, no charge, no hard feelings.
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          After your free days:{" "}
          <span className="gold-hl">{usd(GROWTH_SYSTEM.setupPrice)} one-time setup</span>, then your{" "}
          <span className="gold-hl">first month is free</span> before{" "}
          {usd(GROWTH_SYSTEM.monthlyPrice)}/month. Cancel anytime.
        </p>
      </div>
      <FreeAccessButton size="sm" className="shrink-0 sm:w-auto" label="START FREE ACCESS" />
    </div>
  );
}

const FREE_STEPS = [
  {
    title: "Create your account",
    body: "Email or Google. No card required to start exploring your workspace.",
  },
  {
    title: "Tell us about your business",
    body: "One short guided form. Your answers auto-fill your site, CRM, quotes and booking.",
  },
  {
    title: "Explore every feature free",
    body: `Full access for ${GROWTH_SYSTEM.fullAccessTrialDays} days — website builder, leads, quotes, bookings, automations and analytics.`,
  },
  {
    title: "Launch when you're ready",
    body: `${usd(GROWTH_SYSTEM.setupPrice)} setup starts your build. First month of the ${usd(GROWTH_SYSTEM.monthlyPrice)}/month fee is free.`,
  },
];

/** Guided free-access section: what happens, in order, with the working CTA at the end. */
export function FreeAccessSection() {
  return (
    <Panel className="gold-glow overflow-hidden p-0">
      <div className="border-b border-border bg-primary/5 p-6 sm:p-7">
        <Pill tone="signal">
          <KeyRound className="size-3" aria-hidden="true" />
          FREE ACCESS
        </Pill>
        <h2 className="mt-4 font-display text-[clamp(1.4rem,3vw,2rem)] leading-tight font-semibold">
          Try Revora free for{" "}
          <span className="gold-text">{GROWTH_SYSTEM.fullAccessTrialDays} days</span> — full access,
          nothing locked.
        </h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Get inside the real system, not a slideshow. Build your website, capture a test lead, send
          a quote, take a booking and watch the automations fire — before you pay anything.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <FreeAccessButton />
          <Button asChild variant="outline" size="lg">
            <Link to="/demo/dashboard">SEE THE DEMO DASHBOARD</Link>
          </Button>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Already started?{" "}
          <Link to="/auth" className="gold-hl hover:underline">
            Sign in
          </Link>{" "}
          and pick up exactly where you left off — your answers are saved.
        </p>
      </div>
      <ol className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
        {FREE_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="border-b border-border p-5 last:border-b-0 sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:not-last:border-r"
          >
            <div className="flex items-center gap-2">
              <span className="tnum grid size-6 place-items-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-semibold text-primary">
                {index + 1}
              </span>
              <h3 className="font-display text-[13px] font-bold tracking-[0.1em] uppercase">
                {step.title}
              </h3>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-background/40 px-5 py-4 text-[13px] text-muted-foreground">
        {["No card needed to explore", "Cancel anytime", "Your progress is saved"].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </Panel>
  );
}
