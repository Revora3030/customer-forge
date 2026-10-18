import { createFileRoute, notFound, Outlet, useChildMatches } from "@tanstack/react-router";
import { getPublicSite, trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { canonicalSiteUrl } from "@/lib/revora-address";
import { SitePageView } from "@/routes/s.$slug.$page";
import { tenantSiteHead } from "@/lib/site-head";

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
    const page = loaderData.content?.page ?? null;
    // Canonical and og:url point at this page itself unless the client set
    // their own canonical address (e.g. after moving to a custom domain).
    const url =
      canonicalSiteUrl(loaderData.settings, params.slug, page?.slug, page?.seo_canonical) ??
      `https://revoragrowthsystems.com/s/${params.slug}`;
    // One head for every client address (title limits, share image, fonts,
    // LocalBusiness data): src/lib/site-head.ts tenantSiteHead.
    return tenantSiteHead({
      site: loaderData,
      pageSlug: null,
      canonical: url,
      businessUrl: canonicalSiteUrl(loaderData.settings, params.slug) ?? url,
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
  if ((site?.content?.sections ?? []).length > 0) {
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
