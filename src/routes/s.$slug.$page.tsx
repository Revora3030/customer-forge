/**
 * A single structured page of a published business website
 * (`/s/:slug/:page`) — service pages, area pages, pricing, booking, FAQ and
 * anything else the builder laid out. Each one carries its own metadata and its
 * own lead-capture blocks.
 */
import { SitePageLink } from "@/components/site/site-links";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Menu, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteSection, StickyCallBar, siteDesignFingerprint } from "@/components/site/SiteSections";
import { businessFacts } from "@/lib/builder/facts";
import { safeText } from "@/lib/builder/presentation";
import { SiteBackdrop } from "@/components/site/SiteBackdrop";
import { siteFontHref, siteFontStyle, siteThemeStyle } from "@/lib/site-theme";
import { readComposition } from "@/lib/visual-composition";
import { readBackdrop } from "@/lib/site-effects";
import { getPublicSite, trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { SiteVitals } from "@/components/site/SiteVitals";
import { BuilderReturnBar } from "@/components/site/BuilderReturnBar";
import { styleSheet } from "@/lib/site-style";
import { readSeo } from "@/lib/site-seo";
import { readCopy } from "@/lib/site-engine";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { fingerprintClassNames } from "@/lib/builder/design-fingerprint";
import { SiteFooter } from "@/components/site/SiteFooter";
import { pageJourneyFor, readSiteCampaign } from "@/lib/builder/site-campaign";

export const Route = createFileRoute("/s/$slug/$page")({
  loader: async ({ params }) => {
    const site = await getPublicSite({ data: { slug: params.slug, pageSlug: params.page } });
    // A page with no visible sections would render blank for a real visitor —
    // treat it as not published yet rather than serving an empty page.
    if (!site || !site.content || site.content.sections.length === 0) throw notFound();
    return site;
  },

  head: ({ loaderData, params }) => {
    if (!loaderData?.content) {
      return { meta: [{ title: "Page not found" }, { name: "robots", content: "noindex" }] };
    }
    const page = loaderData.content.page;
    const name = loaderData.org.name;
    const title = (page.seo_title || `${page.title} — ${name}`).slice(0, 60);
    const description = (
      page.seo_description ||
      loaderData.profile?.tagline ||
      `${page.title} from ${name}. See what's included and get a price.`
    ).slice(0, 158);
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, params.page, page.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}/${params.page}`;
    const shareImage = page.og_image_url || loaderData.profile?.hero_image_url || null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: page.og_title || title },
        { property: "og:description", content: page.og_description || description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: name },
        { name: "twitter:card", content: "summary_large_image" },
        ...(shareImage && shareImage.startsWith("https://")
          ? [
              { property: "og:image", content: shareImage },
              { name: "twitter:image", content: shareImage },
            ]
          : []),
        ...(page.noindex ? [{ name: "robots", content: "noindex" }] : []),
      ],
      links: [
        { rel: "canonical", href: url },
        // Same as the home page: the chosen heading font has to be requested
        // here or it is stored but never seen.
        ...(siteFontHref(loaderData.profile?.font_preference)
          ? [
              {
                rel: "stylesheet",
                href: siteFontHref(loaderData.profile?.font_preference) as string,
              },
            ]
          : []),
      ],
    };
  },
  component: SitePageRoute,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <p className="text-[14px] text-muted-foreground">
        This page couldn't load. Please refresh and try again.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[22px] font-semibold">Page not found</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">This page isn't published yet.</p>
      </div>
    </div>
  ),
});

function SitePageRoute() {
  return <SitePageView site={Route.useLoaderData()} />;
}

export function SitePageView({
  site,
  preview = false,
}: {
  site: NonNullable<PublicSite>;
  preview?: boolean;
}) {
  const track = useServerFn(trackPublicEvent);
  const { org, profile, settings } = site;
  const seo = readSeo(settings?.seo);
  const copy = readCopy((settings?.generation as { copy?: unknown } | null)?.copy);
  const ctaLabel =
    copy?.primaryCta || seo.primary_cta_label || (site.quote ? "Get my price" : "Book now");
  const page = site.content!.page;
  // Validated business details — an unusable phone number never becomes a link.
  const facts = businessFacts(profile as Record<string, unknown> | null, org.name);
  const fingerprint = siteDesignFingerprint(site);
  const campaign = readSiteCampaign(settings?.generation ?? null);
  const journey = pageJourneyFor(campaign, page.slug);

  useEffect(() => {
    if (preview) return;
    void track({
      data: {
        slug: org.slug,
        eventType: "page_view",
        path: window.location.pathname,
        source: document.referrer ? "referral" : "direct",
        device: window.innerWidth < 768 ? "mobile" : "desktop",
      },
    }).catch(() => undefined);
  }, [org.slug, track, preview]);

  return (
    <div
      className={`min-h-screen bg-background ${fingerprintClassNames(fingerprint)}`}
      data-rv-family={fingerprint.family}
      data-rv-hero={fingerprint.heroComposition}
      data-rv-page-purpose={journey?.purpose}
      data-rv-page-opening={journey?.opening}
      style={{
        ...siteThemeStyle({
          primaryColor: profile?.primary_color ?? null,
          secondaryColor: profile?.secondary_color ?? null,
          accentColor: profile?.accent_color ?? null,
        }),
        ...siteFontStyle(profile?.font_preference ?? null),
      }}
    >
      <SiteBackdrop
        backdrop={readBackdrop(site.settings?.generation ?? null)}
        composition={readComposition(site.settings?.generation ?? null)}
      />
      <div className="relative z-[1]">
        {/* The bar is opaque and uses the site's own foreground colour, so the
            business name stays readable on pale and dark themes alike rather
            than inheriting whatever colour the section below it chose. */}
        <header className={`rv-site-header rv-header-${campaign?.header ?? "solid"} sticky top-0 z-40 border-b border-border bg-background text-foreground`}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5">
            <SitePageLink slug={org.slug} className="min-w-0 max-w-40 sm:max-w-none">
              <p className="break-words font-display text-[16px] leading-tight font-semibold">{org.name}</p>
              {facts.city ? (
                <p className="text-[11px] text-muted-foreground">{facts.city}</p>
              ) : null}
            </SitePageLink>
            <div className="flex items-center gap-2">
              {facts.phoneHref ? (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={facts.phoneHref}
                    onClick={() =>
                      void track({ data: { slug: org.slug, eventType: "call_click" } }).catch(
                        () => undefined,
                      )
                    }
                  >
                    <Phone className="size-4" /> Call
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="signal" size="sm">
                <SitePageLink slug={org.slug} page={site.quote ? "#quote" : site.nav.some((item) => item.slug === "book") ? "book" : "contact"}>{ctaLabel}</SitePageLink>
              </Button>
            </div>
          </div>
          <SiteNav site={site} current={page.slug} />
        </header>

        {/* Tablet and phone overrides the client set in the visual builder. */}
        <ResponsiveStyles sections={site.content!.sections} />

        <main>
          {site.content!.sections.map((section) => (
            <SiteSection key={section.id} site={site} section={section} />
          ))}
        </main>

        <SiteFooter site={site} />

        <StickyCallBar site={site} label={ctaLabel} />
        <SiteVitals slug={org.slug} preview={preview} />
        {preview ? <BuilderReturnBar /> : null}
      </div>
    </div>
  );
}

/**
 * Site navigation, generated from the pages that actually exist.
 *
 * Phones get a real menu button and an expanding panel — the old horizontal
 * strip clipped page names off the side of the screen. Desktop keeps the
 * inline row. Menu items with no readable name are dropped, and duplicates are
 * removed, so a visitor never sees a blank or repeated link.
 */
export function SiteNav({ site, current }: { site: NonNullable<PublicSite>; current?: string }) {
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();
  const pages = (site.nav ?? [])
    .filter((p) => p.kind !== "thanks" && p.slug !== "home")
    .map((p) => ({ slug: p.slug, title: safeText(p.title) }))
    .filter((p): p is { slug: string; title: string } => {
      if (!p.title || !p.slug || seen.has(p.slug)) return false;
      seen.add(p.slug);
      return true;
    });
  if (!pages.length) return null;

  const itemClass = (active: boolean) =>
    `block rounded-md px-2 py-2.5 hover:text-foreground md:px-0 md:py-0 ${
      active ? "text-foreground" : "text-muted-foreground"
    }`;

  return (
    <nav aria-label="Site pages" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-nav-pages"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-[13px] font-medium md:hidden"
        >
          <span>Menu</span>
          {open ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Menu className="size-4" aria-hidden="true" />
          )}
        </button>
        <ul
          id="site-nav-pages"
          className={`${open ? "block" : "hidden"} pb-2 text-[13px] md:flex md:max-w-full md:flex-wrap md:gap-4 md:py-2.5 md:pb-2.5 md:text-[13px]`}
        >
          <li>
            <SitePageLink slug={site.org.slug} className={itemClass(!current)}>
              Home
            </SitePageLink>
          </li>
          {pages.map((p) => (
            <li key={p.slug}>
              <SitePageLink
                slug={site.org.slug}
                page={p.slug}
                aria-current={current === p.slug ? "page" : undefined}
                className={itemClass(current === p.slug)}
              >
                {p.title}
              </SitePageLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/**
 * Publishes the per-block responsive overrides as a real stylesheet. Every
 * declaration comes from the validated style model and every selector is a
 * checked block id, so nothing a client typed can inject CSS here.
 */
function ResponsiveStyles({ sections }: { sections: { id: string; settings: unknown; components?: { id: string; settings: unknown }[] }[] }) {
  const css = styleSheet(
    sections.flatMap((section) => [
      { id: section.id, settings: section.settings },
      ...(section.components ?? []).map((component) => ({ id: component.id, settings: component.settings })),
    ]),
  );
  if (!css) return null;
  return <style>{css}</style>;
}
