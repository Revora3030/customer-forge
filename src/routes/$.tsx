/**
 * Catch-all route.
 *
 * On a customer's own verified custom domain this serves that client's inner
 * pages — `/services`, `/pricing`, `/book` — straight from the builder, on their
 * own address. Revora-owned subdomains are never client hosts. On Revora's own
 * marketing site the same path is simply a page that doesn't exist.
 */
import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteAddressProvider } from "@/components/site/site-links-context";
import { getHostSite } from "@/lib/host-site.functions";
import { SiteFontLinks } from "@/components/site/SiteFontLinks";
import { businessFacts } from "@/lib/builder/facts";
import { siteFontFor } from "@/lib/site-font-pairings";
import { siteFontStyle } from "@/lib/site-theme";
import { SitePageView } from "@/components/site/SitePageView";
import { ClientPrivacyNotice } from "@/components/site/ClientPrivacyNotice";
import { PRIVACY_NOTICE_SLUG } from "@/lib/client-privacy-notice";
import { isDuplicatePrivacySlug } from "@/lib/privacy-notice-slug";
import { tenantSiteHead } from "@/lib/site-head";

/** What the business's own 404 page may show: only facts the owner gave us, only when the lookup found the site. */
type HostBusiness = { name: string; phone: string | null; phoneHref: string | null; font: string };
type HostSiteResponse = Awaited<ReturnType<typeof getHostSite>>;
const hostBusiness = (response: HostSiteResponse | undefined): HostBusiness | null => {
  const site = response?.result?.site;
  if (!site) return null;
  const facts = businessFacts(site.profile ?? null, site.org?.name);
  if (!facts.businessName) return null;
  return {
    name: facts.businessName,
    phone: facts.phone,
    phoneHref: facts.phoneHref,
    font: siteFontFor(site.profile?.font_preference ?? null, site.org ?? {}),
  };
};

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const splat = String(params._splat ?? "").replace(/^\/+|\/+$/g, "");
    const pageSlug = splat.split("/")[0] ?? "";
    // Only one path segment is a page: /services is, /services/anything/else is not.
    if (!pageSlug || splat.includes("/") || !/^[a-z0-9-]+$/.test(pageSlug)) throw notFound();
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
    // The generated notice replaces an AI-written /privacy-policy page (privacy-notice-slug.ts).
    if (response?.result?.site && isDuplicatePrivacySlug(pageSlug)) throw redirect({ href: `/${PRIVACY_NOTICE_SLUG}`, statusCode: 302 });
    // Every client site has a generated privacy notice unless the owner built a page there.
    if (!response?.result?.site?.content?.sections?.length && response?.result?.site && pageSlug === PRIVACY_NOTICE_SLUG) {
      return response.result;
    }
    if (!response?.result?.site?.content?.sections?.length) throw notFound({ data: hostBusiness(response) });

    return response.result;
  },
  head: ({ loaderData }) => {
    if (loaderData && !loaderData.site.content?.sections?.length) {
      return { meta: [{ title: `Privacy and cookie notice | ${loaderData.site.org.name}` }, { name: "robots", content: "noindex" }] };
    }
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
  errorComponent: ErrorPage,
});

function HostPageRoute() {
  const data = Route.useLoaderData();
  return (
    <SiteAddressProvider ownAddress>
      {data.site.content?.sections?.length ? <SitePageView site={data.site} /> : <ClientPrivacyNotice site={data.site} />}
    </SiteAddressProvider>
  );
}

/** Same look as the business's site: its body face, its name and phone when we have them. */
function HostMessagePage({ business, title, message }: { business: HostBusiness | null; title: string; message: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 text-center"
      style={{ ...(business ? siteFontStyle(business.font) : {}), fontFamily: business ? "var(--font-body, system-ui, sans-serif)" : "system-ui, sans-serif" }}
    >
      {business ? <SiteFontLinks font={business.font} /> : null}
      <div>
        {business ? <p className="mb-3 text-[14px] font-medium">{business.name}</p> : null}
        <h1 className="text-balance text-[22px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{message}</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/">Go to the home page</Link>
        </Button>
        {business?.phone && business.phoneHref ? (
          <p className="mt-3 text-[14px]">
            <a href={business.phoneHref} className="inline-block py-2 underline underline-offset-4">
              Call {business.phone}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function NotFoundPage({ data }: { data?: unknown }) {
  const business = data && typeof data === "object" && "name" in data ? (data as HostBusiness) : null;
  return (
    <HostMessagePage
      business={business}
      title="Page not found"
      message="This address isn't in use. Check the link, or start from the home page."
    />
  );
}

/** A real failure is not "page not found": say it couldn't load and ask for a refresh. */
function ErrorPage() {
  return <HostMessagePage business={null} title="This page couldn't load." message="Please refresh." />;
}
