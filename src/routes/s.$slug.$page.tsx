/**
 * A single structured page of a published business website
 * (`/s/:slug/:page`) — service pages, area pages, pricing, booking, FAQ and
 * anything else the builder laid out. Each one carries its own metadata and its
 * own lead-capture blocks.
 *
 * The page renderer lives in components/site/SitePageView.tsx. It is imported
 * here only by the route component, which the router code-splits, so Revora's
 * marketing pages never download the builder renderer.
 */
import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getPublicSite } from "@/lib/public-site.functions";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { tenantSiteHead } from "@/lib/site-head";
import { SitePageView } from "@/components/site/SitePageView";

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
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, params.page, page.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}/${params.page}`;
    // Shared client head (src/lib/site-head.ts): word-safe title, share image,
    // fonts and LocalBusiness data, identical on every client address.
    return tenantSiteHead({
      site: loaderData,
      pageSlug: params.page,
      canonical: url,
      businessUrl: canonicalSiteUrl(loaderData.settings, params.slug) ?? url,
    });
  },
  component: SitePageRoute,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <p className="text-[14px] text-muted-foreground">
        This page couldn't load. Please refresh and try again.
      </p>
    </div>
  ),
  notFoundComponent: PageNotFound,
});

/** A missing page is a way back into the business, not a dead end. */
function PageNotFound() {
  const { slug } = useParams({ strict: false }) as { slug?: string };
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[22px] font-semibold">Page not found</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">This page isn't published yet.</p>
        {slug ? (
          <Button asChild className="mt-5 min-h-11">
            <Link to="/s/$slug" params={{ slug }}>
              Back to the home page
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SitePageRoute() {
  return <SitePageView site={Route.useLoaderData()} />;
}
