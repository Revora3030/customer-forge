import { pageNavLabel, stripBusinessSuffix } from "@/lib/website-content";
import { designTokenClasses, designTokenVars, readDesignTokens } from "@/lib/builder/design-tokens";
import { readComposition as readSectionTree } from "@/lib/builder/composition-tree";
import { prepareStudioPage, studioLightPalette, studioThemeVars, STUDIO_CANVAS } from "@/lib/builder/studio-canvas";
import { blueprintFor } from "@/lib/builder/industry-playbook";
import { premiumSurface } from "@/lib/site-theme";
/**
 * A single structured page of a published business website
 * (`/s/:slug/:page`) — service pages, area pages, pricing, booking, FAQ and
 * anything else the builder laid out. Each one carries its own metadata and its
 * own lead-capture blocks.
 */
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
import { SiteFontLinks } from "@/components/site/SiteFontLinks";
import { SiteScrollProgress } from "@/components/site/SiteScrollProgress";
import { PremiumFxContext, premiumFxValue } from "@/components/site/premium-fx";
import { readPremiumSettings } from "@/lib/builder/premium-effects";
import { nicheEffects, resolveMeterLabel } from "@/lib/builder/premium-niche";
import { isPlaceholderPalette, siteFontStyle, siteThemeStyle } from "@/lib/site-theme";
import { siteFontFor } from "@/lib/site-font-pairings";
import { designSystemCss, designSystemVars } from "@/lib/site-design-system";
import { readComposition } from "@/lib/visual-composition";
import { readBackdrop, readBackdropSpec } from "@/lib/site-effects";
import { trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { SiteVitals } from "@/components/site/SiteVitals";
import { BuilderReturnBar } from "@/components/site/BuilderReturnBar";
import { guardPhoneLayout } from "@/lib/builder/phone-layout";
import { PreviewLinkBridge } from "@/components/site/PreviewLinkBridge";
import { MOBILE_ORDER_ATTR, hasMobileOrder, mobileOrderRules, readBlockStyle, styleSheet } from "@/lib/site-style";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { normalizeHeadingOutline } from "@/lib/builder/heading-outline";
import { legacySectionToComposition } from "@/lib/builder/legacy-composition";
import { foldServicePages, knownPageSlugs, missingChromeLinks, readSiteChrome, repairSiteHref, repairStoredLinks, resolveSiteHref } from "@/lib/builder/site-chrome";
import { scrubPlaceholderContact } from "@/lib/builder/placeholder-contact";
import { tidyContactSections, tidyFooterContact } from "@/lib/builder/footer-contact-tidy";
import { AiSiteHeader } from "@/components/site/AiSiteHeader";
import { useOwnAddress, useSiteBase } from "@/components/site/use-own-address";

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
  const rawChrome = readSiteChrome(site.settings?.generation ?? null);
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
  const addEnquiryForm = needsEnquiryForm(page?.kind, (page as { slug?: string | null } | null)?.slug ?? null, storedSections as never);
  if (addEnquiryForm) pageAnchors.add("contact");
  if (addEnquiryForm || pageHasWidget(storedSections as never, "enquiry_form")) pageAnchors.add("contact-form");
  // Every button and link the AI team authored inside the page's sections
  // (layouts, custom blocks, calculators, booking pickers) gets the same repair.
  // Placeholder contact details (a 555 phone in any format, an example/test email)
  // are withheld from every visible string and tel:/mailto: link the AI team
  // authored: the page shows nothing rather than a made-up number (audit P1-04).
  const placeholderFallback = repairSiteHref("", knownPages, pageAnchors);
  const sections = tidyContactSections(
    scrubPlaceholderContact(
      repairStoredLinks(storedSections, knownPages, pageAnchors, (page as { slug?: string | null } | null)?.slug ?? null),
      placeholderFallback,
    ),
  );
  // Phone-only hide/order choices, minus anything that would take the enquiry
  // form away from phone visitors (see guardPhoneLayout). Array order is the desktop order.
  const phoneSections = guardPhoneLayout(sections.map((section, index) => ({ ...section, sort_order: index })));
  const chrome = {
    header: rawChrome.header ? scrubPlaceholderContact(rawChrome.header, placeholderFallback) : null,
    footer: rawChrome.footer ? tidyFooterContact(scrubPlaceholderContact(rawChrome.footer, placeholderFallback)) : null,
  };
  const chromeHref = (href: string) => resolveSiteHref(href, org.slug, ownAddress, knownPages, pageAnchors, previewBase);
  // Pages the AI menu left out are still offered, so no page is orphaned.
  const missingNav = missingChromeLinks(chrome.header, navRows as never);
  // Single-service pages are flat ("/drain-cleaning"), so they are grouped
  // under the menu's Services link here rather than spread across the bar.
  const servicesFold = chrome.header
    ? foldServicePages(chrome.header, navRows as never, missingNav.map((link) => ({ slug: link.slug, title: pageNavLabel(link.title, org.name, link.slug) })))
    : null;
  const headerTree = servicesFold?.tree ?? chrome.header;
  const extraNav = missingNav.filter((link) => !servicesFold?.folded.has(link.slug.toLowerCase()));
  const sectionRoots = sections.map((section) => readSectionTree(section.settings)?.root ?? null);
  // The canvas follows the trade blueprint: dark trades keep a studio canvas in
  // their own colour (navy for a dentist, iron for a gym), light ones (cleaning,
  // med spa) keep their authored light theme. A business with no category
  // signal keeps the original obsidian studio.
  const blueprint = blueprintFor(org.industry ?? null);
  const studioCanvas = blueprint && blueprint.tone === "dark" ? blueprint.palette : null;
  // Quality bar #22: archetypes marked "dark-to-light" (real estate, law,
  // dentist, landscaping) keep a dark cinematic opening and hand off once to a
  // light canvas; WASH / Car Vault style trades stay dark-only.
  const studioLight = blueprint?.studioTransition === "dark-to-light" ? studioLightPalette(studioCanvas) : null;
  const studioPage = prepareStudioPage(sectionRoots, blueprint?.tone !== "light", blueprint?.studioTransition ?? "dark-only", studioLight);
  // Audit P1-08: exactly one h1 across the whole page, and no skipped heading level.
  // Older plain sections are translated here (with the same lead rule the section
  // itself would use) so their headings count too.
  const leadIndex = leadSectionIndex(sections as never);
  const pageRoots = normalizeHeadingOutline(
    studioPage.roots.map((root, index) => {
      const section = sections[index];
      return root ?? (section ? legacySectionToComposition(section as never, { lead: index === leadIndex })?.root ?? null : null);
    }),
  );

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
          <h1 className="font-display text-[20px] font-semibold">This page is being updated</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Please check back soon.
          </p>
          {preview ? <BuilderReturnBar organizationId={org.id} /> : null}
        </div>
      </div>
    );
  }

  // Premium effects: the owner's switch, the trade's effect tier and the meter label.
  const premium = readPremiumSettings(site.settings?.generation ?? null);
  const niche = nicheEffects(org.industry ?? null);
  const meterLabel = resolveMeterLabel(premium, niche);
  return (
    <PremiumFxContext.Provider value={premiumFxValue(premium.enabled, niche.tier)}>
    <div
      className={`rv-site-root min-h-screen bg-background text-foreground ${designTokenClasses(readDesignTokens(site.settings?.generation ?? null))}`}
      style={{
        ...siteThemeStyle({
          primaryColor: profile?.primary_color ?? null,
          secondaryColor: profile?.secondary_color ?? null,
          accentColor: profile?.accent_color ?? null,
        }),
        ...siteFontStyle(siteFontFor(profile?.font_preference ?? null, org)),
        ...designSystemVars(siteFontFor(profile?.font_preference ?? null, org)),
        // The vars alone do not change the face: body text inherited the app's
        // DM Sans from <body>. The site root sets its own pairing's body face.
        fontFamily: "var(--font-body)",
        ...designTokenVars(readDesignTokens(site.settings?.generation ?? null)),
        ...(studioPage.studio ? studioThemeVars(studioCanvas) : {}),
      }}
      {...(studioPage.studio ? { "data-studio": "" } : {})}
    >
      <SiteFontLinks font={siteFontFor(profile?.font_preference ?? null, org)} />
      {/* Premium design system: type ramp, spacing, rhythm and motion tokens.
          Low-specificity, layered CSS, so any authored style still wins. */}
      <style data-rv-design-system="">{designSystemCss()}</style>
      <SiteBackdrop
        backdrop={readBackdrop(site.settings?.generation ?? null)}
        composition={readComposition(site.settings?.generation ?? null)}
        spec={readBackdropSpec(site.settings?.generation ?? null)}
      />
      <SiteScrollProgress label={meterLabel} />
      <div className="relative z-[1]">
        {/* Owner-only notice: a site still on the neutral placeholder palette
            has no designed look yet. Visitors never see this. */}
        {preview &&
        !readDesignTokens(site.settings?.generation ?? null) &&
        isPlaceholderPalette({
          primaryColor: profile?.primary_color ?? null,
          secondaryColor: profile?.secondary_color ?? null,
        }) ? (
          <div role="status" className="border-b border-border bg-muted px-4 py-3 text-center text-[13px] text-foreground">
            Design in progress: this site is still on a plain placeholder look. Rebuild it from the builder so your AI team designs every part.
          </div>
        ) : null}
        {/* The bar is opaque and uses the site's own foreground colour, so the
            business name stays readable on pale and dark themes alike rather
            than inheriting whatever colour the section below it chose. */}
        {chrome.header ? (
          <AiSiteHeader
            tree={headerTree ?? chrome.header}
            name={org.name}
            homeHref={chromeHref("/")}
            resolveHref={chromeHref}
            surface={profile?.secondary_color ?? null}
            logoUrl={profile?.logo_url ?? null}
            trade={org.industry ?? null}
            phone={(profile as { phone?: string | null } | null)?.phone ?? null}
            ctas={(() => {
              const known = knownPages ?? new Set<string>();
              const contactSlug = ["book", "booking", "contact", "quote", "contact-us"].find((slug) => known.has(slug));
              return stickyActions({
                phone: (profile as { phone?: string | null } | null)?.phone ?? null,
                hasBookingPage: contactSlug === "book" || contactSlug === "booking",
                hasQuote: Boolean(site.quote),
                contactHref: contactSlug ? chromeHref(`/${contactSlug}`) : pageAnchors.has("contact") ? "#contact" : null,
              });
            })()}
            extraLinks={extraNav.map((link) => ({
              href: chromeHref(link.href),
              label: pageNavLabel(link.title, org.name, link.slug),
            }))}
          />
        ) : null}

        {/* Tablet and phone overrides the client set in the visual builder. */}
        <ResponsiveStyles
          sections={phoneSections}
          surface={profile?.secondary_color ?? null}
        />

        {/* A first section that paints its own surface (a full-bleed hero)
            sits directly under the header; only an unpainted first section
            gets the small top gap. */}
        <main {...(hasMobileOrder(phoneSections) ? { [MOBILE_ORDER_ATTR]: "" } : {})} className={`scroll-mt-20 ${firstSectionHasSurface(sections[0]?.settings) ? "" : "pt-2 sm:pt-4 "}pb-24 sm:pb-16`}>
          {(() => {
            const lead = leadIndex;
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
                <SiteSection key={section.id} site={site} section={section} lead={index === lead} first={index === 0} studio={studioPage.studio} studioCanvas={studioCanvas?.canvas ?? STUDIO_CANVAS} preparedRoot={pageRoots[index] ?? null} light={studioPage.lightFrom !== null && index >= studioPage.lightFrom ? studioLight : null} seam={studioPage.lightFrom === index} />
              );
            });
          })()}
          {/* Every contact page — and any page whose buttons point at the
              message form — can always take a message, even when its AI
              layout only listed a phone number and email. */}
          {addEnquiryForm ? (
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
        {preview ? <BuilderReturnBar organizationId={org.id} /> : null}
        {preview ? <PreviewLinkBridge slug={org.slug} /> : null}
      </div>
    </div>
    </PremiumFxContext.Provider>
  );
}

/**
 * Whether the opening section paints its own background: a block colour or
 * image, or a background on its AI layout's root node.
 */
function firstSectionHasSurface(settings: unknown): boolean {
  const style = readBlockStyle(settings);
  if (style.bgColor || style.bgImage) return true;
  const composition = (settings as { composition?: unknown } | null)?.composition;
  const root = (composition as { root?: unknown } | null | undefined)?.root;
  const rootStyle = (root as { style?: unknown } | null | undefined)?.style;
  if (!rootStyle || typeof rootStyle !== "object") return false;
  const background = (rootStyle as Record<string, unknown>)["background"];
  return typeof background === "string" && background.trim().length > 0;
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
  const sheet = [css, mobileOrderRules(sections)].filter(Boolean).join("\n");
  if (!sheet) return null;
  return <style>{sheet}</style>;
}
