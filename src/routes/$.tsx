/**
 * Catch-all route.
 *
 * On a customer's own verified custom domain this serves that client's inner
 * pages — `/services`, `/pricing`, `/book` — straight from the builder, on their
 * own address. Revora-owned subdomains are never client hosts. On Revora's own
 * marketing site the same path is simply a page that doesn't exist.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteAddressProvider } from "@/components/site/site-links-context";
import { getHostSite } from "@/lib/host-site.functions";
import { SitePageView } from "@/routes/s.$slug.$page";
import { tenantSiteHead } from "@/lib/site-head";

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const splat = String(params._splat ?? "").replace(/^\/+|\/+$/g, "");
    const pageSlug = splat.split("/")[0] ?? "";
    if (!pageSlug || !/^[a-z0-9-]+$/.test(pageSlug)) throw notFound();
    // A failed host lookup must never become a 500: show "page not found".
    let response: Awaited<ReturnType<typeof getHostSite>>;
    try {
      response = await getHostSite({ data: { pageSlug } });
    } catch (error) {
      console.warn("[host-site] lookup failed", error);
      throw notFound();
    }
    // A page with no visible sections renders blank for a real visitor — treat
    // it as not published yet instead of serving an empty page.
    if (!response?.result?.site?.content?.sections?.length) throw notFound();

    return response.result;
  },
  head: ({ loaderData }) => {
    const page = loaderData?.site.content?.page;
    if (!page || !loaderData) {
      return { meta: [{ title: "Page not found" }, { name: "robots", content: "noindex" }] };
    }
    // Same rule as the other site routes: only an absolute https canonical is
    // trusted; anything else would point search engines at a broken address.
    const explicit = String(page.seo_canonical ?? "").trim();
    const url = explicit.startsWith("https://")
      ? explicit
      : `https://${loaderData.host}/${page.slug}`;
    return tenantSiteHead({
      site: loaderData.site,
      pageSlug: page.slug,
      canonical: url,
      businessUrl: `https://${loaderData.host}/`,
    });
  },
  component: HostPageRoute,
  notFoundComponent: NotFoundPage,
  errorComponent: NotFoundPage,
});

function HostPageRoute() {
  const data = Route.useLoaderData();
  return (
    <SiteAddressProvider ownAddress>
      <SitePageView site={data.site} />
    </SiteAddressProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-editorial text-balance text-[22px]">Page not found</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          This address isn&apos;t in use. Check the link, or start from the home page.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/">Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
