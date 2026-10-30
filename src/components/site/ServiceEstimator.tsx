/**
 * Zero-token, client-side price/time estimator. Visitors tick the owner's real
 * services and see a running total from the prices and durations the owner
 * entered in the Services tool. No AI call, no invented figures: services
 * without a price are counted as "priced on enquiry".
 */
import { useMemo, useState } from "react";
import type { WidgetPresentation } from "@/lib/builder/composition-tree";
import type { PublicSite } from "@/lib/public-site.functions";
import { widgetPresentationStyle } from "@/components/site/contact-details-utils";
import { estimateTotal, estimatorOptions } from "@/components/site/live-blocks-utils";
import { durationLabel } from "@/components/site/live-blocks-utils";
import { RollingNumber } from "@/components/site/CountUp";
import { currency } from "@/lib/format";

type Site = NonNullable<PublicSite>;

export function ServiceEstimator({ site, presentation }: { site: Site; presentation?: WidgetPresentation }) {
  const options = useMemo(() => estimatorOptions(site.services ?? []), [site.services]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(options[0] ? [options[0].id] : []));
  if (options.length < 2) return null;
  const total = estimateTotal(options, picked);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div data-live-block="service_estimator" style={widgetPresentationStyle(presentation)} className="w-full rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <p className="eyebrow">{presentation?.eyebrow ?? "Estimate"}</p>
      <h3 className="mt-1 font-display text-[22px] font-semibold">{presentation?.title ?? "Build your estimate"}</h3>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Services</legend>
        {options.map((option) => (
          <label key={option.id} data-estimator-option="" className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <span className="flex items-center gap-2">
              {/* The real checkbox stays in the page for keyboards and screen
                  readers; the box beside it is the custom-drawn control. */}
              <input type="checkbox" checked={picked.has(option.id)} onChange={() => toggle(option.id)} className="peer sr-only" />
              <span aria-hidden="true" data-estimator-check="" className="grid size-5 shrink-0 place-content-center rounded-md border border-border text-primary-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
              </span>
              <span className="text-[15px]">{option.name}</span>
            </span>
            <span className="tnum shrink-0 text-[13px] text-muted-foreground">
              {option.amount !== null ? `${option.from ? "From " : ""}${currency(option.amount)}` : durationLabel(option.minutes)}
            </span>
          </label>
        ))}
      </fieldset>
      <div aria-live="polite" className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-[13px] text-muted-foreground">{total.count} selected</p>
          <p className="tnum font-display text-[28px] font-semibold text-primary">{total.amount !== null ? (
              <>
                {total.from ? "From " : ""}
                <RollingNumber value={total.amount} format={currency} />
              </>
            ) : total.count ? "Priced on enquiry" : "—"}</p>
          {total.duration ? <p className="text-[13px] text-muted-foreground">About {total.duration}</p> : null}
        </div>
        <p className="max-w-[18rem] text-[12px] text-muted-foreground">
          Based on the listed prices{total.unpriced ? `; ${total.unpriced} item${total.unpriced === 1 ? " is" : "s are"} priced on enquiry` : ""}. Your final quote is confirmed by {site.org.name}.
        </p>
      </div>
    </div>
  );
}
