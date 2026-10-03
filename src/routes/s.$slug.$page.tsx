import { pageNavLabel, stripBusinessSuffix } from "@/lib/website-content";
import { designTokenClasses, designTokenVars, readDesignTokens } from "@/lib/builder/design-tokens";
/**
 * A single structured page of a published business website
 * (`/s/:slug/:page`) — service pages, area pages, pricing, booking, FAQ and
 * anything else the builder laid out. Each one carries its own metadata and its
 * own lead-capture blocks.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteSection } from "@/components/site/SiteSections";
import { leadSectionIndex, pageHasWidget } from "@/components/site/site-sections-utils";
import { ReviewWall } from "@/components/site/LiveBlocks";
import { PreviewSelectBridge } from "@/components/site/PreviewSelectBridge";
import { SiteBackdrop } from "@/components/site/SiteBackdrop";
import { compositionFonts, siteFontStyle, siteFontsHref, siteThemeStyle } from "@/lib/site-theme";
import { readComposition } from "@/lib/visual-composition";
import { readBackdrop, readBackdropSpec } from "@/lib/site-effects";
import { getPublicSite, trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { SiteVitals } from "@/components/site/SiteVitals";
import { BuilderReturnBar } from "@/components/site/BuilderReturnBar";
import { PreviewLinkBridge } from "@/components/site/PreviewLinkBridge";
import { styleSheet } from "@/lib/site-style";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { readSiteChrome, resolveSiteHref } from "@/lib/builder/site-chrome";
import { AiSiteHeader } from "@/components/site/AiSiteHeader";
import { useOwnAddress } from "@/components/site/use-own-address";
import { metaDescription } from "@/lib/seo";
import { clientHeadExtrasSync } from "@/lib/site-head";

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
    const title = (page.seo_title || `${pageNavLabel(page.title, name, page.slug)} — ${name}`).slice(0, 60);
    const description = (
      page.seo_description ||
      loaderData.profile?.tagline ||
      `${pageNavLabel(page.title, name, page.slug)} from ${name}.`
    ).slice(0, 158);
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, params.page, page.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}/${params.page}`;
    const shareImage = page.og_image_url || loaderData.profile?.hero_image_url || null;
    const extras = clientHeadExtrasSync(
      loaderData as never,
      canonicalSiteUrl(loaderData.settings, params.slug) ?? url,
      compositionFonts,
      siteFontsHref,
      readSiteChrome,
    );
    return {
      meta: [
        { title },
        { name: "description", content: metaDescription(description) },
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
        ...extras.meta,
      ],
      scripts: extras.scripts,
      links: [
        { rel: "canonical", href: url },
        // Same as the home page: the chosen heading font has to be requested
        // here or it is stored but never seen.
        ...extras.links,
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
  const { org, profile } = site;
  const page = site.content!.page;
  const ownAddress = useOwnAddress();
  const chrome = readSiteChrome(site.settings?.generation ?? null);
  const chromeHref = (href: string) => resolveSiteHref(href, org.slug, ownAddress);

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
      className={`min-h-screen bg-background ${designTokenClasses(readDesignTokens(site.settings?.generation ?? null))}`}
      style={{
        ...siteThemeStyle({
          primaryColor: profile?.primary_color ?? null,
          secondaryColor: profile?.secondary_color ?? null,
          accentColor: profile?.accent_color ?? null,
        }),
        ...siteFontStyle(profile?.font_preference ?? null),
        ...designTokenVars(readDesignTokens(site.settings?.generation ?? null)),
      }}
    >
      <SiteBackdrop
        backdrop={readBackdrop(site.settings?.generation ?? null)}
        composition={readComposition(site.settings?.generation ?? null)}
        spec={readBackdropSpec(site.settings?.generation ?? null)}
      />
      <div className="relative z-[1]">
        {/* The bar is opaque and uses the site's own foreground colour, so the
            business name stays readable on pale and dark themes alike rather
            than inheriting whatever colour the section below it chose. */}
        {chrome.header ? (
          <AiSiteHeader tree={chrome.header} name={org.name} homeHref={chromeHref("/")} resolveHref={chromeHref} surface={profile?.secondary_color ?? null} logoUrl={profile?.logo_url ?? null} />
        ) : null}

        {/* Tablet and phone overrides the client set in the visual builder. */}
        <ResponsiveStyles
          sections={site.content!.sections}
          surface={profile?.secondary_color ?? null}
        />

        <main className="scroll-mt-20 pt-2 sm:pt-4 pb-24 sm:pb-16">
          {(() => {
            const lead = leadSectionIndex(site.content!.sections as never);
            return site.content!.sections.map((section, index) => (
              <SiteSection key={section.id} site={site} section={section} lead={index === lead} first={index === 0} />
            ));
          })()}
          {/* Published reviews from the Reviews tool always reach the home
              page, even on sites designed before reviews existed. Skipped when
              the AI layout already places the live review wall itself. */}
          {site.content!.page.kind === "home" && (site.reviews?.length ?? 0) > 0 && !pageHasWidget(site.content!.sections as never, "review_wall") ? (
            <section id="reviews" className="scroll-mt-20" style={{ minWidth: 0 }}>
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6" style={{ paddingBlock: "calc(4rem * var(--site-space, 1))" }}>
                <h2 className="mb-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight">What customers say</h2>
                <ReviewWall site={site} />
              </div>
            </section>
          ) : null}
        </main>

        {chrome.footer ? (
          <footer className="rv-site-footer rv-ai-footer">
            <CompositionRenderer as="div" scope="site-footer" tree={chrome.footer} resolveHref={chromeHref} surface={profile?.secondary_color ?? null} linkLabel={(text) => stripBusinessSuffix(text, org.name)} />
          </footer>
        ) : null}

        <SiteVitals slug={org.slug} preview={preview} />
        {/* Lets the builder's preview frame pick a block by clicking it. Inert
            for every ordinary visitor and for any frame from another origin. */}
        <PreviewSelectBridge />
        {preview ? <BuilderReturnBar /> : null}
        {preview ? <PreviewLinkBridge slug={org.slug} /> : null}
      </div>
    </div>
  );
}

/**
 * Publishes the per-block responsive overrides as a real stylesheet. Every
 * declaration comes from the validated style model and every selector is a
 * checked block id, so nothing a client typed can inject CSS here.
 */
function ResponsiveStyles({
  sections,
  surface = null,
}: {
  sections: { id: string; settings: unknown; components?: { id: string; settings: unknown }[] }[];
  /** The page's surface colour, used to keep per-device text colours readable. */
  surface?: string | null;
}) {
  const css = styleSheet(
    sections.flatMap((section) => [
      { id: section.id, settings: section.settings },
      ...(section.components ?? []).map((component) => ({ id: component.id, settings: component.settings })),
    ]),
    surface,
  );
  if (!css) return null;
  return <style>{css}</style>;
}
