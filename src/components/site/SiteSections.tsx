import { resolveSiteHref } from "@/lib/builder/site-chrome";
import { useOwnAddress } from "@/components/site/use-own-address";
/**
 * Renders the builder's structured sections on a public business website.
 *
 * Every block is driven by data the business entered — nothing here invents
 * claims. Lead-capture blocks (quote, booking, sticky call bar) render the same
 * forms used on the home page, so any page can convert a visitor.
 */
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { readComposition, type WidgetPresentation } from "@/lib/builder/composition-tree";
import { blockCss, readBlockStyle, readComponentVisual } from "@/lib/site-style";
import { SitePageLink } from "@/components/site/site-links";
import { Mail, MapPin, Phone } from "lucide-react";
import { BookingForm, QuoteCalculator } from "@/components/site/SiteForms";
import { DirectContact } from "@/components/site/ContactDetails";
import { ReviewWall, ServiceMenu } from "@/components/site/LiveBlocks";
import type { PublicSite } from "@/lib/public-site.functions";
import { readCustomBlock } from "@/lib/builder/custom-block";
import { CustomBlock } from "@/components/site/CustomBlock";
import { safeLinkUrl, sectionLabel } from "@/lib/website-content";
import { readEmbed } from "@/lib/site-embed";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { sectionSurface, siteSurface } from "@/components/site/site-sections-utils";

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
 * The owner's own block edits still apply; old named effects are no longer drawn.
 */
export function SiteSection({ site, section, lead = false, first = false }: { site: Site; section: Section; lead?: boolean; first?: boolean }) {
  const css = blockCss(readBlockStyle(section.settings), siteSurface(site));
  // In-page anchors for buttons like "#contact" or "#services": the section's
  // role (kept when it became an AI layout) or its kind.
  const storedRole = (section.settings as Record<string, unknown> | null)?.["role"];
  const role = typeof storedRole === "string" && /^[a-z][a-z0-9_-]{0,40}$/.test(storedRole) ? storedRole : section.kind;
  const anchor = role && role !== "composition" ? role.replace(/_/g, "-") : undefined;
  return (
    <div
      id={anchor}
      data-rvb={section.id}
      data-rvb-kind={section.kind}
      data-rvb-label={sectionLabel(section.kind)}
      className="rv-site-section scroll-mt-20"
      style={{ ...css, minWidth: 0, maxWidth: "100%" }}
    >
      <SiteSectionBody site={site} section={section} lead={lead} first={first} />
    </div>
  );
}

