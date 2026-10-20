/**
 * Visible business details: name, email, hours and areas served.
 *
 * Search engines cross-check structured data against what a visitor can
 * actually see on the page, so these values are rendered from the same
 * `BUSINESS` constants that produce the LocalBusiness schema. Changing one
 * changes both — they can never drift apart.
 */
import { Clock, Globe2, Mail, MapPin } from "lucide-react";

import { BUSINESS } from "@/lib/business-identity";
import { revoraMailto, MAIL_SUBJECTS } from "@/lib/brand";
import { trackConversion } from "@/lib/conversion";

const ROWS = [
  {
    icon: Mail,
    label: "Email",
    value: BUSINESS.email,
    href: revoraMailto(MAIL_SUBJECTS.inquiry),
    event: "email" as const,
  },
  {
    icon: Clock,
    label: "Hours",
    value: BUSINESS.hours.display,
    href: null,
    event: null,
  },
  {
    icon: MapPin,
    label: "Based in",
    value: `${BUSINESS.region.name}, USA`,
    href: null,
    event: null,
  },
];

export function BusinessDetails() {
  return (
    <section
      id="business-details"
      aria-labelledby="business-details-heading"
      className="border-t border-border/60 bg-card/30"
    >
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2
          id="business-details-heading"
          className="font-display text-[20px] font-semibold sm:text-[26px]"
        >
          {BUSINESS.legalName}
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-[14px]">
          Built and run by {BUSINESS.founder} from {BUSINESS.region.name}. Reach a real person any
          hour — the growth system itself never stops working.
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROWS.map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-border/60 bg-background/60 p-4"
            >
              <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <row.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {row.label}
              </dt>
              <dd className="mt-2 text-[14px] font-medium">
                {row.href ? (
                  <a
                    href={row.href}
                    className="min-h-[44px] break-words underline-offset-4 hover:underline"
                    onClick={() =>
                      trackConversion("cta_click", {
                        metadata: { placement: "business_details", channel: row.event ?? "" },
                      })
                    }
                  >
                    {row.value}
                  </a>
                ) : (
                  <span className="break-words">{row.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-start gap-2 rounded-xl border border-border/60 bg-background/60 p-4">
          <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Areas served
            </p>
            <p className="mt-1 text-[13px] leading-relaxed sm:text-[14px]">
              {BUSINESS.areasServed.join(" · ")} — remote-built, so a business anywhere can run the
              full system.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
