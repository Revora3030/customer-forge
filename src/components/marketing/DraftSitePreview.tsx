import { Check } from "lucide-react";

export type DraftPreviewInput = {
  businessName: string;
  businessType: string;
  city: string;
  state?: string;
  services?: string;
};

/** Split a free-text services answer into at most six short, trimmed items. */
export function draftServiceList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter((item) => item.length > 0 && item.length <= 60)
    .slice(0, 6);
}

/** "Raleigh, NC" / "Raleigh" — only what the visitor typed. */
export function draftLocation(city: string, state?: string): string {
  return [city.trim(), (state ?? "").trim()].filter(Boolean).join(", ");
}

/**
 * Free, illustrative draft of a visitor's website, built in the browser from
 * the three answers they just gave. It states nothing beyond those answers:
 * no reviews, counts, ratings or results. The real site is built later from
 * the full details in the website builder.
 */
export function DraftSitePreview({ businessName, businessType, city, state, services }: DraftPreviewInput) {
  const name = businessName.trim() || "Your business";
  const type = businessType.trim();
  const location = draftLocation(city, state);
  const serviceList = draftServiceList(services);
  return (
    <figure
      aria-label={`Draft website preview for ${name}`}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-2 truncate rounded bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          yourbusiness.com
        </span>
      </div>
      <div className="bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="min-w-0 truncate font-display text-[15px] font-semibold">{name}</p>
          <span className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
            Contact
          </span>
        </div>
        <div className="px-4 py-8 text-center sm:py-10">
          <h3 className="font-editorial text-balance text-[clamp(1.25rem,4vw,1.75rem)] leading-tight">
            {type ? `${name}: ${type}` : name}
            {location ? ` in ${location}` : ""}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-muted-foreground">
            {location
              ? `Serving ${location}. Tell us what you need.`
              : "Tell us what you need."}
          </p>
          <span className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground">
            Request a quote
          </span>
        </div>
        <div className="border-t border-border px-4 py-5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
          {serviceList.length ? (
            <ul className="mt-2 grid gap-1.5 text-[13px] sm:grid-cols-2">
              {serviceList.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Your services go here. Add them in the website builder after you sign up.
            </p>
          )}
        </div>
        <div className="grid gap-3 border-t border-border px-4 py-5 text-[13px] sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
            <p className="mt-1 text-muted-foreground">Your phone, email and hours go here.</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Photos</p>
            <p className="mt-1 text-muted-foreground">Your own photos go here.</p>
          </div>
        </div>
      </div>
      <figcaption className="border-t border-border bg-muted/40 px-4 py-2 text-[12px] text-muted-foreground">
        Draft preview, for illustration only. Your real site is built from your details and you can edit
        everything in the builder.
      </figcaption>
    </figure>
  );
}
