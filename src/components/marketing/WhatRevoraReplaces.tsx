import { Check } from "lucide-react";
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { REPLACED_TOOLS, REPLACES_HEADING } from "@/lib/what-revora-replaces";

/**
 * The separate tools a local business often pays for, and the Revora feature
 * that does the same job. Categories only, no tool prices: every row is a
 * feature the offer already lists and the code already ships (see
 * `src/lib/what-revora-replaces.ts`).
 */
export function WhatRevoraReplaces({ className = "" }: { className?: string }) {
  return (
    <section
      id="what-revora-replaces"
      aria-labelledby="what-revora-replaces-heading"
      className={`scroll-mt-20 ${className}`}
    >
      <p className="eyebrow">One system</p>
      <h2
        id="what-revora-replaces-heading"
        className="mt-1 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-semibold"
      >
        {REPLACES_HEADING}
      </h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        Most shops pay for these as separate subscriptions. With Revora they come in one system:{" "}
        {usd(GROWTH_SYSTEM.setupPrice)} setup, the first month free, then{" "}
        {usd(GROWTH_SYSTEM.monthlyPrice)}/month. Once your Revora system is running, you can cancel
        the separate subscriptions you no longer need.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPLACED_TOOLS.map((tool) => (
          <li key={tool.id} className="panel min-w-0 p-4">
            <p className="flex items-start gap-2 font-display text-[14px] font-semibold">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">{tool.category}</span>
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{tool.revora}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
        Keep any tool you still prefer. Revora doesn't require you to cancel anything, and it doesn't
        replace tools outside this list, such as accounting or payroll.
      </p>
    </section>
  );
}
