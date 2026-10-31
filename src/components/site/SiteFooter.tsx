import { pageNavLabel } from "@/lib/website-content";
import { CalendarCheck, Clock, Mail, MapPin, Phone } from "lucide-react";
import { SitePageLink } from "@/components/site/site-links";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { safeLinkUrl } from "@/lib/website-content";
import { bookingLinkFromHours } from "@/lib/booking-link";
import type { PublicSite } from "@/lib/public-site.functions";

type Site = NonNullable<PublicSite>;

/**
 * `year` is decided once by the caller (the server render) and passed down, so
 * the server and the browser print the same copyright year even when the page
 * is opened across midnight on New Year's Eve.
 */
export function SiteFooter({ site, year }: { site: Site; year?: number }) {
  const copyrightYear = year ?? new Date().getFullYear();
  const facts = businessFacts(site.profile as Record<string, unknown> | null, site.org.name);
  const address = factsAddressLine(facts);
  const bookingHref = bookingLinkFromHours((site.profile as { hours?: unknown } | null)?.hours);
  const social = site.social;
  const socials = [
    ["Google", social?.google_business],
    ["Facebook", social?.facebook],
    ["Instagram", social?.instagram],
    ["YouTube", social?.youtube],
    ["TikTok", social?.tiktok],
    ["LinkedIn", social?.linkedin],
  ].map(([label, value]) => ({ label, href: safeLinkUrl(value ?? null) })).filter((item) => item.href);

  return (
    <footer className="rv-site-footer border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.25fr_0.75fr_0.75fr]">
        <div>
          <p className="font-display text-[24px] font-semibold">{site.org.name}</p>
          {site.profile?.tagline ? <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">{site.profile.tagline}</p> : null}
          <div className="mt-6 space-y-2 text-[14px] text-muted-foreground">
            {facts.phoneHref && facts.phone ? <a className="flex items-center gap-2 min-h-11 py-2" href={facts.phoneHref}><Phone className="size-3.5" />{facts.phone}</a> : null}
            {facts.emailHref && facts.email ? <a className="flex items-center gap-2 min-h-11 py-2" href={facts.emailHref}><Mail className="size-3.5" />{facts.email}</a> : null}
            {address ? <p className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0" />{address}</p> : null}
            {facts.serviceArea ? <p className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0" />{facts.serviceArea}</p> : null}
            {facts.hours ? <p className="flex items-start gap-2"><Clock className="mt-0.5 size-3.5 shrink-0" /><span>{facts.hours}</span></p> : null}
            {bookingHref ? <a className="flex items-center gap-2 min-h-11 py-2 text-foreground underline decoration-primary decoration-2 underline-offset-4" href={bookingHref} target="_blank" rel="noopener noreferrer" data-testid="book-online"><CalendarCheck className="size-3.5" />Book online</a> : null}
          </div>
        </div>
        <nav aria-label="Footer pages">
          <p className="eyebrow">Explore</p>
          <div className="mt-4 grid gap-1 text-[14px] text-muted-foreground">
            <SitePageLink slug={site.org.slug} className="inline-flex min-h-11 items-center py-2">Home</SitePageLink>
            {site.nav.filter((item) => item.slug !== "home" && item.kind !== "thanks").slice(0, 8).map((item) => (
              <SitePageLink key={item.slug} slug={site.org.slug} page={item.slug} className="inline-flex min-h-11 items-center py-2">{pageNavLabel(item.title, site.org.name, item.slug)}</SitePageLink>
            ))}
          </div>
        </nav>
        {socials.length ? (
          <div>
            <p className="eyebrow">Connect</p>
            <div className="mt-4 grid gap-1 text-[14px] text-muted-foreground">
              {socials.map((item) => <a key={item.label} className="inline-flex min-h-11 items-center py-2" href={item.href!} target="_blank" rel="noopener noreferrer">{item.label}</a>)}
            </div>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-[14px] text-muted-foreground">
        © <span suppressHydrationWarning>{copyrightYear}</span> {site.org.name}{facts.city ? ` · ${facts.city}` : ""}
      </div>
    </footer>
  );
}