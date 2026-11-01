import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { PRICES_CHECKED_LABEL, typicalComparison } from "@/lib/software-savings";

/**
 * The published list price of the cheapest paid plan for the tools Revora
 * covers, next to Revora's own first year, shown before the visitor types
 * anything. Every price was read from the vendor's own public pricing page on
 * the date shown and is linked below the table; a tool with no public price is
 * left out of the totals. These are not anyone's bill: the calculator beside it
 * takes the visitor's real numbers.
 */
export function SoftwareComparison() {
  const c = typicalComparison();
  const gap = Math.abs(Math.round(c.toolsDifference));
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Typical entry-level prices</p>
        <p className="text-[12px] text-muted-foreground">Not your bill: enter yours in the calculator below.</p>
      </div>
      <table className="mt-4 w-full text-left text-[13px]">
        <caption className="sr-only">
          Published monthly list prices of the cheapest paid plan for tools a local business often pays for
        </caption>
        <thead>
          <tr className="border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">Tool</th>
            <th scope="col" className="py-2 text-right font-medium">Cheapest paid plan, per month</th>
          </tr>
        </thead>
        <tbody>
          {c.tools.map((tool) => (
            <tr key={tool.id} className="border-b border-border/60">
              <th scope="row" className="py-2.5 pr-3 font-normal">
                <span className="font-medium text-foreground">{tool.label}</span>
                <span className="block text-muted-foreground">
                  {tool.source.vendor} {tool.source.plan}
                </span>
              </th>
              <td className="tnum py-2.5 text-right">{usd(tool.typical)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="pt-3 pr-3 text-left font-semibold">Tools together</th>
            <td className="tnum pt-3 text-right font-semibold">{usd(c.toolsMonthly)}/mo</td>
          </tr>
        </tfoot>
      </table>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-elevated p-4">
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Those tools, first 12 months</dt>
          <dd className="tnum mt-1.5 font-display text-[19px] font-semibold">{usd(c.toolsFirstYear)}</dd>
        </div>
        <div className="rounded-md border border-border bg-elevated p-4">
          <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Revora, first 12 months</dt>
          <dd className="tnum mt-1.5 font-display text-[19px] font-semibold">{usd(c.revoraFirstYear)}</dd>
          <dd className="mt-1 text-[12px] text-muted-foreground">
            {usd(GROWTH_SYSTEM.setupPrice)} setup plus 11 paid months at {usd(GROWTH_SYSTEM.monthlyPrice)}; the first month is free.
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {c.toolsCostLess
          ? `At these entry-level prices the tools alone cost about ${usd(gap)} less over the first 12 months than Revora does. Revora puts the website, lead capture, follow-up and bookings in one account instead of separate subscriptions, and the calculator below uses your own bills.`
          : `At these entry-level prices the tools alone cost about ${usd(gap)} more over the first 12 months than Revora does.`}{" "}
        Prices vary by provider and plan, and your needs may not use every tool listed.
        {c.unpriced.length > 0
          ? ` ${c.unpriced.join(" and ")} are left out because we found no public price to check.`
          : ""}
      </p>
      <div className="mt-3 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground" data-testid="savings-sources">
        <p>
          Prices from public pricing pages, checked {PRICES_CHECKED_LABEL}. Each is the cheapest paid plan, for one user or seat:
        </p>
        <ul className="mt-1 space-y-0.5">
          {c.tools.map((tool) => (
            <li key={tool.id}>
              <a href={tool.source.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                {tool.source.vendor} {tool.source.plan}
              </a>
              : {usd(tool.typical)} {tool.source.basis}.
            </li>
          ))}
        </ul>
        <p className="mt-1">Vendors change prices; check their pages for today&apos;s figure.</p>
      </div>
    </div>
  );
}
