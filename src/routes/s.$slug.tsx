import { createFileRoute, notFound, Outlet, useChildMatches } from "@tanstack/react-router";
import { businessFacts } from "@/lib/builder/facts";
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

/**
 * The home address serves whatever the owner actually built. When the builder
 * has a home page with visible sections, that exact page is rendered — the same
 * renderer the other pages and the draft preview use — so the live site can
 * never differ from the editor. A site with no home page yet shows a plain notice; it
 * never falls back to the retired deterministic renderer.
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
  // Business-safe copy only: the name, plus a phone or email when the profile
  // has a real one (businessFacts drops placeholders). Nothing is invented.
  const facts = businessFacts(site?.profile ?? null, site?.org?.name);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-semibold">{facts.businessName ?? "This website"}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This website is being updated. Please check back soon.
        </p>
        {facts.phone && facts.phoneHref ? (
          <p className="mt-4 text-sm">
            <a href={facts.phoneHref} className="inline-block py-2 font-medium underline underline-offset-4">
              Call {facts.phone}
            </a>
          </p>
        ) : null}
        {facts.email && facts.emailHref ? (
          <p className="text-sm">
            <a href={facts.emailHref} className="inline-block py-2 font-medium underline underline-offset-4">
              Email {facts.email}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
