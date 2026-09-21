/**
 * Renders the builder's structured sections on a public business website.
 *
 * Every block is driven by data the business entered — nothing here invents
 * claims. Lead-capture blocks (quote, booking, sticky call bar) render the same
 * forms used on the home page, so any page can convert a visitor.
 */
import {
  blockCss,
  readBlockStyle,
  readSectionVisual,
  readComponentVisual,
  type PersistedComponentVisual,
} from "@/lib/site-style";
import { Link } from "@tanstack/react-router";
import { SitePageLink } from "@/components/site/site-links";
import { Mail, MapPin, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { BookingForm, QuoteCalculator } from "@/components/site/SiteForms";
import { DirectContact, mailHref, telHref } from "@/components/site/ContactDetails";
import type { PublicSite } from "@/lib/public-site.functions";
import { readCustomBlock } from "@/lib/builder/custom-block";
import { CustomBlock } from "@/components/site/CustomBlock";
import { currency, dateShort } from "@/lib/format";
import { safeLinkUrl } from "@/lib/website-content";
import { readSectionEffect, sectionEffectClass } from "@/lib/site-effects";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { phoneDisplay, phoneLink, safeParagraph, safeText } from "@/lib/builder/presentation";
import { DecorativeArt } from "@/components/site/DecorativeArt";
import { generateArtwork } from "@/lib/media/generative-art";
import {
  createDesignFingerprint,
  readDesignFingerprint,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import { resolveExecutableCreativeSection } from "@/lib/builder/executable-creative";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];
type Component = NonNullable<Section["components"]>[number];

/**
 * Artwork for this website, taken from its stored design identity when one
 * exists and otherwise derived from the business itself. Deterministic, so the
 * same site always looks the same between visits and rebuilds.
 */
function siteArtwork(site: Site) {
  const settings = (site as { settings?: { generation?: unknown } | null }).settings ?? null;
  const profile = (site.profile ?? null) as { industry?: string | null; city?: string | null } | null;
  const stored = readDesignFingerprint(settings?.generation);
  const fingerprint = stored ?? createDesignFingerprint({
    businessName: site.org?.name ?? null,
    industry: profile?.industry ?? null,
    city: profile?.city ?? null,
  });
  return generateArtwork(fingerprint.decorativeSystem, fingerprint.seed);
}

export function siteDesignFingerprint(site: Site): DesignFingerprint {
  const settings = (site as { settings?: { generation?: unknown } | null }).settings ?? null;
  const profile = (site.profile ?? null) as { industry?: string | null; city?: string | null } | null;
  return readDesignFingerprint(settings?.generation) ?? createDesignFingerprint({
    businessName: site.org?.name ?? null,
    industry: profile?.industry ?? null,
    city: profile?.city ?? null,
    photoCount: site.gallery?.length ?? 0,
  });
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

/** Buttons stored on a section. Internal links use the router, links out don't. */
const IMAGE_COMPONENT_KINDS = new Set(["image", "gallery", "media", "photo", "hero_image"]);

function safeObjectPosition(value: string | undefined): string {
  if (!value) return "center";
  const keyword = /^(left|center|right)(\s+(top|center|bottom))?$/i;
  // Focal points chosen in the editor are stored as a percentage pair.
  const percentage = /^\d{1,3}%\s+\d{1,3}%$/;
  return keyword.test(value) || percentage.test(value) ? value : "center";
}

/**
 * A credit line, shown only when the picture actually carries one. Stock and
 * generated pictures must credit their source; the customer's own photos don't.
 */
function MediaCredit({ visual }: { visual: PersistedComponentVisual }) {
  const credit = visual.credit?.trim();
  const license = visual.license?.trim();
  if (!credit && !license) return null;
  const text = [credit, license].filter(Boolean).join(" · ");
  const href = safeLinkUrl(visual.source_url ?? null);
  return (
    <figcaption className="mt-1.5 text-[13px] text-muted-foreground">
      {href ? (
        <a href={href} rel="nofollow noopener noreferrer" target="_blank" className="underline">
          {text}
        </a>
      ) : (
        text
      )}
    </figcaption>
  );
}

function ratioClass(ratio: string | undefined): string {
  switch (ratio) {
    case "1:1": return "aspect-square";
    case "4:3": return "aspect-[4/3]";
    case "3:2": return "aspect-[3/2]";
    case "21:9": return "aspect-[21/9]";
    default: return "aspect-video";
  }
}

function visualImageClass(visual: ReturnType<typeof readComponentVisual>): string {
  const radius =
    visual.radius === "pill"
      ? "rounded-full"
      : visual.radius === "large"
        ? "rounded-2xl"
        : visual.radius === "medium"
          ? "rounded-xl"
          : visual.radius === "small"
            ? "rounded-lg"
            : "rounded-none";
  const shadow =
    visual.shadow === "strong"
      ? "shadow-2xl"
      : visual.shadow === "medium"
        ? "shadow-xl"
        : visual.shadow === "soft"
          ? "shadow-lg"
          : "shadow-none";
  return `h-full w-full ${radius} ${shadow} object-${visual.object_fit ?? "cover"}`;
}

function componentImageUrl(component: Component): string | null {
  return safeLinkUrl(component.url) ?? safeLinkUrl(component.media_url);
}

function SectionMedia({ site, section }: { site: Site; section: Section }) {
  const items = section.components.filter(
    (component) => IMAGE_COMPONENT_KINDS.has(component.kind) && componentImageUrl(component),
  );
  if (!items.length) return null;
  return (
    <div className="rv-generated-media mx-auto grid max-w-6xl gap-4 px-4 pb-10 md:grid-cols-2">
      {items.slice(0, 4).map((component) => {
        const visual = readComponentVisual((component as Component & { settings?: unknown }).settings);
        const src = componentImageUrl(component);
        if (!src) return null;
        const overlayClass = visual.overlay ? "rv-overlay-" + visual.overlay : "";
        return (
          <figure key={component.id} className={`rv-media-frame ${ratioClass(visual.aspect_ratio)} ${overlayClass} overflow-hidden`}>
            <img
              src={src}
              alt={visual.alt || component.label || `${site.org.name} work sample`}
              loading="lazy"
              decoding="async"
              className={visualImageClass(visual)}
              style={{ objectPosition: safeObjectPosition(visual.focal_point ?? visual.object_position) }}
            />
            <MediaCredit visual={visual} />
          </figure>
        );
      })}
    </div>
  );
}

function SectionFeatureMedia({ site, section, className = "" }: { site: Site; section: Section; className?: string }) {
  const component = section.components.find(
    (item) => IMAGE_COMPONENT_KINDS.has(item.kind) && componentImageUrl(item),
  );
  if (!component) {
    return (
      <div className={`rv-feature-art overflow-hidden border border-border bg-card/40 ${className}`} aria-hidden="true">
        <DecorativeArt spec={siteArtwork(site)} className="h-full min-h-72 w-full" />
      </div>
    );
  }
  const visual = readComponentVisual((component as Component & { settings?: unknown }).settings);
  const src = componentImageUrl(component);
  if (!src) return null;
  return (
    <figure className={`rv-feature-media overflow-hidden ${className}`}>
      <img
        src={src}
        alt={visual.alt || component.label || `${site.org.name} supporting image`}
        loading="lazy"
        decoding="async"
        className={visualImageClass(visual)}
        style={{ objectPosition: safeObjectPosition(visual.focal_point ?? visual.object_position) }}
      />
      <MediaCredit visual={visual} />
    </figure>
  );
}

function SectionButtons({ site, components }: { site: Site; components: Component[] }) {
  const buttons = components.filter((c) => c.kind === "button" && c.label);
  if (!buttons.length) return null;
  return (
    <div className="mt-7 flex flex-wrap gap-2.5">
      {buttons.map((button, index) => {
        const href = safeLinkUrl(button.link_url) ?? "#quote";
        const internal = href.startsWith("/");
        return (
          <Button key={button.id} asChild variant={index === 0 ? "signal" : "outline"} size="lg">
            {internal ? (
              <SitePageLink slug={site.org.slug} page={href.slice(1)}>
                {button.label}
              </SitePageLink>
            ) : (
              <a href={href}>{button.label}</a>
            )}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Public section renderer. Wraps the block in the visual effect the client (or
 * the Website Assistant) installed on it — 3D float, tilt, glass, glow, shine —
 * chosen from the allowlisted effect catalog.
 */
export function SiteSection({ site, section }: { site: Site; section: Section }) {
  const effect = readSectionEffect(section.settings);
  const style = readBlockStyle(section.settings);
  const visual = readSectionVisual(section.settings);
  const variant = /^[a-z0-9-]{1,40}$/i.test(section.variant ?? "") ? section.variant : "default";
  const rendererVariant = variant.split("--", 1)[0] ?? variant;
  const fingerprint = siteDesignFingerprint(site);
  const hasMedia = section.components.some((component) => Boolean(componentImageUrl(component))) ||
    (section.kind === "hero" && Boolean(site.profile?.hero_image_url));
  const creative = resolveExecutableCreativeSection({
    kind: section.kind,
    settings: section.settings,
    fingerprint,
    hasMedia,
  });
  let inner = <SiteSectionBody site={site} section={section} />;

  const css = blockCss(style);
  if (Object.keys(css).length) {
    inner = (
      <div data-rvb={section.id} style={css}>
        {inner}
      </div>
    );
  }

  const visualClass = [
    "rv-section",
    `rv-variant-${variant}`,
    rendererVariant !== variant ? `rv-variant-${rendererVariant}` : "",
    visual.layout ? `rv-layout-${visual.layout}` : "",
    visual.density ? `rv-density-${visual.density}` : "",
    visual.spacing ? `rv-spacing-${visual.spacing}` : "",
    visual.max_width ? `rv-width-${visual.max_width}` : "",
    visual.card_style ? `rv-cards-${visual.card_style}` : "",
    visual.image_treatment ? `rv-image-${visual.image_treatment}` : "",
    creative ? `rv-creative-${creative.headingTreatment}` : "",
    creative ? `rv-rhythm-${creative.rhythm}` : "",
    creative ? `rv-media-role-${creative.mediaRole}` : "",
    creative ? `rv-mobile-${creative.mobileOrder}` : "",
  ].filter(Boolean).join(" ");

  const decorated = (
    <div className={visualClass} data-rv-variant={variant}>
      {!(["hero", "service_detail", "cta", "intro", "offer", "guarantee", "area", "policy", "lead_magnet"] as string[]).includes(section.kind)
        ? <SectionMedia site={site} section={section} />
        : null}
      {inner}
    </div>
  );

  if (effect === "none") return decorated;
  return <div className={sectionEffectClass(effect)}>{decorated}</div>;
}

function SiteSectionBody({ site, section }: { site: Site; section: Section }) {
  const components = section.components ?? [];
  const { profile, services, reviews, gallery, org } = site;
  const rating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;
  const heroArtwork = siteArtwork(site);
  const heroImage = components.find((component) => component.kind === "hero_image" && componentImageUrl(component));
  const heroImageVisual = heroImage
    ? readComponentVisual((heroImage as Component & { settings?: unknown }).settings)
    : null;
  const heroImageSrc = heroImage ? componentImageUrl(heroImage) : null;
  const heroCreative = resolveExecutableCreativeSection({
    kind: section.kind,
    settings: section.settings,
    fingerprint: siteDesignFingerprint(site),
    hasMedia: Boolean(profile?.hero_image_url || heroImageSrc),
  });
  const backgroundHero = heroCreative?.mediaRole === "background";


  switch (section.kind) {
    case "hero":
      return (
        <section className="rv-hero border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
            {rating ? (
              <Pill tone="attention">
                {rating.toFixed(1)} ★ · {reviews.length} reviews
              </Pill>
            ) : null}
            <div className="rv-hero-grid mt-6">
              <div className="rv-hero-copy">
                <h1 className="max-w-3xl font-display text-[34px] leading-[1.06] font-semibold tracking-tight lg:text-[46px]">
                  {section.heading ?? org.name}
                </h1>
                {section.subheading ? (
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                    {section.subheading}
                  </p>
                ) : null}
                {section.body ? (
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                    {section.body}
                  </p>
                ) : null}
                <SectionButtons site={site} components={components} />
              </div>
              {profile?.hero_image_url || heroImageSrc ? (
                // The frame keeps a steady, wide shape at every screen size, so a
                // square or tall photo is cropped to the centre instead of
                // stretching the top of the page out of proportion.
                <figure
                  className={`rv-hero-media w-full overflow-hidden ${
                    backgroundHero
                      ? "rv-hero-media-background"
                      : "aspect-[4/3] !min-h-0 rounded-2xl sm:aspect-[3/2] lg:aspect-[16/10]"
                  }`}
                >
                  <img
                    src={profile?.hero_image_url ?? heroImageSrc ?? ""}
                    alt={heroImageVisual?.alt || org.name + " featured work"}
                    width={1200}
                    height={800}
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover object-center"
                    style={{
                      objectPosition: safeObjectPosition(
                        heroImageVisual?.focal_point ?? heroImageVisual?.object_position,
                      ),
                    }}
                  />
                  {heroImageVisual ? <MediaCredit visual={heroImageVisual} /> : null}
                </figure>
              ) : (
                // No photo supplied: show artwork generated from this site's own
                // design identity rather than an empty frame. It is abstract and
                // makes no claim about the business.
                <div className="rv-hero-media overflow-hidden rounded-2xl border border-border bg-card/40">
                  <DecorativeArt spec={heroArtwork} className="h-full min-h-64 w-full" />
                </div>
              )}
            </div>
          </div>
        </section>
      );

    case "trust_bar": {
      const items = components.filter((c) => c.label);
      if (!items.length) return null;
      return (
        <section className="border-b border-border bg-card/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
            {items.map((item) => (
              <span
                key={item.id}
                className="flex items-center gap-2 text-[13px] text-muted-foreground"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                {item.label}
              </span>
            ))}
          </div>
        </section>
      );
    }

    case "services": {
      const cards = components.filter((c) => c.label);
      const list = cards.length
        ? cards.map((card) => ({
            id: card.id,
            name: card.label!,
            body: card.body,
            href: safeLinkUrl(card.link_url),
            imageSrc: componentImageUrl(card),
            visual: readComponentVisual((card as Component & { settings?: unknown }).settings),
            price: services.find((s) => s.name === card.label)?.price ?? null,
            startingPrice: services.find((s) => s.name === card.label)?.starting_price ?? null,
          }))
        : services.map((service) => ({
            id: service.id,
            name: service.name,
            body: service.description,
            href: null as string | null,
            imageSrc: null as string | null,
            visual: null as ReturnType<typeof readComponentVisual> | null,
            price: service.price,
            startingPrice: service.starting_price,
          }));
      if (!list.length) return null;
      return (
        <Shell wide id="services">
          <Heading section={section} />
          <ul className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.map((item) => (
              <li key={item.id} className="panel flex flex-col p-4">
                {item.imageSrc ? (
                  <figure className="mb-4 overflow-hidden rounded-xl border border-border/70">
                    <img
                      src={item.imageSrc}
                      alt={item.visual?.alt || `${item.name} image`}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/3] w-full object-cover"
                      style={{
                        objectPosition: safeObjectPosition(
                          item.visual?.focal_point ?? item.visual?.object_position,
                        ),
                      }}
                    />
                    {item.visual ? <MediaCredit visual={item.visual} /> : null}
                  </figure>
                ) : null}
                <h3 className="font-display text-[15px] font-semibold">{item.name}</h3>
                {item.body ? (
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                ) : null}
                {item.price !== null ? (
                  <p className="tnum mt-3.5 text-[15px] font-semibold text-primary">
                    {item.startingPrice ? "From " : ""}
                    {currency(Number(item.startingPrice ?? item.price))}
                  </p>
                ) : null}
                {item.href?.startsWith("/") ? (
                  <SitePageLink
                    slug={org.slug}
                    page={item.href.slice(1)}
                    className="mt-3 text-[13px] text-primary underline"
                  >
                    See details
                  </SitePageLink>
                ) : null}
              </li>
            ))}
          </ul>
        </Shell>
      );
    }

    case "service_detail":
      return (
        <Shell wide>
          <div className="rv-service-detail-grid">
            <div className="rv-service-detail-copy">
              <span className="rv-service-detail-kicker">Service overview</span>
              <Heading section={section} />
              <SectionFeatureMedia site={site} section={section} className="mt-8 aspect-[4/3]" />
            </div>
            <div className="rv-service-detail-action panel">
              <ul className="space-y-2">
                {components
                  .filter((c) => c.kind === "price_row" && c.label)
                  .map((row) => (
                    <li
                      key={row.id}
                      className="flex items-baseline justify-between gap-4 border-b border-border py-3"
                    >
                      <span className="text-[14px]">{row.label}</span>
                      <span className="tnum text-[16px] font-semibold text-primary">{row.body}</span>
                    </li>
                  ))}
              </ul>
              <SectionButtons site={site} components={components} />
            </div>
          </div>
        </Shell>
      );

    case "pricing": {
      const rows = components.filter((c) => c.label);
      return (
        <Shell>
          <Heading section={section} />
          {rows.length ? (
            <ul className="rv-pricing-list mt-7 space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rv-pricing-item flex items-baseline justify-between gap-4 border-b border-border py-2.5"
                >
                  <span className="text-[14px]">{row.label}</span>
                  <span className="tnum text-[14px] font-semibold text-primary">{row.body}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <SectionButtons site={site} components={components} />
        </Shell>
      );
    }

    case "process": {
      const steps = components.filter((c) => c.label);
      if (!steps.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <ol className="rv-process-list mt-8 grid gap-3 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.id} className="panel p-4">
                <span className="rv-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <p className="font-display text-[14px] font-semibold">{step.label}</p>
                {step.body ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </Shell>
      );
    }

    case "benefits": {
      const items = components.filter((c) => c.label);
      if (!items.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 text-[14px] text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                />
                {item.label}
              </li>
            ))}
          </ul>
        </Shell>
      );
    }

    case "stats": {
      const items = components.filter((c) => c.label);
      if (!items.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <dl className="rv-stats-list mt-7 grid gap-4 sm:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="panel p-4">
                <dt className="eyebrow">{item.label}</dt>
                <dd className="tnum mt-1 font-display text-[24px] font-semibold">{item.body}</dd>
              </div>
            ))}
          </dl>
        </Shell>
      );
    }

    case "gallery":
      if (!gallery.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {gallery.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-md border border-border">
                <img
                  src={item.url}
                  alt={item.alt_text ?? `${org.name} work sample`}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </Shell>
      );

    case "reviews":
      if (!reviews.length) return null;
      return (
        <Shell wide id="reviews">
          <Heading section={section} />
          <ul className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="panel p-4">
                <div
                  className="flex items-center gap-0.5 text-accent"
                  aria-label={`${review.rating} of 5`}
                >
                  {Array.from({ length: review.rating }).map((_, index) => (
                    <Star key={index} className="size-3.5 fill-current" aria-hidden="true" />
                  ))}
                </div>
                {review.comment ? (
                  <p className="mt-3 text-[13px] leading-relaxed">{review.comment}</p>
                ) : null}
                <p className="mt-3 text-[13px] text-muted-foreground">
                  {review.author_name} · {dateShort(review.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </Shell>
      );

    case "faq": {
      const items = components.filter((c) => c.label);
      if (!items.length) return null;
      return (
        <Shell id="faq">
          <Heading section={section} />
          <div className="rv-faq-list mt-8 space-y-2">
            {items.map((item) => (
              <details key={item.id} className="group border-b border-border py-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-[14px] font-medium">
                  {item.label}<span aria-hidden="true" className="text-primary transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pb-2 pr-8 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </details>
            ))}
          </div>
        </Shell>
      );
    }

    case "areas": {
      const links = components.filter((c) => c.label);
      if (!links.length) return null;
      return (
        <Shell wide>
          <Heading section={section} />
          <ul className="mt-6 flex flex-wrap gap-2">
            {links.map((link) => (
              <li key={link.id}>
                {safeLinkUrl(link.link_url)?.startsWith("/") ? (
                  <SitePageLink
                    slug={org.slug}
                    page={safeLinkUrl(link.link_url)!.slice(1)}
                    className="rounded-full border border-border px-3 py-1.5 text-[13px] hover:border-primary"
                  >
                    {link.label}
                  </SitePageLink>
                ) : (
                  <span className="rounded-full border border-border px-3 py-1.5 text-[13px]">
                    {link.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Shell>
      );
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
                <dd className="mt-1 text-[13px]">
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
                <dd className="mt-1 text-[13px]">
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
                <dd className="mt-1 text-[13px]">{area}</dd>
              </div>
            ) : null}
            {addressLine ? (
              <div>
                <dt className="eyebrow flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" /> Address
                </dt>
                <dd className="mt-1 text-[13px]">{addressLine}</dd>
              </div>
            ) : null}
            {facts.hours ? (
              <div>
                <dt className="eyebrow">Hours</dt>
                <dd className="mt-1 whitespace-pre-line text-[13px]">{facts.hours}</dd>
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

    case "cta":
      return (
        <section className="rv-cta-band scroll-mt-20 border-b border-border">
          <SectionFeatureMedia site={site} section={section} className="rv-cta-band-media" />
          <div className="rv-cta-band-scrim" aria-hidden="true" />
          <div className="rv-cta-band-content mx-auto max-w-6xl px-4 py-20">
            <p className="eyebrow">Next step</p>
            <Heading section={section} />
            <SectionButtons site={site} components={components} />
          </div>
        </section>
      );

    case "intro":
      return (
        <Shell wide>
          <div className="rv-editorial-feature">
            <div className="rv-editorial-feature-copy">
              <p className="eyebrow">The story</p>
              <Heading section={section} />
              <SectionButtons site={site} components={components} />
            </div>
            <SectionFeatureMedia site={site} section={section} className="aspect-[4/3]" />
          </div>
        </Shell>
      );

    case "offer":
    case "lead_magnet":
      return (
        <Shell wide>
          <div className="rv-offer-feature panel">
            <div>
              <p className="eyebrow">Available now</p>
              <Heading section={section} />
              <SectionButtons site={site} components={components} />
            </div>
            <SectionFeatureMedia site={site} section={section} className="aspect-[3/2]" />
          </div>
        </Shell>
      );

    case "guarantee":
      return (
        <Shell wide>
          <div className="rv-assurance-panel">
            <span className="rv-assurance-mark" aria-hidden="true">01</span>
            <div><p className="eyebrow">Our commitment</p><Heading section={section} /></div>
          </div>
        </Shell>
      );

    case "area":
      return (
        <Shell wide>
          <div className="rv-area-feature">
            <div><p className="eyebrow">Where we work</p><Heading section={section} /><SectionButtons site={site} components={components} /></div>
            <SectionFeatureMedia site={site} section={section} className="aspect-[16/10]" />
          </div>
        </Shell>
      );

    case "policy":
      return (
        <Shell>
          <article className="rv-policy-copy">
            <p className="eyebrow">Important information</p>
            <Heading section={section} />
          </article>
        </Shell>
      );

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
      if (!safeText(section.heading) && !safeParagraph(section.body)) return null;
      return (
        <Shell>
          <Heading section={section} />
          <SectionButtons site={site} components={components} />
        </Shell>
      );
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
  const target = site.quote ? "#quote" : "#book";
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
        <Button asChild variant="signal" className="min-h-11 flex-1">
          <a href={target}>{label}</a>
        </Button>
      </div>
    </div>
  );
}
