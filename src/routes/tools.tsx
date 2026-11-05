import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { SiteFooter, SiteHeader } from "@/components/marketing/Chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { breadcrumbSchema, canonicalLink, ogUrl, metaDescription, OG_IMAGE_META } from "@/lib/seo";
import {
  MISSED_LEAD_FIXED_ASSUMPTIONS,
  MISSED_LEAD_HEADING,
  MISSED_LEAD_INTRO,
  MISSED_LEAD_RESULT_LABELS,
  missedLeadInputLines,
} from "@/lib/missed-lead-copy";
import { formatPercent, formatUsd, leadValue, missedCallImpact } from "@/lib/tools-calc";

const TITLE = "Free Calculators for Local Businesses | Revora";
const DESCRIPTION =
  "Free calculators for businesses in every industry: what unanswered calls could cost and what every lead is worth. No signup.";

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: metaDescription(DESCRIPTION) },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogUrl("/tools"),
      ...OG_IMAGE_META,
    ],
    links: [canonicalLink("/tools")],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbSchema([
            { name: "Revora", path: "/" },
            { name: "Free calculators", path: "/tools" },
          ]),
        ),
      },
    ],
  }),
  component: ToolsPage,
});

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix ? (
          <span className="shrink-0 text-[13px] text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-[20px] font-semibold text-primary">{value}</div>
    </div>
  );
}

function ToolsPage() {
  const [enquiriesPerWeek, setEnquiries] = useState(20);
  const [missedPercent, setMissed] = useState(25);
  const [closeRatePercent, setCloseRate] = useState(40);
  const [averageJobValue, setJobValue] = useState(450);

  const missed = useMemo(
    () => missedCallImpact({ enquiriesPerWeek, missedPercent, closeRatePercent, averageJobValue }),
    [enquiriesPerWeek, missedPercent, closeRatePercent, averageJobValue],
  );

  const [leads, setLeads] = useState(60);
  const [customers, setCustomers] = useState(15);
  const [ljv, setLjv] = useState(450);
  const [repeatJobs, setRepeatJobs] = useState(1);
  const [marginPercent, setMargin] = useState(45);
  const [spend, setSpend] = useState(500);

  const lv = useMemo(
    () =>
      leadValue({
        leads,
        customers,
        averageJobValue: ljv,
        repeatJobs,
        marginPercent,
        spend,
      }),
    [leads, customers, ljv, repeatJobs, marginPercent, spend],
  );

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="font-editorial text-balance text-[clamp(1.7rem,4vw,2.5rem)] leading-tight">
          Free <span className="gold-hl">calculators</span> for local businesses
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          These run entirely in your browser using the numbers you type. Nothing is saved or sent
          anywhere. They are estimates based on your own inputs, not a prediction or a guarantee.
        </p>

        <section className="mt-12 rounded-2xl border border-border/60 p-5 sm:p-6">
          <h2 className="font-display text-[20px] font-semibold">1. {MISSED_LEAD_HEADING}</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">{MISSED_LEAD_INTRO}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField
              id="enquiries"
              label="Calls & form enquiries per week"
              value={enquiriesPerWeek}
              onChange={setEnquiries}
            />
            <NumberField
              id="missed"
              label="Share you miss or reply late to"
              value={missedPercent}
              onChange={setMissed}
              suffix="%"
              max={100}
            />
            <NumberField
              id="close"
              label="Of the ones you answer, how many book"
              value={closeRatePercent}
              onChange={setCloseRate}
              suffix="%"
              max={100}
            />
            <NumberField
              id="job"
              label="Average job value"
              value={averageJobValue}
              onChange={setJobValue}
              suffix="$"
              step={25}
            />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={MISSED_LEAD_RESULT_LABELS.missedPerWeek}
              value={missed.missedPerWeek.toFixed(1)}
            />
            <Stat
              label={MISSED_LEAD_RESULT_LABELS.missedPerMonth}
              value={missed.missedPerMonth.toFixed(1)}
            />
            <Stat
              label={MISSED_LEAD_RESULT_LABELS.jobsPerMonth}
              value={missed.lostJobsPerMonth.toFixed(1)}
            />
            <Stat
              label={MISSED_LEAD_RESULT_LABELS.revenuePerYear}
              value={formatUsd(missed.lostRevenuePerYear)}
            />
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            About {formatUsd(missed.lostRevenuePerMonth)} of revenue per month at the numbers above.
          </p>
          <div
            className="mt-4 rounded-xl border border-border/60 bg-card/40 p-4"
            data-testid="missed-lead-assumptions"
          >
            <h3 className="text-[14px] font-semibold">How this is worked out</h3>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Unanswered per week × 52 ÷ 12 × share that would book × average job value × 12. Your
              inputs:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {missedLeadInputLines({
                enquiriesPerWeek,
                missedPercent,
                closeRatePercent,
                averageJobValue,
              }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3 className="mt-3 text-[14px] font-semibold">What it assumes</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {MISSED_LEAD_FIXED_ASSUMPTIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-border/60 p-5 sm:p-6">
          <h2 className="font-display text-[20px] font-semibold">2. What a lead is worth to you</h2>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Know this number and you can tell instantly whether any marketing spend is sane.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              id="leads"
              label="Leads in a typical month"
              value={leads}
              onChange={setLeads}
            />
            <NumberField
              id="customers"
              label="How many became customers"
              value={customers}
              onChange={setCustomers}
            />
            <NumberField
              id="ljv"
              label="Average job value"
              value={ljv}
              onChange={setLjv}
              suffix="$"
              step={25}
            />
            <NumberField
              id="repeat"
              label="Jobs per customer (lifetime)"
              value={repeatJobs}
              onChange={setRepeatJobs}
              step={0.5}
            />
            <NumberField
              id="margin"
              label="Profit margin"
              value={marginPercent}
              onChange={setMargin}
              suffix="%"
              max={100}
            />
            <NumberField
              id="spend"
              label="Monthly marketing spend"
              value={spend}
              onChange={setSpend}
              suffix="$"
              step={25}
            />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lead → customer rate" value={formatPercent(lv.conversionRate)} />
            <Stat label="Profit per lead" value={formatUsd(lv.valuePerLead)} />
            <Stat label="Cost per lead" value={formatUsd(lv.costPerLead)} />
            <Stat label="Net per lead" value={formatUsd(lv.netPerLead)} />
            <Stat label="Revenue per customer" value={formatUsd(lv.revenuePerCustomer)} />
            <Stat label="Cost per customer" value={formatUsd(lv.costPerCustomer)} />
            <Stat
              label="Return on spend"
              value={lv.roas === null ? "—" : `${lv.roas.toFixed(1)}x`}
            />
            <Stat
              label="Leads to break even"
              value={lv.breakEvenLeads === null ? "—" : lv.breakEvenLeads.toFixed(1)}
            />
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/get-started">
              Start your system free for {GROWTH_SYSTEM.fullAccessWindow}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/guides">Read the free guides</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
