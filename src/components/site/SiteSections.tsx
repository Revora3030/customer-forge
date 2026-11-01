import { resolveSiteHref } from "@/lib/builder/site-chrome";
import { imageAltBase } from "@/lib/client-seo-guard";
import { useOwnAddress, useSiteBase } from "@/components/site/use-own-address";
/**
 * Renders the builder's structured sections on a public business website.
 *
 * Every block is driven by data the business entered — nothing here invents
 * claims. Lead-capture blocks (quote, booking, sticky call bar) render the same
 * forms used on the home page, so any page can convert a visitor.
 */
import { usePreviewMode } from "@/components/site/preview-mode-context";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { readComposition, type CompositionNode, type WidgetPresentation } from "@/lib/builder/composition-tree";
import { legacySectionToComposition } from "@/lib/builder/legacy-composition";
import { blockCss, readBlockStyle, readComponentVisual } from "@/lib/site-style";
import { premiumSurface } from "@/lib/site-theme";
import { lightSectionColor, studioLightVars, studioSectionColor, STUDIO_CANVAS, type StudioLight } from "@/lib/builder/studio-canvas";
import { readSectionEffect, sectionFxClassName } from "@/lib/site-effects";
import { SitePageLink } from "@/components/site/site-links";
import { CalendarCheck, Mail, MapPin, Phone } from "lucide-react";
import { bookingLinkFromHours } from "@/lib/booking-link";
import { BookingForm, EnquiryForm, QuoteCalculator } from "@/components/site/SiteForms";
import { DirectContact } from "@/components/site/ContactDetails";
import { ContactMap } from "@/components/site/ContactMap";
import { ConsentFrame } from "@/components/site/ConsentFrame";
import { ReviewWall, ServiceMenu } from "@/components/site/LiveBlocks";
import { ServiceEstimator } from "@/components/site/ServiceEstimator";
import { offerFactsFor } from "@/components/site/live-blocks-utils";
import type { PublicSite } from "@/lib/public-site.functions";
import { readCustomBlock } from "@/lib/builder/custom-block";
import { CustomBlock } from "@/components/site/CustomBlock";
import { safeLinkUrl, sectionLabel } from "@/lib/website-content";
import { embedProviderLabel, readEmbed } from "@/lib/site-embed";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { faqFactsFor } from "@/lib/builder/faq-from-facts";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { addressAddsDetail, distinctServiceArea, sectionSurface, serviceAreaPhrase, siteSurface } from "@/components/site/site-sections-utils";
import { TradeCalculator } from "@/components/site/TradeCalculator";
import { readTradeCalculator } from "@/lib/trade-calculator";
import { useNextHolidayClosure } from "@/components/site/use-holiday-closures";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];

