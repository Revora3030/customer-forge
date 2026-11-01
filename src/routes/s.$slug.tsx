import { createFileRoute, notFound, Outlet, useChildMatches } from "@tanstack/react-router";
import { getPublicSite } from "@/lib/public-site.functions";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { PublicSiteView } from "@/components/site/PublicSiteView";
import { tenantSiteHead } from "@/lib/site-head";
import { isLeafMatch } from "@/lib/page-cache";

export const Route = createFileRoute("/s/$slug")({
  loader: async ({ params }) => {
    const site = await getPublicSite({ data: { slug: params.slug } });
    if (!site) throw notFound();
    return site;
  },
  head: ({ loaderData, params, matches, match }) => {
    if (!loaderData) {
      return {
        // Unpublished drafts and unknown addresses look the same to the public
        // (still a 404 status), and are never indexed.
        meta: [{ title: "This website is being updated" }, { name: "robots", content: "noindex, nofollow" }],
      };
    }
    const page = loaderData.content?.page ?? null;
    // Canonical and og:url point at this page itself unless the client set
    // their own canonical address (e.g. after moving to a custom domain).
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, null, page?.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}`;
    // One head for every client address (title limits, share image, fonts,
    // LocalBusiness data): src/lib/site-head.ts tenantSiteHead.
    return tenantSiteHead({
      site: loaderData,
      pageSlug: null,
      canonical: url,
      businessUrl: canonicalSiteUrl(loaderData.settings, params.slug) ?? url,
      // Only the page actually shown preloads its opening picture.
      preloadHero: isLeafMatch(matches, match),
    });
  },
  component: PublicSiteRoute,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <p className="text-[14px] text-muted-foreground">
        This business page couldn't load. Please refresh and try again.
      </p>
    </div>
  ),
  notFoundComponent: SitePreviewNotice,
});

/**
 * Shown when /s/:slug has no published site: usually a draft that hasn't gone
 * live yet. It never says whether a business exists, so it can't be used to
 * probe, and it carries no builder or sign-in wording for the public. The
 * owner reaches their draft preview from the app, not from this page.
 */
function SitePreviewNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-[22px] font-semibold">This website is being updated</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">Please check back soon.</p>
      </div>
    </main>
  );
}

function PublicSiteRoute() {
  // `/s/:slug/:page` nests under this route, so inner pages must render instead
  // of the home page — otherwise every deep link would show the home layout.
  const children = useChildMatches();
  const site = Route.useLoaderData();
  if (children.length > 0) return <Outlet />;
  return <PublicSiteView site={site} />;
}
