import { createFileRoute, notFound, Outlet, useChildMatches } from "@tanstack/react-router";
import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MapPin, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { BookingForm, QuoteCalculator } from "@/components/site/SiteForms";
import { getPublicSite, trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { currency, dateShort } from "@/lib/format";
import { readSeo } from "@/lib/site-seo";
import { readCopy } from "@/lib/site-engine";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { SiteNav, SitePageView } from "@/routes/s.$slug.$page";
import { StickyCallBar, siteDesignFingerprint } from "@/components/site/SiteSections";
import { SiteVitals } from "@/components/site/SiteVitals";
import { businessFacts } from "@/lib/builder/facts";
import { placeDisplay } from "@/lib/builder/presentation";
import { playbookFor, schemaTypeFor } from "@/lib/builder/industry";
import { safeLinkUrl } from "@/lib/website-content";
import { SiteBackdrop } from "@/components/site/SiteBackdrop";
import { siteFontHref, siteFontStyle, siteThemeStyle } from "@/lib/site-theme";
import { readComposition } from "@/lib/visual-composition";
import { readBackdrop } from "@/lib/site-effects";
import { fingerprintClassNames } from "@/lib/builder/design-fingerprint";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }) => {
    const site = await getPublicSite({ data: { slug: params.slug } });
    if (!site) throw notFound();
    return site;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Business not found" }, { name: "robots", content: "noindex" }],
      };
    }
    const name = loaderData.org.name;
    const city = placeDisplay(loaderData.profile?.city);
    const page = loaderData.content?.page ?? null;
    const generated = readCopy(
      (loaderData.settings?.generation as { copy?: unknown } | null)?.copy,
    );
    const title = (
      page?.seo_title ||
      generated?.metaTitle ||
      `${name}${city ? ` — ${city}` : ""}`
    ).slice(0, 60);
    const description = (
      page?.seo_description ||
      generated?.metaDescription ||
      readSeo(loaderData.settings?.seo).meta_description ||
      loaderData.profile?.tagline ||
      `Book ${name}${city ? ` in ${city}` : ""} online. See services, prices and reviews.`
    ).slice(0, 158);
    // Canonical and og:url point at this page itself unless the client set
    // their own canonical address (e.g. after moving to a custom domain).
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, page?.slug, page?.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}`;
    const shareImage = page?.og_image_url || loaderData.profile?.hero_image_url || null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: page?.og_title || title },
        { property: "og:description", content: page?.og_description || description },
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
        ...(page?.noindex ? [{ name: "robots", content: "noindex" }] : []),
      ],
      links: [
        { rel: "canonical", href: url },
        // The owner's chosen heading font has to be requested here or their
        // look-and-feel choice would be stored but never seen.
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
  component: PublicSiteRoute,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <p className="text-[14px] text-muted-foreground">
        This business page couldn't load. Please refresh and try again.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[22px] font-semibold">Business not found</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">This web address isn't in use yet.</p>
      </div>
    </div>
  ),
});

function PublicSiteRoute() {
  // `/s/:slug/:page` nests under this route, so inner pages must render instead
  // of the home page — otherwise every deep link would show the home layout.
  const children = useChildMatches();
  const site = Route.useLoaderData();
  if (children.length > 0) return <Outlet />;
  return <PublicSiteView site={site} />;
}

/**
 * The home address serves whatever the owner actually built. When the builder
 * has a home page with visible sections, that exact page is rendered — the same
 * renderer the other pages and the draft preview use — so the live site can
 * never differ from the editor. A missing AI-authored page fails clearly; it
 * never falls back to the retired deterministic template renderer.
 */
export function PublicSiteView({
  site,
  preview = false,
}: {
  site: NonNullable<PublicSite>;
  preview?: boolean;
}) {
  if (site.content && site.content.sections.length > 0) {
    return <SitePageView site={site} preview={preview} />;
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-semibold">This website is still being built</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No AI-authored home page is ready yet. Nothing was replaced with a template.
        </p>
      </div>
    </main>
  );
}
