import { resolveSiteHref } from "@/lib/builder/site-chrome";
import { useOwnAddress } from "@/components/site/site-links";
/**
 * Renders the builder's structured sections on a public business website.
 *
 * Every block is driven by data the business entered — nothing here invents
 * claims. Lead-capture blocks (quote, booking, sticky call bar) render the same
 * forms used on the home page, so any page can convert a visitor.
 */
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { readComposition } from "@/lib/builder/composition-tree";
import { blockCss, readBlockStyle } from "@/lib/site-style";
import { SitePageLink } from "@/components/site/site-links";
import { Mail, MapPin, Phone } from "lucide-react";
import { BookingForm, QuoteCalculator } from "@/components/site/SiteForms";
import { DirectContact } from "@/components/site/ContactDetails";
import type { PublicSite } from "@/lib/public-site.functions";
import { readCustomBlock } from "@/lib/builder/custom-block";
import { CustomBlock } from "@/components/site/CustomBlock";
import { safeLinkUrl, sectionLabel } from "@/lib/website-content";
import { readEmbed } from "@/lib/site-embed";
import { readSectionEffect, sectionEffectClass } from "@/lib/site-effects";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { phoneDisplay, phoneLink, safeParagraph, safeText } from "@/lib/builder/presentation";
import { Button } from "@/components/ui/button";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];

/**
 * The colour a block sits on when it sets no background of its own — the
 * client's chosen surface colour. Passed to the style layer so AI text colours
 * are measured against the page they actually land on.
 */
export function siteSurface(site: Site): string | null {
  const profile = (site.profile ?? null) as { secondary_color?: string | null } | null;
  const surface = profile?.secondary_color;
  return typeof surface === "string" && surface.trim() ? surface.trim() : null;
}

