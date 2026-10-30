/**
 * Trade calculator (quality bar #14). The default view is always the existing
 * price estimator. "Monthly payments" and "Return" views appear only when the
 * owner entered finance terms or ROI inputs in the section's settings; nothing
 * here ever invents a rate, price or yield.
 */
import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { WidgetPresentation } from "@/lib/builder/composition-tree";
import { widgetPresentationStyle } from "@/components/site/contact-details-utils";
import { currency } from "@/lib/format";
import {
  calculatorViews,
  financedAmount,
  monthlyPayment,
  roiProjection,
  type CalculatorView as View,
  type TradeCalculatorData,
} from "@/lib/trade-calculator";

const VIEW_LABEL: Record<View, string> = { estimate: "Estimate", finance: "Monthly payments", roi: "Return" };

export function TradeCalculator({
  data,
  businessName,
  estimator,
  presentation,
}: {
  data: TradeCalculatorData;
  businessName: string;
  /** The existing estimator/quote widget; stays the default view. */
  estimator: ReactNode;
  presentation?: WidgetPresentation;
}) {
  const base = useId();
  const views = calculatorViews(data, Boolean(estimator));
  const [view, setView] = useState<View>(views[0] ?? "estimate");
  if (!views.length) return null;
  if (views.length === 1 && views[0] === "estimate" && !data.priceRanges?.length) return <>{estimator}</>;
  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = views.indexOf(view);
    const next =
      event.key === "ArrowRight" ? views[(at + 1) % views.length]
      : event.key === "ArrowLeft" ? views[(at - 1 + views.length) % views.length]
      : event.key === "Home" ? views[0]
      : event.key === "End" ? views[views.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    setView(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };
  return (
    <div data-live-block="trade_calculator" style={widgetPresentationStyle(presentation)} className="w-full space-y-4">
      {views.length > 1 ? (
        <div role="tablist" aria-label="Calculator" className="flex flex-wrap gap-2">
          {views.map((v) => (
            <button
              key={v}
              id={`${base}-tab-${v}`}
              type="button"
              role="tab"
              aria-selected={view === v}
              aria-controls={`${base}-panel-${v}`}
              tabIndex={view === v ? 0 : -1}
              onClick={() => setView(v)}
              onKeyDown={onKey}
              className="min-h-11 rounded-full border border-border px-4 text-[14px] font-medium transition-colors duration-200 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground motion-reduce:transition-none"
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      ) : null}
      {views.map((v) => (
        <div
          key={v}
          id={`${base}-panel-${v}`}
          role={views.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={views.length > 1 ? `${base}-tab-${v}` : undefined}
          hidden={view !== v}
        >
          {v === "estimate" ? (
            <div className="space-y-4">
              {estimator}
              {data.priceRanges?.length ? <PriceRanges data={data} businessName={businessName} /> : null}
            </div>
          ) : v === "finance" ? (
            <FinancePanel data={data} businessName={businessName} />
          ) : (
            <RoiPanel data={data} businessName={businessName} />
          )}
        </div>
      ))}
    </div>
  );
}

const CARD = "rounded-2xl border border-border bg-card p-5 text-card-foreground";

function PriceRanges({ data, businessName }: { data: TradeCalculatorData; businessName: string }) {
  return (
    <div data-calculator-ranges="" className={CARD}>
      <h3 className="font-display text-[18px] font-semibold">Typical price ranges</h3>
      <ul className="mt-3 divide-y divide-border">
        {data.priceRanges!.map((range) => (
          <li key={range.label} className="flex items-center justify-between gap-3 py-2 text-[15px]">
            <span>{range.label}</span>
            <span className="tnum text-muted-foreground">{currency(range.min)} – {currency(range.max)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted-foreground">Ranges set by {businessName}. Your final quote is confirmed after a look at the job.</p>
    </div>
  );
}

function FinancePanel({ data, businessName }: { data: TradeCalculatorData; businessName: string }) {
  const finance = data.finance!;
  const id = useId();
  const ranges = data.priceRanges ?? [];
  const [rangeIndex, setRangeIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [term, setTerm] = useState(finance.termsMonths[finance.termsMonths.length - 1]!);
  const range = ranges[rangeIndex];
  const typedAmount = Number(typed);
  const prices = range ? [range.min, range.max] : typedAmount > 0 ? [typedAmount] : [];
  const payments = prices.map((price) => monthlyPayment(financedAmount(price, finance.depositPercent), finance.apr, term));
  return (
    <div data-calculator-finance="" className={CARD}>
      <h3 className="font-display text-[22px] font-semibold">Monthly payments</h3>
      {ranges.length ? (
        <fieldset className="mt-4">
          <legend className="text-[13px] text-muted-foreground">Job</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ranges.map((r, index) => (
              <button key={r.label} type="button" aria-pressed={index === rangeIndex} onClick={() => setRangeIndex(index)} className="min-h-11 rounded-xl border border-border px-3 text-[14px] transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary/10 motion-reduce:transition-none">
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="mt-4 space-y-1.5">
          <label htmlFor={`${id}-amount`} className="text-[13px] text-muted-foreground">Project amount</label>
          <input id={`${id}-amount`} inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Enter your quote amount" className="h-11 w-full rounded-xl border border-border bg-transparent px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      )}
      <fieldset className="mt-4">
        <legend className="text-[13px] text-muted-foreground">Term</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {finance.termsMonths.map((months) => (
            <button key={months} type="button" aria-pressed={months === term} onClick={() => setTerm(months)} className="tnum min-h-11 rounded-xl border border-border px-3 text-[14px] transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:border-primary aria-pressed:bg-primary/10 motion-reduce:transition-none">
              {months} months
            </button>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite" className="mt-5 border-t border-border pt-4">
        <p className="tnum font-display text-[28px] font-semibold text-primary">
          {payments.length ? payments.map((p) => currency(p)).join(" – ") : "—"}
          {payments.length ? <span className="text-[15px] font-normal text-muted-foreground"> / month</span> : null}
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {finance.apr}% APR over {term} months{finance.depositPercent ? ` after a ${finance.depositPercent}% deposit` : ""}, as set by {businessName}. Illustration only, not a credit offer; approval and final terms are confirmed by the lender.
        </p>
      </div>
    </div>
  );
}

function RoiPanel({ data, businessName }: { data: TradeCalculatorData; businessName: string }) {
  const roi = data.roi!;
  const id = useId();
  const [utilization, setUtilization] = useState(Math.round((roi.utilizationMin + roi.utilizationMax) / 2));
  const projection = roiProjection(roi, utilization);
  const span = roi.utilizationMax - roi.utilizationMin;
  const fill = span > 0 ? ((utilization - roi.utilizationMin) / span) * 100 : 100;
  return (
    <div data-calculator-roi="" className={CARD}>
      <h3 className="font-display text-[22px] font-semibold">{roi.label ?? "Estimated return"}</h3>
      <div className="mt-4">
        <label htmlFor={`${id}-util`} className="flex justify-between text-[13px] text-muted-foreground">
          <span>Utilisation</span>
          <span className="tnum">{utilization}%</span>
        </label>
        <input
          id={`${id}-util`}
          type="range"
          min={roi.utilizationMin}
          max={roi.utilizationMax}
          step={1}
          value={utilization}
          disabled={span === 0}
          onChange={(e) => setUtilization(Number(e.target.value))}
          aria-valuetext={`${utilization}% of ${roi.unitsPerYear} ${roi.unit}s a year`}
          className="rv-tier-range text-primary"
          style={{ "--rv-tier-fill": `${fill}%` } as CSSProperties}
        />
      </div>
      <dl aria-live="polite" className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-[13px] text-muted-foreground">Yearly income</dt>
          <dd className="tnum font-display text-[24px] font-semibold text-primary">{currency(projection.annualIncome)}</dd>
        </div>
        {roi.annualCosts ? (
          <div>
            <dt className="text-[13px] text-muted-foreground">After yearly costs</dt>
            <dd className="tnum font-display text-[24px] font-semibold">{currency(projection.annualNet)}</dd>
          </div>
        ) : null}
        {projection.paybackYears !== null ? (
          <div>
            <dt className="text-[13px] text-muted-foreground">Pays back in</dt>
            <dd className="tnum font-display text-[24px] font-semibold">{projection.paybackYears} years</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-[12px] text-muted-foreground">
        {currency(roi.valuePerUnit)} per {roi.unit} across {roi.unitsPerYear} {roi.unit}s a year, within the {roi.utilizationMin}–{roi.utilizationMax}% range {businessName} provided. An estimate, not a guarantee of earnings.
      </p>
    </div>
  );
}
