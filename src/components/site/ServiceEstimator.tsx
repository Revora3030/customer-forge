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
          <label key={option.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={picked.has(option.id)} onChange={() => toggle(option.id)} className="size-4 accent-[var(--primary)]" />
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
          <p className="tnum font-display text-[28px] font-semibold text-primary">{total.price ?? (total.count ? "Priced on enquiry" : "—")}</p>
          {total.duration ? <p className="text-[13px] text-muted-foreground">About {total.duration}</p> : null}
        </div>
        <p className="max-w-[18rem] text-[12px] text-muted-foreground">
          Based on the listed prices{total.unpriced ? `; ${total.unpriced} item${total.unpriced === 1 ? " is" : "s are"} priced on enquiry` : ""}. Your final quote is confirmed by {site.org.name}.
        </p>
      </div>
    </div>
  );
}
