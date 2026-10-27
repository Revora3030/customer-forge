/**
 * What the one offer covers, straight from the canonical offer module so the
 * lists can never disagree with the price beside them.
 */
import { Check } from "lucide-react";
import { GROWTH_SYSTEM } from "@/lib/offer";

function List({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="min-w-0">
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex min-w-0 items-start gap-2 text-[13px] leading-snug">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OfferIncludes() {
  return (
    <div className="min-w-0 space-y-7 p-6 sm:p-7">
      <List title="Built for you with the setup" items={GROWTH_SYSTEM.setupIncludes} />
      <List title="Kept running by the monthly fee" items={GROWTH_SYSTEM.monthlyIncludes} />
    </div>
  );
}
