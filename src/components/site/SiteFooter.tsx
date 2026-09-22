import { Mail, MapPin, Phone } from "lucide-react";
import { SitePageLink } from "@/components/site/site-links";
import { businessFacts } from "@/lib/builder/facts";
import { safeLinkUrl } from "@/lib/website-content";
import type { PublicSite } from "@/lib/public-site.functions";

type Site = NonNullable<PublicSite>;

export function SiteFooter({ site }: { site: Site }) {
  const facts = businessFacts(site.profile as Record<string, unknown> | null, site.org.name);
  const social = site.social;
  const socials = [
    ["Google", social?.google_business],
    ["Facebook", social?.facebook],
    ["Instagram", social?.instagram],
  ].map(([label, value]) => ({ label, href: safeLinkUrl(value ?? null) })).filter((item) => item.href);

  return (
    <footer className="rv-site-footer border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.25fr_0.75fr_0.75fr]">
        <div>
          <p className="font-display text-[24px] font-semibold">{site.org.name}</p>
          {site.profile?.tagline ? <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">{site.profile.tagline}</p> : null}
          <div className="mt-6 space-y-2 text-[13px] text-muted-foreground">
            {facts.phoneHref && facts.phone ? <a className="flex items-center gap-2" href={facts.phoneHref}><Phone className="size-3.5" />{facts.phone}</a> : null}
            {facts.emailHref && facts.email ? <a className="flex items-center gap-2" href={facts.emailHref}><Mail className="size-3.5" />{facts.email}</a> : null}
            {(facts.serviceArea ?? facts.city) ? <p className="flex items-center gap-2"><MapPin className="size-3.5" />{facts.serviceArea ?? facts.city}</p> : null}
          </div>
        </div>
        <nav aria-label="Footer pages">
          <p className="eyebrow">Explore</p>
          <div className="mt-4 grid gap-3 text-[13px] text-muted-foreground">
            <SitePageLink slug={site.org.slug}>Home</SitePageLink>
            {site.nav.filter((item) => item.slug !== "home" && item.kind !== "thanks").slice(0, 8).map((item) => (
              <SitePageLink key={item.slug} slug={site.org.slug} page={item.slug}>{item.title}</SitePageLink>
            ))}
          </div>
        </nav>
        {socials.length ? (
          <div>
            <p className="eyebrow">Connect</p>
            <div className="mt-4 grid gap-3 text-[13px] text-muted-foreground">
              {socials.map((item) => <a key={item.label} href={item.href!} rel="noopener noreferrer">{item.label}</a>)}
            </div>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-[13px] text-muted-foreground">
        © {new Date().getFullYear()} {site.org.name}{facts.city ? ` · ${facts.city}` : ""}
      </div>
    </footer>
  );
}