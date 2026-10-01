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
import { isPossibleTenantHost } from "@/lib/revora-address";
import { SitePageView } from "@/routes/s.$slug.$page";
import { metaDescription } from "@/lib/seo";

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const splat = String(params._splat ?? "").replace(/^\/+|\/+$/g, "");
    const pageSlug = splat.split("/")[0] ?? "";
    if (!pageSlug || !/^[a-z0-9-]+$/.test(pageSlug)) throw notFound();
    if (typeof window !== "undefined" && !isPossibleTenantHost(window.location.hostname)) {
      throw notFound();
    }
    const response = await getHostSite({ data: { pageSlug } });
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
    const name = loaderData.site.org.name;
    const title = (page.seo_title || `${page.title} — ${name}`).slice(0, 60);
    const description = (
      page.seo_description ||
      loaderData.site.profile?.tagline ||
      `${page.title} from ${name}.`
    ).slice(0, 158);
    const url = page.seo_canonical || `https://${loaderData.host}/${page.slug}`;
    const shareImage = page.og_image_url || loaderData.site.profile?.hero_image_url || null;
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
      ],
      links: [{ rel: "canonical", href: url }],
    };
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
        <h1 className="font-display text-[22px] font-semibold">Page not found</h1>
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