const Shell = ({
  children,
  wide = false,
  id,
}: {
  children: React.ReactNode;
  wide?: boolean;
  id?: string | undefined;
}) => (
  <section id={id} className="scroll-mt-20 border-b border-border" style={{ minWidth: 0, maxWidth: "100%", overflowX: "clip" }}>
    <div
      className={`mx-auto w-full min-w-0 px-4 ${wide ? "max-w-6xl" : "max-w-3xl"}`}
      style={{
        paddingBlock: "calc(3.5rem * var(--site-space, 1))",
        paddingInlineStart: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingInlineEnd: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {children}
    </div>
  </section>
);

/**
 * Section copy, render-safe. Anything unfinished — stored data instead of
 * words, a template instruction, an empty value — is dropped rather than shown.
 */
const Heading = ({ section, lead = false }: { section: Section; lead?: boolean }) => {
  const heading = safeText(section.heading);
  const subheading = safeText(section.subheading);
  const body = safeParagraph(section.body);
  // The first drawn section on a page carries the page's main headline (h1)
  // unless an AI layout already provides one; every page needs exactly one.
  const Tag = lead ? "h1" : "h2";
  return (
    <>
      {heading ? (
        <Tag className="font-display text-[28px] leading-tight font-semibold">{heading}</Tag>
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
 * The owner's own block edits still apply, and the AI-authored section effect
 * (settings.effect) is drawn as a bounded, reduced-motion-safe class.
 */
export function SiteSection({ site, section, lead = false, first = false, studio = false, studioCanvas = STUDIO_CANVAS, preparedRoot = null, light = null, seam = false }: { site: Site; section: Section; lead?: boolean; first?: boolean; studio?: boolean; studioCanvas?: string; preparedRoot?: CompositionNode | null; /** Light half of a dark-to-light studio page (quality bar #22). */ light?: StudioLight | null; /** First light section: draws the one dark-to-light seam above it. */ seam?: boolean }) {
  const block = readBlockStyle(section.settings);
  // A section's own background (set from the builder) wins over the page
  // surface. Mid-grey washes are corrected to a clean tint or deep shade, the
  // same way the page surface is, so no section ships as dull grey. A studio
  // page then pulls any remaining light band back onto the obsidian canvas.
  const corrected = block.bgColor && /^#[0-9a-f]{6}$/i.test(block.bgColor) && !block.bgImage ? premiumSurface(block.bgColor) : null;
  const ownBg = light ? lightSectionColor(corrected, light) : studioSectionColor(corrected, studio, studioCanvas);
  const css = blockCss(ownBg ? { ...block, bgColor: ownBg } : block, siteSurface(site));
  // In-page anchors for buttons like "#contact" or "#services": the section's
  // role (kept when it became an AI layout) or its kind.
  const storedRole = (section.settings as Record<string, unknown> | null)?.["role"];
  const role = typeof storedRole === "string" && /^[a-z][a-z0-9_-]{0,40}$/.test(storedRole) ? storedRole : section.kind;
  const anchor = role && role !== "composition" ? role.replace(/_/g, "-") : undefined;
  const fx = sectionFxClassName(readSectionEffect(section.settings));
  // The opening hero fills most of the first screen (never more than 720px) with its content centred,
  // so a short text hero no longer reads as a cramped strip above the fold.
  const heroFrame = first && (role === "hero" || section.kind === "hero");
  const lightStyle = light ? { ...studioLightVars(light), backgroundColor: ownBg ?? light.canvas, color: light.ink } : null;
  return (
    <>
    {seam && light ? (
      <div
        aria-hidden="true"
        data-studio-seam=""
        style={{ height: "clamp(56px, 9vw, 140px)", background: `linear-gradient(180deg, ${light.dark} 0%, ${light.canvas} 100%)` }}
      />
    ) : null}
    <div
      id={anchor}
      data-rvb={section.id}
      data-rvb-kind={section.kind}
      data-rvb-label={sectionLabel(section.kind)}
      className={[
        "rv-site-section scroll-mt-20",
        heroFrame ? "flex min-h-[min(720px,85vh)] flex-col justify-center" : "",
        fx ?? "",
      ].filter(Boolean).join(" ")}
      data-rv-hero={heroFrame ? "" : undefined}
      data-studio-light={light ? "" : undefined}
      style={{ ...css, ...(lightStyle ?? {}), minWidth: 0, maxWidth: "100%" }}
    >
      <SiteSectionBody site={site} section={section} lead={lead} first={first} surface={light ? (ownBg ?? light.canvas) : studio ? (ownBg ?? studioCanvas) : ownBg} preparedRoot={preparedRoot} />
    </div>
    </>
  );
}

function SiteSectionBody({ site, section, lead = false, first = false, surface = null, preparedRoot = null }: { site: Site; section: Section; lead?: boolean; first?: boolean; surface?: string | null; preparedRoot?: CompositionNode | null }) {
  const components = section.components ?? [];
  const { profile, org } = site;
  const ownAddress = useOwnAddress();
  const previewBase = useSiteBase();
  // Element-level picking and inline edits exist only for SAVED AI layouts in
  // the owner's draft preview (a legacy translation has no tree to write to).
  const editable = usePreviewMode() && readComposition(section.settings) !== null;

  // Any valid AI composition wins over the legacy kind, so AI designs are never hidden.
  // Older plain sections (built before every section carried an AI layout, or
  // left behind by an interrupted build) are translated into a composition
  // tree from their own saved words and pictures, so every content section
  // renders through the same CompositionRenderer — there is no second,
  // hard-coded template engine.
  const storedTree = preparedRoot
    ? { version: 1 as const, root: preparedRoot }
    : readComposition(section.settings) ?? legacySectionToComposition(section, { lead, seed: org.slug });
  const kind = storedTree ? "composition" : section.kind;
  // Owner-entered finance / ROI / price-range figures (quality bar #14). The
  // existing estimator stays the default view; extra views appear only when
  // the owner supplied their data.
  const ownerCalculator = readTradeCalculator(section.settings);
  const withOwnerCalculator = (estimator: React.ReactNode, presentation?: WidgetPresentation): React.ReactNode =>
    ownerCalculator ? (
      <TradeCalculator data={ownerCalculator} businessName={site.org.name} estimator={estimator} {...(presentation ? { presentation } : {})} />
    ) : estimator;

  switch (kind) {
    case "composition": {
      const tree = storedTree;
      const media = new Map(components.map((component) => [component.id, {
        url: component.url,
        visual: readComponentVisual(component.settings),
      }]));
      return tree ? (
        <CompositionRenderer
          tree={tree}
          altBase={imageAltBase({ name: org.name, industry: org.industry ?? null, city: profile?.city ?? null })}
          scope={`s-${section.id}`}
          editable={editable}
          surface={sectionSurface(site, readBlockStyle(section.settings).bgColor)}
          eagerFirstMedia={first}
          heroVideo={first ? (site.heroVideo ?? null) : null}
          resolveMedia={(ref) => media.get(ref) ?? null}
          resolveHref={(href) => resolveSiteHref(href, org.slug, ownAddress, null, null, previewBase)}
          resolveOffer={(service) => offerFactsFor(site.services ?? [], service)}
          faqFacts={faqFactsFor({ profile, businessName: org.name, services: site.services ?? [], quote: Boolean(site.quote), generation: site.settings?.generation })}
          resolveWidget={(name, presentation?: WidgetPresentation) => {
            if (name === "booking_form") return <BookingForm site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "quote_calculator")
              return withOwnerCalculator(site.quote ? <QuoteCalculator site={site} {...(presentation ? { presentation } : {})} /> : null, presentation);
            if (name === "contact_details")
              return (
                <>
                  <ContactFacts site={site} {...(presentation ? { presentation } : {})} />
                  <ContactMap site={site} />
                </>
              );
            if (name === "enquiry_form") return <EnquiryForm site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "service_menu") return <ServiceMenu site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "service_estimator")
              return withOwnerCalculator(<ServiceEstimator site={site} {...(presentation ? { presentation } : {})} />, presentation);
            if (name === "review_wall") return <ReviewWall site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "direct_contact")
              return <DirectContact profile={profile} businessName={site.org.name} label={presentation?.contactLabel ?? presentation?.title ?? `Call or email ${site.org.name} directly`} {...(presentation ? { presentation } : {})} />;
            return null;
          }}
        />
      ) : null;
    }
    case "quote":
      if (!site.quote && !ownerCalculator) return null;
      return (
        <Shell wide id="quote">
          <Heading section={section} lead={lead} />
          <div className="mt-8">
            {withOwnerCalculator(site.quote ? <QuoteCalculator site={site} /> : null)}
          </div>
        </Shell>
      );

    case "booking":
      return (
        <Shell wide id="book">
          <Heading section={section} lead={lead} />
          <div className="mt-8">
            <BookingForm site={site} />
          </div>
        </Shell>
      );

    case "contact": {
      // Every value here is validated first: an unusable phone number, a broken
      // email address or unreadable hours are hidden rather than rendered.
      return (
        <Shell id="contact">
          <Heading section={section} lead={lead} />
          <div className="mt-7"><ContactFacts site={site} /></div>
          <ContactMap site={site} />
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
          <Heading section={section} lead={lead} />
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
            <Heading section={section} lead={lead} />
          ) : null}
          <div
            className="rv-embed-frame mt-6 overflow-hidden rounded-lg border border-border bg-background"
            style={{ height: embed.height }}
          >
            <ConsentFrame
              provider={embedProviderLabel(embed.url) ?? "another website"}
              openHref={embed.url}
              openLabel={`Open ${embed.title} in a new tab`}
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
            </ConsentFrame>
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
          {section.heading || section.subheading || section.body ? <Heading section={section} lead={lead} /> : null}
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

/** Verified contact facts only: unusable phone/email/hours are hidden, never rendered. */
function ContactFacts({ site, presentation }: { site: Site; presentation?: WidgetPresentation }) {
  const facts = businessFacts(site.profile as Record<string, unknown> | null, site.org.name);
  const nextClosure = useNextHolidayClosure((site.profile as { hours?: unknown } | null)?.hours ?? null);
  const bookingHref = bookingLinkFromHours((site.profile as { hours?: unknown } | null)?.hours);
  const rawAddress = factsAddressLine(facts);
  const rawArea = distinctServiceArea(facts.serviceArea ?? facts.city, rawAddress);
  // A city-only "address" that the service area already names is dropped.
  const addressLine = addressAddsDetail(rawAddress, rawArea) ? rawAddress : null;
  const area = serviceAreaPhrase(rawArea);
  // Nothing real to show → render nothing, never an empty styled box.
  if (!(facts.phone && facts.phoneHref) && !(facts.email && facts.emailHref) && !area && !addressLine && !facts.hours && !bookingHref) return null;
  return (
          <div className="space-y-3 text-left">
            {presentation?.eyebrow ? <p className="eyebrow">{presentation.eyebrow}</p> : null}
            {presentation?.title ? <h3 className="font-display text-[19px] font-semibold">{presentation.title}</h3> : null}
            {presentation?.description ? <p className="text-[14px] text-muted-foreground">{presentation.description}</p> : null}
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
            {facts.phone && facts.phoneHref ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden="true" /> {presentation?.fieldLabels?.phone ?? "Phone"}
                </dt>
                <dd className="mt-1 text-[14px]">
                  <a href={facts.phoneHref} className="text-foreground underline decoration-primary decoration-2 underline-offset-4">
                    {facts.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {facts.email && facts.emailHref ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden="true" /> {presentation?.fieldLabels?.email ?? "Email"}
                </dt>
                <dd className="mt-1 text-[14px]">
                  <a href={facts.emailHref} className="text-foreground underline decoration-primary decoration-2 underline-offset-4">
                    {facts.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {area ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" /> {addressLine ? "Service area" : presentation?.fieldLabels?.location ?? "Area"}
                </dt>
                <dd className="mt-1 text-[14px]">{area}</dd>
              </div>
            ) : null}
            {addressLine ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" /> {presentation?.fieldLabels?.location ?? "Address"}
                </dt>
                <dd className="mt-1 text-[14px]">{addressLine}</dd>
              </div>
            ) : null}
            {bookingHref ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <CalendarCheck className="size-3.5" aria-hidden="true" /> Bookings
                </dt>
                <dd className="mt-1 text-[14px]">
                  <a href={bookingHref} target="_blank" rel="noopener noreferrer" data-testid="book-online" className="text-foreground underline decoration-primary decoration-2 underline-offset-4">
                    Book online
                  </a>
                </dd>
              </div>
            ) : null}
            {facts.hours ? (
              <div className="sm:col-span-full">
                <dt className="eyebrow">{presentation?.fieldLabels?.time ?? "Hours"}</dt>
                <dd className="mt-1 text-[14px]">
                  {/* One line per day; a time range never breaks mid-range ("9:00 AM – 5:00 / PM"). */}
                  {facts.hours.split("\n").map((line, index) => (
                    <span key={index} className="block whitespace-nowrap">
                      {line}
                    </span>
                  ))}
                  {nextClosure ? (
                    <span className="mt-1 block text-muted-foreground" data-testid="holiday-closure">
                      {nextClosure}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            </dl>
          </div>
  );
}
