/**
 * $750 value presentation — what the setup fee actually replaces, priced
 * against what a local business would otherwise pay for each piece separately.
 * Comparison figures are typical market ranges, labelled as estimates.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Panel, Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";

const LINE_ITEMS = [
  { item: "Custom conversion-built website", elsewhere: "$2,500 – $6,000 build" },
  { item: "Instant quote calculator", elsewhere: "$400 – $1,200 setup" },
  { item: "Online booking system", elsewhere: "$25 – $60/month tool" },
  { item: "CRM + lead pipeline setup", elsewhere: "$30 – $99/month tool" },
  { item: "Automated follow-up sequences", elsewhere: "$50 – $200/month tool" },
  { item: "Review request engine", elsewhere: "$40 – $150/month tool" },
  {
    item: "Local SEO foundation (service + city pages, schema)",
    elsewhere: "$500 – $1,500 project",
  },
  { item: "Analytics + conversion tracking", elsewhere: "$300 – $800 setup" },
  { item: "Domain, hosting and launch", elsewhere: "$200 – $500 + hosting" },
  { item: "Ongoing updates, support and optimization", elsewhere: "$500+/month agency retainer" },
] as const;

/** The "why $750 is the easy part" value stack. */
export function ValueStack() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
      <Panel className="min-w-0 p-5 sm:p-6">
        <p className="eyebrow">What the {usd(GROWTH_SYSTEM.setupPrice)} setup replaces</p>
        <ul className="mt-4 divide-y divide-border/70">
          {LINE_ITEMS.map(({ item, elsewhere }) => (
            <li
              key={item}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
            >
              <span className="min-w-0 flex-1 text-[13px]">
                <span aria-hidden="true" className="mr-2 text-primary">
                  ✓
                </span>
                {item}
              </span>
              <span className="tnum shrink-0 text-[13px] text-muted-foreground line-through decoration-muted-foreground/50">
                {elsewhere}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
          Comparison figures are typical market ranges for buying each piece separately — shown for
          context, not quotes from any specific vendor.
        </p>
      </Panel>

      <div className="min-w-0">
        <Pill tone="signal">The honest math</Pill>
        <h3 className="mt-4 font-display text-[clamp(1.3rem,2.5vw,1.85rem)] leading-tight font-semibold">
          Built separately, this is a <span className="gold-text">five-figure</span> project.
        </h3>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
          Revora installs the whole system for {usd(GROWTH_SYSTEM.setupPrice)} one time, gives you
          the first month free, then {usd(GROWTH_SYSTEM.monthlyPrice)}/month to run, host, automate,
          support and keep improving it.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Panel className="p-4">
            <p className="tnum gold-text font-display text-[26px] leading-none font-semibold">
              {usd(GROWTH_SYSTEM.setupPrice)}
            </p>
            <p className="mt-1.5 text-[12.5px]">One-time setup</p>
            <p className="text-[11.5px] text-muted-foreground">
              Everything built, connected and launched for you.
            </p>
          </Panel>
          <Panel className="p-4">
            <p className="tnum font-display text-[26px] leading-none font-semibold">
              <span className="gold-text">{usd(GROWTH_SYSTEM.monthlyPrice)}</span>
              <span className="text-[13px] font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1.5 text-[12.5px] text-primary">First month free</p>
            <p className="text-[11.5px] text-muted-foreground">
              Less than most businesses spend on one lead.
            </p>
          </Panel>
        </div>
        <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Try the entire system free for {GROWTH_SYSTEM.fullAccessWindow} before you pay
          anything. Cancel the monthly at any time — your site, content and customer list stay
          yours.
        </p>
        <Button
          asChild
          variant="signal"
          size="lg"
          className="mt-5 h-auto w-full py-3 leading-snug whitespace-normal sm:w-auto"
        >
          <Link to="/get-started">
            {GROWTH_SYSTEM.ctaShort} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
