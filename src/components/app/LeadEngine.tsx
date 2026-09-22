/**
 * Lead engine audit — scores the current website structure on whether it can
 * actually generate enquiries, and lays out every page a local business needs
 * in one action.
 */
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { leadEngineAudit, PAGE_LIBRARY } from "@/lib/website-content";

export function LeadEngine({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const { data: pages = [], isLoading } = useWebsiteContent(organizationId);
  const audit = leadEngineAudit(pages);

  const tone = audit.score >= 85 ? "signal" : audit.score >= 60 ? "attention" : "danger";

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Lead engine</p>
          <h2 className="mt-1 font-display text-[19px] font-semibold">
            Is your website built to bring in work?
          </h2>
          <p className="mt-1.5 max-w-xl text-[13px] text-muted-foreground">
            Revora checks the pages and blocks that actually produce enquiries. Anything missing is
            listed with the reason it matters.
          </p>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-[30px] leading-none font-semibold">{audit.score}</p>
          <Pill tone={tone}>out of 100</Pill>
        </div>
      </div>

      {canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <p className="text-[12px] text-muted-foreground">
            Ask for any of these in the builder chat — service pages, area pages, pricing, booking,
            proof, FAQ, contact, thank-you and privacy. Revora's design team writes each one.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-6 text-[13px] text-muted-foreground">Checking your structure…</p>
      ) : (
        <ul className="mt-6 grid gap-2 md:grid-cols-2">
          {audit.items.map((item) => (
            <li
              key={item.key}
              className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                  item.ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                }`}
              >
                {item.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{item.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {item.ok ? item.why : item.fix}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