function SiteSectionBody({ site, section, lead = false, first = false }: { site: Site; section: Section; lead?: boolean; first?: boolean }) {
  const components = section.components ?? [];
  const { profile, org } = site;
  const ownAddress = useOwnAddress();

  // Any valid AI composition wins over the legacy kind, so AI designs are never hidden.
  const storedTree = readComposition(section.settings);
  const kind = storedTree ? "composition" : section.kind;

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
          scope={`s-${section.id}`}
          surface={sectionSurface(site, readBlockStyle(section.settings).bgColor)}
          eagerFirstMedia={first}
          resolveMedia={(ref) => media.get(ref) ?? null}
          resolveHref={(href) => resolveSiteHref(href, org.slug, ownAddress)}
          resolveWidget={(name, presentation?: WidgetPresentation) => {
            if (name === "booking_form") return <BookingForm site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "quote_calculator") return site.quote ? <QuoteCalculator site={site} {...(presentation ? { presentation } : {})} /> : null;
            if (name === "contact_details") return <ContactFacts site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "service_menu") return <ServiceMenu site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "review_wall") return <ReviewWall site={site} {...(presentation ? { presentation } : {})} />;
            if (name === "direct_contact")
              return <DirectContact profile={profile} businessName={site.org.name} label={presentation?.contactLabel ?? presentation?.title ?? `Call or email ${site.org.name} directly`} {...(presentation ? { presentation } : {})} />;
            return null;
          }}
        />
      ) : null;
    }
    case "quote":
      if (!site.quote) return null;
      return (
        <Shell wide id="quote">
          <Heading section={section} lead={lead} />
          <div className="mt-8">
            <QuoteCalculator site={site} />
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
          {section.heading || section.subheading || section.body ? <Heading section={section} lead={lead} /> : null}
          <div className="mt-2">
            <CustomBlock spec={spec} />
          </div>
        </Shell>
      );
    }

    // Display safety only, for sites built before every section was required
    // to carry an AI layout. New builds and redesigns stop rather than ship a
    // section without its AI composition, so these are never a design source.
    case "hero":
    case "services":
    case "process":
    case "social_proof":
    case "faq":
    case "home":
    case "page":
    case "story":
    case "values":
    case "service_area": {
      // Older sites only: keeps a pre-existing section readable with the
      // site's own theme tokens until the owner asks the AI team to redesign.
      const images = components.filter((c) => (c.kind === "image" || c.kind === "hero_image") && c.url);
      const buttons = components.filter((c) => c.kind === "button" && safeLinkUrl(c.link_url));
      const cards = components.filter((c) => c.kind === "card");
      const heading = safeText(section.heading);
      const subheading = safeText(section.subheading);
      const body = safeParagraph(section.body);
      const hasContent = heading || subheading || body || cards.length > 0 || images.length > 0;
      if (!hasContent) return null;
      const isHero = section.kind === "hero" || lead;
      const heroImage = images[0];
      const actionRow = buttons.length ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {buttons.slice(0, 2).map((button, index) => (
            <a
              key={button.id}
              href={resolveSiteHref(safeLinkUrl(button.link_url)!, org.slug, ownAddress)}
              className={
                index === 0
                  ? "inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  : "inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold transition hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              }
            >
              {safeText(button.link_label) || safeText(button.label) || "Get started"}
            </a>
          ))}
        </div>
      ) : null;

      if (isHero) {
        const Title = lead ? "h1" : "h2";
        return (
          <section id={section.kind === "hero" ? undefined : `section-${section.id}`} className="relative overflow-hidden" style={{ minWidth: 0 }}>
            <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]" style={{ paddingBlock: "calc(5rem * var(--site-space, 1))" }}>
              <div className="min-w-0">
                {heading ? (
                  <Title className="font-display text-[clamp(2.25rem,5.5vw,4rem)] font-semibold leading-[1.04] tracking-tight [text-wrap:balance]">
                    {heading}
                  </Title>
                ) : null}
                {subheading ? <p className="mt-5 max-w-xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-muted-foreground">{subheading}</p> : null}
                {body ? <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">{body}</p> : null}
                {actionRow}
              </div>
              {heroImage ? (
                <div className="relative min-w-0">
                  <img
                    src={heroImage.url!}
                    alt={safeText(heroImage.label) ?? heading ?? ""}
                    loading={first ? "eager" : "lazy"}
                    decoding="async"
                    {...(first ? { fetchPriority: "high" as const } : {})}
                    className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl"
                  />
                </div>
              ) : null}
            </div>
          </section>
        );
      }

      const sideImage = cards.length === 0 ? images[0] : undefined;
      return (
        <Shell wide id={`section-${section.id}`}>
          <div className={sideImage ? "grid items-center gap-10 lg:grid-cols-2" : ""}>
            <div className="min-w-0">
              {heading ? (
                <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.6rem)] font-semibold leading-tight tracking-tight [text-wrap:balance]">{heading}</h2>
              ) : null}
              {subheading ? <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">{subheading}</p> : null}
              {body ? <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">{body}</p> : null}
              {actionRow}
            </div>
            {sideImage ? (
              <img src={sideImage.url!} alt={safeText(sideImage.label) ?? heading ?? ""} loading="lazy" decoding="async" className="aspect-[4/3] w-full min-w-0 rounded-3xl object-cover shadow-xl" />
            ) : null}
          </div>
          {cards.length > 0 ? (
            <div className={`mt-10 grid gap-5 ${cards.length > 2 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
              {cards.map((card) => {
                const label = safeText(card.label);
                const cardBody = safeText(card.body);
                const linkUrl = safeLinkUrl(card.link_url);
                const mediaUrl = card.url;
                return (
                  <article key={card.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:shadow-lg">
                    {mediaUrl ? (
                      <img src={mediaUrl} alt={label ?? ""} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover" />
                    ) : null}
                    <div className="flex flex-1 flex-col p-6">
                      {label ? <h3 className="font-display text-[18px] font-semibold leading-snug">{label}</h3> : null}
                      {cardBody ? <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-muted-foreground">{cardBody}</p> : null}
                      {linkUrl ? (
                        <a href={resolveSiteHref(linkUrl, org.slug, ownAddress)} className="mt-4 inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-primary">
                          {safeText(card.link_label) || "Learn more"}
                          <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          {cards.length > 0 && images.length > 0 ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {images.slice(0, 4).map((image) => (
                <img key={image.id} src={image.url!} alt={safeText(image.label) ?? ""} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-2xl object-cover" />
              ))}
            </div>
          ) : null}
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
  const addressLine = factsAddressLine(facts);
  const area = facts.serviceArea ?? facts.city;
  // Nothing real to show → render nothing, never an empty styled box.
  if (!(facts.phone && facts.phoneHref) && !(facts.email && facts.emailHref) && !area && !addressLine && !facts.hours) return null;
  return (
          <div className="space-y-3">
            {presentation?.eyebrow ? <p className="eyebrow">{presentation.eyebrow}</p> : null}
            {presentation?.title ? <h3 className="font-display text-[19px] font-semibold">{presentation.title}</h3> : null}
            {presentation?.description ? <p className="text-[14px] text-muted-foreground">{presentation.description}</p> : null}
            <dl className="grid gap-4 sm:grid-cols-3">
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
                  <MapPin className="size-3.5" aria-hidden="true" /> {presentation?.fieldLabels?.location ?? "Area"}
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
            {facts.hours ? (
              <div>
                <dt className="eyebrow">{presentation?.fieldLabels?.time ?? "Hours"}</dt>
                <dd className="mt-1 whitespace-pre-line text-[14px]">{facts.hours}</dd>
              </div>
            ) : null}
            </dl>
          </div>
  );
}
