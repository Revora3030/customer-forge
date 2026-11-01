import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Pill } from "@/components/app/Bits";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import {
  MAX_TOOL_PRICE,
  PRICES_CHECKED_LABEL,
  SAVINGS_TOOLS,
  cleanPrice,
  computeSavings,
  type SavingsToolId,
} from "@/lib/software-savings";

/**
 * Software-replacement estimator. The visitor ticks the tools they pay for and
 * enters their own bill; nothing is pre-ticked and the starting price shown when
 * a tool is ticked is the cheapest published list price we checked (or empty where we found none), which they are asked to correct.
 */
export function SavingsCalculator() {
  const [prices, setPrices] = useState<Partial<Record<SavingsToolId, string>>>({});

  const result = useMemo(
    () => computeSavings(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, cleanPrice(v)]))),
    [prices],
  );

  const toggle = (id: SavingsToolId, typical: number | null, on: boolean) =>
    setPrices((p) => {
      const next = { ...p };
      if (on) next[id] = typical === null ? "" : String(typical);
      else delete next[id];
      return next;
    });

  const saves = result.toolCount > 0 && !result.revoraCostsMore;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <Panel className="min-w-0 p-5 sm:p-6">
        <p className="eyebrow">Tools you pay for today</p>
        <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
          Tick what you pay for and correct each price to match your real bill.
        </p>
        <ul className="mt-4 space-y-3">
          {SAVINGS_TOOLS.map((tool) => {
            const checked = tool.id in prices;
            const checkId = `savings-${tool.id}`;
            const priceId = `${checkId}-price`;
            return (
              <li key={tool.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(tool.id, tool.typical, e.target.checked)}
                    className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
                  />
                  <label htmlFor={checkId} className="min-w-0 cursor-pointer text-[13px] leading-snug">
                    <span className="font-medium text-foreground">{tool.label}</span>
                    <span className="block text-muted-foreground">{tool.example}</span>
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <span aria-hidden="true" className="text-[13px] text-muted-foreground">
                    $
                  </span>
                  <input
                    id={priceId}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_TOOL_PRICE}
                    step="any"
                    disabled={!checked}
                    value={prices[tool.id] ?? ""}
                    placeholder="0"
                    aria-label={`${tool.label}: your monthly cost in dollars`}
                    onChange={(e) => setPrices((p) => ({ ...p, [tool.id]: e.target.value }))}
                    className="tnum h-11 w-24 rounded-md border border-border bg-elevated px-2 text-right text-[14px] disabled:opacity-40"
                  />
                  <span aria-hidden="true" className="text-[12px] text-muted-foreground">
                    /mo
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="flex min-w-0 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Your comparison</p>
          <Pill tone="attention">Estimate from your numbers</Pill>
        </div>

        <div aria-live="polite" className="mt-5">
          {result.toolCount === 0 ? (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Tick the tools you pay for to see how they compare with {usd(GROWTH_SYSTEM.monthlyPrice)}/month
              after the free first month.
            </p>
          ) : (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-elevated p-4">
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Your tools today
                  </dt>
                  <dd className="tnum mt-1.5 font-display text-[19px] font-semibold">
                    {usd(result.currentMonthly)}/mo
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-elevated p-4">
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Revora from month two
                  </dt>
                  <dd className="tnum mt-1.5 font-display text-[19px] font-semibold">
                    {usd(result.revoraMonthly)}/mo
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-4">
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  First 12 months, including the {usd(GROWTH_SYSTEM.setupPrice)} setup
                </p>
                {saves ? (
                  <p className="tnum mt-1.5 font-display text-[clamp(1.6rem,4vw,2.2rem)] leading-none font-semibold text-primary">
                    {usd(Math.round(result.firstYearDifference))} less
                  </p>
                ) : (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                    The tools you entered cost less than Revora, so this would not save you money on
                    software alone.
                  </p>
                )}
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {usd(Math.round(result.firstYearCurrent))} on your current tools versus{" "}
                  {usd(result.firstYearRevora)} on Revora ({usd(GROWTH_SYSTEM.setupPrice)} setup, first month
                  free, then {usd(GROWTH_SYSTEM.monthlyPrice)}/month).
                </p>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Illustrative arithmetic on the prices you enter. Any starting price is the cheapest published plan we
          checked on {PRICES_CHECKED_LABEL}, not your bill; where we found no public price the field starts empty. Only count tools you would stop paying for.
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
