import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/components/site/PublicSiteView";
import { ClientPrivacyNotice } from "@/components/site/ClientPrivacyNotice";
import { PRIVACY_NOTICE_SLUG } from "@/lib/privacy-notice-slug";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";
import { ProspectClaimBar } from "@/components/site/ProspectClaimBar";
import { PreviewBeacon } from "@/components/site/PreviewBeacon";
import { previewHeadTitle } from "@/lib/builder/draft-route";
import { metaDescription } from "@/lib/seo";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { privatePreviewHeaders } from "@/lib/page-cache";
import { isBuilderPreviewLabel } from "@/lib/builder/builder-preview-link";
import { BuilderPreviewMode } from "@/components/site/BuilderPreviewMode";

/** Sub-pages of a private draft preview link, checked on the server like the home page. */
export const Route = createFileRoute("/p/$token_/$page")({
  beforeLoad: ({ params, location }) => {
    if (params.page === "home") throw redirect({
      to: "/p/$token",
      params: { token: params.token },
      search: true,
      hash: location.hash,
      replace: true,
    });
  },
  // A dead link or a page the draft does not have answers HTTP 404, not 200.
  loader: async ({ params }) => {
    const result = await getPreviewSite({ data: { token: params.token, pageSlug: params.page } });
    if (!result?.ok || !result.site) throw notFound({ data: { reason: result?.reason ?? "unknown" } });
    const privacyNotice = !result.site.content?.sections.length && params.page === PRIVACY_NOTICE_SLUG;
    if (!privacyNotice && (!result.site.pageFound || !result.site.content?.sections.length)) {
      throw notFound({ data: { reason: "page" } });
    }
    return result;
  },
  // Never stored, indexed or sent on as a referrer (src/lib/page-cache.ts).
  headers: () => privatePreviewHeaders(),
  head: async ({ loaderData, params }) => {
    const { heroPreloadLinks } = await import("@/lib/site-head");
    return {
      links: loaderData?.ok ? heroPreloadLinks(loaderData.site?.content?.sections) : [],
      meta: [
        { title: previewHeadTitle(loaderData, params.page) },
        { name: "description", content: metaDescription("A private, time-limited preview of a website draft page.") },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: previewHeadTitle(loaderData, params.page) },
        { property: "og:description", content: "A private preview link for reviewing a draft page." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: PreviewPageRoute,
  notFoundComponent: PreviewPageNotFound,
  errorComponent: () => (
    <PreviewMessage title="This preview page isn't available" body="Ask for a new link." />
  ),
});

function PreviewPageRoute() {
  const result = Route.useLoaderData();
  const { token, page } = Route.useParams();
  if (!result.site) return null;
  if (!result.site.content?.sections.length && page === PRIVACY_NOTICE_SLUG) {
    return (
      <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
        <ClientPrivacyNotice site={result.site} />
      </SiteBaseContext.Provider>
    );
  }
  if (isBuilderPreviewLabel(result.label)) {
    return (
      <BuilderPreviewMode organizationId={result.site.org.id}>
        <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
          <PublicSiteView site={result.site} preview />
        </SiteBaseContext.Provider>
      </BuilderPreviewMode>
    );
  }
  return (
    <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
      <PublicSiteView site={result.site} preview />
      <ProspectClaimBar token={token} page={page} />
      <PreviewBeacon token={token} page={page} />
    </SiteBaseContext.Provider>
  );
}

function PreviewPageNotFound({ data }: { data?: unknown }) {
  const { token } = Route.useParams();
  const reason = (data as { reason?: string } | undefined)?.reason;
  if (reason === "page") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">This preview page isn't ready</h1>
          <p className="text-sm text-muted-foreground">You can still review the rest of the website.</p>
          <Button asChild><Link to="/p/$token" params={{ token }}>Back to preview</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <PreviewMessage
      title={reason === "expired" ? "This preview link has expired" : reason === "revoked" ? "This preview link was switched off" : "This preview link isn't valid"}
      body={reason === "expired" || reason === "revoked" ? "Ask for a fresh preview link." : "Check the address, or ask for a new link."}
    />
  );
}
