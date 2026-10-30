/**
 * A print- and save-as-PDF-ready copy of the estimate a visitor just received.
 * It only restates what they chose and the range already shown to them, and it
 * says plainly that it is an estimate, not a quote or contract.
 */
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currency } from "@/lib/format";

export type EstimateLine = { question: string; answer: string };
export type EstimateExtra = { label: string; price: number };

export function PrintableEstimate({
  businessName,
  title,
  min,
  max,
  lines,
  extras,
  date = new Date(),
}: {
  businessName: string;
  title: string;
  min: number;
  max: number;
  lines: readonly EstimateLine[];
  extras: readonly EstimateExtra[];
  date?: Date;
}) {
  return (
    <div className="mt-4">
      <section data-print-estimate="" aria-label="Your estimate" className="rounded-md border border-border p-5 text-left">
        <p className="eyebrow">{businessName}</p>
        <h3 className="mt-1 font-display text-[18px] font-semibold">{title}</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Prepared {date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
        <dl className="mt-4 space-y-2 text-[14px]">
          {lines.map((line) => (
            <div key={line.question} className="flex flex-wrap justify-between gap-x-4 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">{line.question}</dt>
              <dd className="font-medium">{line.answer}</dd>
            </div>
          ))}
          {extras.map((extra) => (
            <div key={extra.label} className="flex flex-wrap justify-between gap-x-4 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">Extra: {extra.label}</dt>
              <dd className="tnum font-medium">+{currency(extra.price)}</dd>
            </div>
          ))}
        </dl>
        <p className="tnum mt-4 font-display text-[22px] font-semibold">
          Estimated range: {currency(min)} – {currency(max)}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          This is an estimate based on the options above, not a quote or contract. {businessName} confirms the final price before any work starts.
        </p>
      </section>
      <Button type="button" variant="outline" className="print-hide mt-3 min-h-11" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden="true" /> Print or save as PDF
      </Button>
    </div>
  );
}
