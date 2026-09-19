/**
 * Renders the builder's structured sections on a public business website.
 *
 * Every block is driven by data the business entered — nothing here invents
 * claims. Lead-capture blocks (quote, booking, sticky call bar) render the same
 * forms used on the home page, so any page can convert a visitor.
 */
import { blockCss, readBlockStyle, readSectionVisual, readComponentVisual } from "@/lib/site-style";
import { Link } from "@tanstack/react-router";
import { SitePageLink } from "@/components/site/site-links";
import { Mail, MapPin, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { BookingForm, QuoteCalculator } from "@/components/site/SiteForms";
import { DirectContact, mailHref, telHref } from "@/components/site/ContactDetails";
import type { PublicSite } from "@/lib/public-site.functions";
import { currency, dateShort } from "@/lib/format";
import { safeLinkUrl } from "@/lib/website-content";
import { readSectionEffect, sectionEffectClass } from "@/lib/site-effects";
import { businessFacts, factsAddressLine } from "@/lib/builder/facts";
import { phoneDisplay, phoneLink, safeParagraph, safeText } from "@/lib/builder/presentation";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];
type Component = NonNullable<Section["components"]>[number];

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
  return /^(left|center|right)(\\s+(top|center|bottom))?$/i.test(value) ? value : "center";
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

function SectionMedia({ site, section }: { site: Site; section: Section }) {
  const items = section.components.filter(
    (component) => IMAGE_COMPONENT_KINDS.has(component.kind) && safeLinkUrl(component.media_url),
  );
  if (!items.length) return null;
  return (
    <div className="rv-generated-media mx-auto grid max-w-6xl gap-4 px-4 pb-10 md:grid-cols-2">
      {items.slice(0, 4).map((component) => {
        const visual = readComponentVisual(component.settings);
        const src = safeLinkUrl(component.media_url);
        if (!src) return null;
        return (
          <figure key={component.id} className={`rv-media-frame ${ratioClass(visual.aspect_ratio)} overflow-hidden`}>
            <img
              src={src}
              alt={visual.alt || component.label || `${site.org.name} work sample`}
              loading="lazy"
              decoding="async"
              className={visualImageClass(visual)}
              style={{ objectPosition: safeObjectPosition(visual.object_position) }}
            />
          </figure>
        );
      })}
    </div>
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
    visual.layout ? `rv-layout-${visual.layout}` : "",
    visual.density ? `rv-density-${visual.density}` : "",
    visual.spacing ? `rv-spacing-${visual.spacing}` : "",
    visual.max_width ? `rv-width-${visual.max_width}` : "",
    visual.card_style ? `rv-cards-${visual.card_style}` : "",
    visual.image_treatment ? `rv-image-${visual.image_treatment}` : "",
  ].filter(Boolean).join(" ");

  const decorated = (
    <div className={visualClass} data-rv-variant={variant}>
      {section.kind !== "hero" ? <SectionMedia site={site} section={section} /> : null}
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

  switch (section.kind) {
    case "hero":
      return (
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
            {rating ? (
              <Pill tone="attention">
                {rating.toFixed(1)} ★ · {reviews.length} reviews
              </Pill>
            ) : null}
            <div className="rv-hero-grid mt-6">
              <div>
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
              {profile?.hero_image_url ? (
                <div className="rv-hero-media overflow-hidden rounded-2xl">
                  <img
                    src={profile?.hero_image_url ?? ""}
                    alt={org.name + " featured work"}
                    width={1200}
                    height={800}
                    fetchPriority="high"
                    decoding="async"
                    className="h-full min-h-64 w-full object-cover"
                  />
                </div>
              ) : null}
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
            price: services.find((s) => s.name === card.label)?.price ?? null,
            startingPrice: services.find((s) => s.name === card.label)?.starting_price ?? null,
          }))
        : services.map((service) => ({
            id: service.id,
            name: service.name,
            body: service.description,
            href: null as string | null,
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
        <Shell>
          <Heading section={section} />
          <ul className="mt-6 space-y-2">
            {components
              .filter((c) => c.kind === "price_row" && c.label)
              .map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline justify-between gap-4 border-b border-border py-2"
                >
                  <span className="text-[14px]">{row.label}</span>
                  <span className="tnum text-[14px] font-semibold text-primary">{row.body}</span>
                </li>
              ))}
          </ul>
          <SectionButtons site={site} components={components} />
        </Shell>
      );

    case "pricing": {
      const rows = components.filter((c) => c.label);
      return (
        <Shell>
          <Heading section={section} />
          {rows.length ? (
            <ul className="mt-7 space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline justify-between gap-4 border-b border-border py-2.5"
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
          <ol className="mt-8 grid gap-3 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.id} className="panel p-4">
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
          <dl className="mt-7 grid gap-4 sm:grid-cols-3">
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
                <p className="mt-3 text-[11px] text-muted-foreground">
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
          <dl className="mt-8 space-y-5">
            {items.map((item) => (
              <div key={item.id}>
                <dt className="text-[14px] font-medium">{item.label}</dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>
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

    case "offer":
    case "guarantee":
    case "intro":
    case "area":
    case "policy":
    case "lead_magnet":
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