const Shell = ({
  children,
  wide = false,
  id,
}: {
  children: React.ReactNode;
  wide?: boolean;
  id?: string;
}) => (
  <section id={id} className="scroll-mt-20 border-b border-border">
    <div className={`mx-auto px-4 py-14 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</div>
  </section>
);

/**
 * Section copy, render-safe. Anything unfinished — stored data instead of
 * words, a template instruction, an empty value — is dropped rather than shown.
 */
const Heading = ({ section }: { section: Section }) => {
  const heading = safeText(section.heading);
  const subheading = safeText(section.subheading);
  const body = safeParagraph(section.body);
  return (
    <>
      {heading ? (
        <h2 className="font-display text-[28px] leading-tight font-semibold">{heading}</h2>
      ) : null}
      {subheading ? <p className="mt-2 text-[15px] text-muted-foreground">{subheading}</p> : null}
      {body ? (
        <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-muted-foreground">
          {body}
        </p>
      ) : null}
    </>
  );
};

/**
 * Public section renderer. Only AI-designed layouts and working features
 * render; no built-in variant, style family or layout class is applied.
 * The owner's own block edits and chosen movement effect still apply.
 */
export function SiteSection({ site, section }: { site: Site; section: Section }) {
  const effect = readSectionEffect(section.settings);
  const css = blockCss(readBlockStyle(section.settings), siteSurface(site));
  const body = (
    <div data-rvb={section.id} data-rvb-kind={section.kind} data-rvb-label={sectionLabel(section.kind)} style={css}>
      <SiteSectionBody site={site} section={section} />
    </div>
  );
  if (effect === "none") return body;
  return <div className={sectionEffectClass(effect)}>{body}</div>;
}

function SiteSectionBody({ site, section }: { site: Site; section: Section }) {
  const components = section.components ?? [];
  const { profile, org } = site;
  const ownAddress = useOwnAddress();

  switch (section.kind) {
    case "composition": {
      const tree = readComposition(section.settings);
      const media = new Map(components.map((component) => [component.id, component.url]));
      return tree ? (
        <CompositionRenderer
          tree={tree}
          scope={`s-${section.id}`}
          resolveMedia={(ref) => media.get(ref) ?? null}
          resolveHref={(href) => resolveSiteHref(href, org.slug, ownAddress)}
        />
      ) : null;
    }
    case "quote":
      if (!site.quote) return null;
      return (
        <Shell wide id="quote">
          <Heading section={section} />
          <div className="mt-8">
            <QuoteCalculator site={site} />
          </div>
        </Shell>
      );

    case "booking":
      return (
        <Shell wide id="book">
          <Heading section={section} />
          <div className="mt-8">
            <BookingForm site={site} />
          </div>
        </Shell>
      );

    case "contact": {
      // Every value here is validated first: an unusable phone number, a broken
      // email address or unreadable hours are hidden rather than rendered.
      const facts = businessFacts(profile as Record<string, unknown> | null, site.org.name);
      const addressLine = factsAddressLine(facts);
      const area = facts.serviceArea ?? facts.city;
      return (
        <Shell id="contact">
          <Heading section={section} />
          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
            {facts.phone && facts.phoneHref ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden="true" /> Phone
                </dt>
                <dd className="mt-1 text-[14px]">
                  <a href={facts.phoneHref} className="text-primary underline">
                    {facts.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {facts.email && facts.emailHref ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden="true" /> Email
                </dt>
                <dd className="mt-1 text-[14px]">
                  <a href={facts.emailHref} className="text-primary underline">
                    {facts.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {area ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" /> Area
                </dt>
                <dd className="mt-1 text-[14px]">{area}</dd>
              </div>
            ) : null}
            {addressLine ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" /> Address
                </dt>
                <dd className="mt-1 text-[14px]">{addressLine}</dd>
              </div>
            ) : null}
            {facts.hours ? (
              <div>
                <dt className="eyebrow">Hours</dt>
                <dd className="mt-1 whitespace-pre-line text-[14px]">{facts.hours}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6">
            <DirectContact
              profile={profile}
              businessName={site.org.name}
              label={`Call or email ${site.org.name} directly`}
            />
          </div>
        </Shell>
      );
    }

    case "sticky_cta":
      return null; // rendered once, fixed to the viewport

    // Every article page this site has, newest layout order first. Pages with no
    // readable name are skipped, so a half-written article never shows up.
    case "post_list": {
      const posts = (site.nav ?? [])
        .filter((item) => item.kind === "post")
        .map((item) => ({ slug: item.slug, title: safeText(item.title) }))
        .filter((item): item is { slug: string; title: string } => !!item.title && !!item.slug);
      const manual = components.filter((item) => safeText(item.label));
      if (!posts.length && !manual.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <ul className="rv-post-list mt-8 grid gap-3 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.slug}>
                <SitePageLink
                  slug={org.slug}
                  page={post.slug}
                  className="block min-h-11 rounded-lg border border-border p-4 text-[14px] font-medium hover:border-primary"
                >
                  {post.title}
                </SitePageLink>
              </li>
            ))}
            {posts.length
              ? null
              : manual.map((item) => (
                  <li key={item.id}>
                    {safeLinkUrl(item.link_url)?.startsWith("/") ? (
                      <SitePageLink
                        slug={org.slug}
                        page={safeLinkUrl(item.link_url)!.slice(1)}
                        className="block min-h-11 rounded-lg border border-border p-4 text-[14px] font-medium hover:border-primary"
                      >
                        {safeText(item.label)}
                      </SitePageLink>
                    ) : (
                      <span className="block rounded-lg border border-border p-4 text-[14px] font-medium">
                        {safeText(item.label)}
                      </span>
                    )}
                  </li>
                ))}
          </ul>
        </Shell>
      );
    }

    // A tool the business already uses — map, booking widget, video. Only an
    // allowlisted https URL is ever framed, and it runs sandboxed.
    case "embed": {
      const embed = readEmbed({ settings: section.settings, body: section.body });
      if (!embed) return null;
      return (
        <Shell wide>
          {safeText(section.heading) || safeText(section.subheading) ? (
            <Heading section={section} />
          ) : null}
          <div
            className="rv-embed-frame mt-6 overflow-hidden rounded-lg border border-border bg-background"
            style={{ height: embed.height }}
          >
            <iframe
              src={embed.url}
              title={embed.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="fullscreen; clipboard-write; payment"
              className="size-full border-0"
            />
          </div>
        </Shell>
      );
    }

    // A custom interactive block the builder created for this business.
    // Data-only spec, rendered by trusted components; an invalid spec renders
    // nothing rather than a broken section.
    case "custom": {
      const parsed = readCustomBlock(section.settings);
      if (!parsed) return null;
      // The section heading and the block title often say the same thing. Show
      // it once rather than stacking the same words twice.
      const sameTitle =
        typeof parsed.title === "string" &&
        typeof section.heading === "string" &&
        parsed.title.trim().toLowerCase() === section.heading.trim().toLowerCase();
      let spec = parsed;
      if (sameTitle) {
        const { title: _omitted, ...rest } = parsed;
        spec = rest as typeof parsed;
      }
      return (
        <Shell wide>
          {section.heading || section.subheading || section.body ? <Heading section={section} /> : null}
          <div className="mt-2">
            <CustomBlock spec={spec} />
          </div>
        </Shell>
      );
    }

    default:
      // Only AI-designed layouts and working features render; there is no
      // built-in layout for anything else.
      return null;
  }
}

/**
 * Always-visible call and action buttons — most local traffic is on a phone.
 * "Call" only appears when the saved number is actually callable, and the safe
 * area inset keeps the bar clear of the iPhone home indicator.
 */
export function StickyCallBar({ site, label }: { site: Site; label: string }) {
  const phoneHref = phoneLink(site.profile?.phone);
  const phone = phoneDisplay(site.profile?.phone);
  const target = site.quote ? "#quote" : site.nav.some((item) => item.slug === "book") ? "book" : "contact";
  const safeLabel = label.trim();
  if (!phoneHref && !safeLabel) return null;
  return (
    <div
      className="sticky bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex gap-2">
        {phoneHref ? (
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <a href={phoneHref} aria-label={`Call ${site.org.name}${phone ? ` at ${phone}` : ""}`}>
              <Phone className="size-4" aria-hidden="true" /> Call
            </a>
          </Button>
        ) : null}
        {safeLabel ? (
          <Button asChild variant="signal" className="min-h-11 flex-1">
            <SitePageLink slug={site.org.slug} page={target}>{safeLabel}</SitePageLink>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
