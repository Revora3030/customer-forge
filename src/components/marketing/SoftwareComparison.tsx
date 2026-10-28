import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { typicalComparison } from "@/lib/software-savings";

/**
 * The typical bill for the tools Revora covers, next to Revora's own first year,
 * shown before the visitor types anything. The prices are typical entry-level
 * list prices, not anyone's bill: the calculator beside it takes the visitor's
 * real numbers.
 */
export function SoftwareComparison() {
  const c = typicalComparison();
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Typical entry-level prices</p>
        <p className="text-[12px] text-muted-foreground">Not your bill: enter yours in the calculator below.</p>
      </div>
      <table className="mt-4 w-full text-left text-[13px]">
        <caption className="sr-only">Typical monthly list prices of tools a local business often pays for</caption>
        <thead>
          <tr className="border-b border-border text-[11px] tracking-wide text-muted-foreground uppercase">
            <th scope="col" className="py-2 pr-3 font-medium">Tool</th>
            <th scope="col" className="py-2 text-right font-medium">Typical per month</th>
          </tr>
        </thead>
        <tbody>
          {c.tools.map((tool) => (
            <tr key={tool.id} className="border-b border-border/60">
              <th scope="row" className="py-2.5 pr-3 font-normal">
                <span className="font-medium text-foreground">{tool.label}</span>
                <span className="block text-muted-foreground">{tool.example}</span>
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
        If you also pay an agency or freelancer a monthly retainer, the same comparison is {usd(c.withAgencyFirstYear)} against{" "}
        {usd(c.revoraFirstYear)}. Prices vary by provider and plan, and your needs may not use every tool listed.
      </p>
    </div>
  );
}
