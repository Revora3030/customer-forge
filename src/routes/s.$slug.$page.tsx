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
import {
  isRenderableSection,
  leadSectionIndex,
  normalizeSection,
  pageHasNodeType,
  needsEnquiryForm,
  pageHasWidget,
  stickyActions,
} from "@/components/site/site-sections-utils";
import { ReviewWall } from "@/components/site/LiveBlocks";
import { EnquiryForm } from "@/components/site/SiteForms";
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
import { knownPageSlugs, missingChromeLinks, readSiteChrome, repairStoredLinks, resolveSiteHref } from "@/lib/builder/site-chrome";
import { AiSiteHeader } from "@/components/site/AiSiteHeader";
import { useOwnAddress, useSiteBase } from "@/components/site/use-own-address";
import { metaDescription } from "@/lib/seo";
import { clientHeadExtrasSync, shareImageFor } from "@/lib/site-head";
import { premiumSurface } from "@/lib/site-theme";

export const Route = createFileRoute("/s/$slug/$page")({
  loader: async ({ params }) => {
    const site = await getPublicSite({ data: { slug: params.slug, pageSlug: params.page } });
    // A page with no visible sections would render blank for a real visitor —
    // treat it as not published yet rather than serving an empty page.
    if ((site?.content?.sections ?? []).length === 0) throw notFound();
    return site;
  },

  head: ({ loaderData, params }) => {
    // A draft can load before its page row exists; never read a missing page.
    if (!loaderData?.content?.page) {
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
    const shareImage = shareImageFor({
      ogImage: page.og_image_url,
      heroImage: loaderData.profile?.hero_image_url ?? null,
      sections: Array.isArray(loaderData.content.sections) ? loaderData.content.sections : [],
    });
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
  // Drafts can load before their page rows exist (Sentry JAVASCRIPT-REACT-2/3/5/6),
  // so never assume content, page or sections are present.
  const content = site.content ?? null;
  const page = content?.page ?? null;
  const rawSections = content?.sections;
  const rawRows: unknown[] = Array.isArray(rawSections) ? rawSections : [];
  // A section the worker is still writing (no id or kind yet, or a malformed
  // child list) is kept as an in-place shimmer slot instead of being read.
  const slots = rawRows.map((row) => (isRenderableSection(row) ? normalizeSection(row) : null));
  const storedSections = slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null);
  const ownAddress = useOwnAddress();
  const previewBase = useSiteBase();
  const chrome = readSiteChrome(site.settings?.generation ?? null);
  // The site's real pages and this page's section anchors, so every button the
  // AI team authored is checked against what actually exists: a link to a page
  // the site does not have, or a "#contact" with no contact section here, is
  // sent somewhere real instead of a dead end.
  const navRows = Array.isArray(site.nav) ? site.nav : [];
  const knownPages = knownPageSlugs(navRows);
  const pageAnchors = new Set(
    storedSections
      .map((section) => {
        const role = (section.settings as Record<string, unknown> | null)?.["role"];
        const name = typeof role === "string" && /^[a-z][a-z0-9_-]{0,40}$/.test(role) ? role : section.kind;
        return name && name !== "composition" ? name.replace(/_/g, "-") : "";
      })
      .filter(Boolean),
  );
  if (page?.kind === "home" && (site.reviews?.length ?? 0) > 0) pageAnchors.add("reviews");
  // Every button and link the AI team authored inside the page's sections
  // (layouts, custom blocks, calculators, booking pickers) gets the same repair.
  const sections = repairStoredLinks(storedSections, knownPages, pageAnchors);
  const chromeHref = (href: string) => resolveSiteHref(href, org.slug, ownAddress, knownPages, pageAnchors, previewBase);
  // Pages the AI menu left out are still offered, so no page is orphaned.
  const extraNav = missingChromeLinks(chrome.header, navRows as never);

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

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="font-display text-[20px] font-semibold">This page isn't ready yet</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            The page is still being prepared. Refresh in a moment.
          </p>
          {preview ? <BuilderReturnBar /> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-background text-foreground ${designTokenClasses(readDesignTokens(site.settings?.generation ?? null))}`}
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
          <AiSiteHeader
            tree={chrome.header}
            name={org.name}
            homeHref={chromeHref("/")}
            resolveHref={chromeHref}
            surface={profile?.secondary_color ?? null}
            logoUrl={profile?.logo_url ?? null}
            extraLinks={extraNav.map((link) => ({
              href: chromeHref(link.href),
              label: pageNavLabel(link.title, org.name, link.slug),
            }))}
          />
        ) : null}

        {/* Tablet and phone overrides the client set in the visual builder. */}
        <ResponsiveStyles
          sections={sections}
          surface={profile?.secondary_color ?? null}
        />

        <main className="scroll-mt-20 pt-2 sm:pt-4 pb-24 sm:pb-16">
          {(() => {
            const lead = leadSectionIndex(sections as never);
            let ready = 0;
            return slots.map((slot, slotIndex) => {
              if (!slot) {
                return (
                  <div
                    key={`pending-${slotIndex}`}
                    data-testid="draft-section-pending"
                    aria-hidden
                    className="mx-auto my-4 h-48 w-full max-w-6xl animate-pulse rounded-lg bg-muted/40"
                  />
                );
              }
              const index = ready++;
              const section = sections[index];
              if (!section) return null;
              return (
                <SiteSection key={section.id} site={site} section={section} lead={index === lead} first={index === 0} />
              );
            });
          })()}
          {/* Every contact page — and any page whose buttons point at the
              message form — can always take a message, even when its AI
              layout only listed a phone number and email. */}
          {needsEnquiryForm(page.kind, (page as { slug?: string | null }).slug ?? null, sections as never) ? (
            <section id="contact" className="scroll-mt-20" style={{ minWidth: 0 }}>
              <div className="mx-auto w-full max-w-[680px] px-4 sm:px-6" style={{ paddingBlock: "calc(3.5rem * var(--site-space, 1))" }}>
                <EnquiryForm site={site} />
              </div>
            </section>
          ) : null}
          {/* Published reviews from the Reviews tool always reach the home
              page, even on sites designed before reviews existed. Skipped when
              the AI layout already places the live review wall itself. */}
          {page.kind === "home" && (site.reviews?.length ?? 0) > 0 && !pageHasWidget(sections as never, "review_wall") ? (
            <section id="reviews" className="scroll-mt-20" style={{ minWidth: 0 }}>
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6" style={{ paddingBlock: "calc(4rem * var(--site-space, 1))" }}>
                <h2 className="mb-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-tight">What customers say</h2>
                <ReviewWall site={site} />
              </div>
            </section>
          ) : null}
        </main>

        {/* Phone-only one-tap actions, built from verified facts only (a real
            phone number, a real contact/booking page). Skipped when the AI
            layout already placed its own sticky bar. */}
        {(() => {
          if (pageHasNodeType(sections as never, "mobile_sticky_bar")) return null;
          const known = knownPages ?? new Set<string>();
          const contactSlug = ["book", "booking", "contact", "quote", "contact-us"].find((slug) => known.has(slug));
          const actions = stickyActions({
            phone: (profile as { phone?: string | null } | null)?.phone ?? null,
            hasBookingPage: contactSlug === "book" || contactSlug === "booking",
            hasQuote: Boolean(site.quote),
            contactHref: contactSlug ? chromeHref(`/${contactSlug}`) : pageAnchors.has("contact") ? "#contact" : null,
          });
          if (!actions.length) return null;
          return (
            <nav
              aria-label="Quick actions"
              data-testid="site-sticky-actions"
              className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t border-border/60 bg-background/95 px-3 pt-2.5 backdrop-blur md:hidden"
              style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {actions.map((action, index) => (
                <a
                  key={action.kind}
                  href={action.href}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-[15px] font-semibold no-underline ${
                    index === 0 && actions.length > 1 ? "border border-current text-foreground" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {action.label}
                </a>
              ))}
            </nav>
          );
        })()}

        {chrome.footer ? (
          <footer className="rv-site-footer rv-ai-footer">
            <CompositionRenderer as="div" scope="site-footer" tree={chrome.footer} resolveHref={chromeHref} surface={premiumSurface(profile?.secondary_color ?? null)} linkLabel={(text) => stripBusinessSuffix(text, org.name)} />
          </footer>
        ) : null}

        <SiteVitals slug={org.slug} preview={preview} />
        {/* Lets the builder's preview frame pick a block by clicking it. Inert
            for every ordinary visitor and for any frame from another origin. */}
        {preview ? <PreviewSelectBridge /> : null}
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
