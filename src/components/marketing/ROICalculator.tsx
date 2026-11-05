import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Pill } from "@/components/app/Bits";
import { currency } from "@/lib/format";

const FIELDS = [
  {
    key: "value" as const,
    label: "Average customer value",
    hint: "What a typical job is worth to you",
    min: 25,
    max: 5000,
    step: 25,
    prefix: "$",
  },
  {
    key: "leads" as const,
    label: "Leads per month",
    hint: "Calls, forms, DMs and referrals",
    min: 5,
    max: 400,
    step: 5,
    prefix: "",
  },
  {
    key: "rate" as const,
    label: "Current booking rate",
    hint: "Share of leads that become paying jobs",
    min: 5,
    max: 95,
    step: 5,
    prefix: "",
    suffix: "%",
  },
  {
    key: "lift" as const,
    label: "Extra customers you want per month",
    hint: "Your own target — Revora does not promise a number",
    min: 1,
    max: 40,
    step: 1,
    prefix: "",
  },
];

/**
 * Client-side opportunity estimator. Purely arithmetic on the visitor's own
 * inputs — no Revora performance claim, no stored or fabricated data.
 */
export function ROICalculator() {
  const [state, setState] = useState({ value: 250, leads: 60, rate: 25, lift: 5 });

  const result = useMemo(() => {
    const booked = Math.round((state.leads * state.rate) / 100);
    const current = booked * state.value;
    const potential = (booked + state.lift) * state.value;
    return {
      booked,
      current,
      potential,
      upside: potential - current,
      annual: (potential - current) * 12,
    };
  }, [state]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <Panel className="min-w-0 p-5 sm:p-6">
        <p className="eyebrow">Your numbers</p>
        <div className="mt-5 space-y-6">
          {FIELDS.map((f) => {
            const id = `roi-${f.key}`;
            const value = state[f.key];
            return (
              <div key={f.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor={id} className="text-[13px] font-medium text-foreground">
                    {f.label}
                  </label>
                  <span className="tnum font-display text-[15px] font-semibold text-primary">
                    {f.prefix}
                    {value.toLocaleString()}
                    {f.suffix ?? ""}
                  </span>
                </div>
                <input
                  id={id}
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value}
                  aria-describedby={`${id}-hint`}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setState((s) => ({ ...s, [f.key]: next }));
                  }}
                  className="mt-3 h-11 w-full cursor-pointer accent-[var(--primary)]"
                />
                <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted-foreground">
                  {f.hint}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="flex min-w-0 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Your estimate</p>
          <Pill tone="attention">Estimate — not a guarantee</Pill>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
          At {state.leads} leads a month and a {state.rate}% booking rate you're booking about{" "}
          <span className="text-foreground">{result.booked} customers</span>.
        </p>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            ["Today", currency(result.current)],
            ["With +" + state.lift + " customers", currency(result.potential)],
          ].map(([label, amount]) => (
            <div key={label} className="rounded-md border border-border bg-elevated p-4">
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="tnum mt-1.5 font-display text-[19px] font-semibold">{amount}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            Potential additional monthly revenue
          </p>
          <p className="tnum mt-1.5 font-display text-[clamp(1.6rem,4vw,2.2rem)] leading-none font-semibold text-primary">
            {currency(result.upside)}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {state.lift} additional customers × {currency(state.value)} average value. That's{" "}
            {currency(result.annual)} across a year, before comparing it to a Revora subscription.
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Illustrative estimate only. Results vary by business, market, offer and execution. Revora
          does not guarantee specific results. These figures come only from the numbers you entered.
        </p>

        <Button asChild variant="signal" size="lg" className="mt-5 w-full">
          <Link to="/get-started">
            Build My Growth System <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </Panel>
    </div>
  );
}
