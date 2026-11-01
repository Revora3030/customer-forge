/**
 * The generated privacy and cookie notice of a published client website
 * (`/privacy-notice` on its own domain, `/s/<slug>/privacy-notice` on the
 * platform address). Text comes from src/lib/client-privacy-notice.ts, built
 * only from facts the owner entered and what the site code does. It runs no
 * tracking of its own. A page the owner builds with the same address replaces it.
 *
 * Review with a lawyer before relying on this.
 */
import { readPrivacyNoticeDetails } from "@/lib/privacy-notice-details";
import { SitePageLink } from "@/components/site/site-links";
import { useOwnAddress, useSiteBase } from "@/components/site/use-own-address";
import { SiteFontLinks } from "@/components/site/SiteFontLinks";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { mapsEmbedFromSavedLink } from "@/lib/maps-link";
import {
  clientPrivacyNotice,
  PRIVACY_NOTICE_SLUG,
  type ClientNoticeInput,
} from "@/lib/client-privacy-notice";
import { siteFontFor } from "@/lib/site-font-pairings";
import { siteFontsHref, siteFontStyle } from "@/lib/site-theme";
import type { PublicSite } from "@/lib/public-site.functions";

type Site = NonNullable<PublicSite>;

export function noticeInputFromSite(site: Site): ClientNoticeInput {
  const facts = businessFacts(site.profile as Record<string, unknown> | null, site.org.name);
  const font = siteFontFor(site.profile?.font_preference ?? null, site.org);
  return {
    businessName: facts.businessName || null,
    email: facts.email,
    phone: facts.phone,
    address: factsAddressLine(facts),
    hasQuoteForm: Boolean(site.quote),
    hasBooking: (site.services ?? []).some((service) => service.bookable),
    hasMap: Boolean(mapsEmbedFromSavedLink(site.social?.google_business)),
    loadsWebFonts: Boolean(siteFontsHref(font, [])),
    ...readPrivacyNoticeDetails(site.settings?.generation),
  };
}

export function ClientPrivacyNotice({ site }: { site: Site }) {
  const notice = clientPrivacyNotice(noticeInputFromSite(site));
  const font = siteFontFor(site.profile?.font_preference ?? null, site.org);
  return (
    <div
      className="rv-site-root min-h-screen bg-background text-foreground"
      style={{ ...siteFontStyle(font), fontFamily: "var(--font-body, system-ui, sans-serif)" }}
    >
      <SiteFontLinks font={font} />
      <main className="mx-auto max-w-2xl px-4 py-14">
        <p className="text-[14px] font-medium">
          <SitePageLink slug={site.org.slug} className="underline underline-offset-4">
            {site.org.name}
          </SitePageLink>
        </p>
        <h1 className="mt-4 font-display text-[28px] font-semibold">{notice.title}</h1>
        {notice.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="text-[18px] font-semibold">{section.heading}</h2>
            {section.paragraphs.map((text) => (
              <p key={text} className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                {text}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-10 text-[14px]">
          <SitePageLink slug={site.org.slug} className="underline underline-offset-4">
            Back to the home page
          </SitePageLink>
        </p>
      </main>
    </div>
  );
}

/**
 * Small "Privacy and cookies" link shown at the foot of every client page and
 * under each form. A plain anchor (same address rules as SitePageLink) so it
 * also renders outside a router, e.g. in the builder canvas and form tests.
 */
export function ClientPrivacyLink({ slug, className }: { slug: string; className?: string }) {
  const ownAddress = useOwnAddress();
  const previewBase = useSiteBase();
  const href = previewBase
    ? `${previewBase}/${PRIVACY_NOTICE_SLUG}`
    : ownAddress
      ? `/${PRIVACY_NOTICE_SLUG}`
      : `/s/${encodeURIComponent(slug)}/${PRIVACY_NOTICE_SLUG}`;
  return (
    <a href={href} className={className}>
      Privacy and cookies
    </a>
  );
}
