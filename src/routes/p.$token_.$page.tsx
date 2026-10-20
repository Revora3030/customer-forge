import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";
import { ProspectClaimBar } from "@/components/site/ProspectClaimBar";
import { PreviewBeacon } from "@/components/site/PreviewBeacon";
import { metaDescription } from "@/lib/seo";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

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
  loader: async ({ params }) =>
    getPreviewSite({ data: { token: params.token, pageSlug: params.page } }),
  head: () => ({
    meta: [
      { title: "Website draft page preview — Revora" },
      { name: "description", content: metaDescription("A private, time-limited preview of a website draft page.") },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Website draft page preview — Revora" },
      { property: "og:description", content: "A private preview link for reviewing a draft page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreviewPageRoute,
  errorComponent: () => (
    <PreviewMessage title="This preview page isn't available" body="Ask for a new link." />
  ),
});

function PreviewPageRoute() {
  const result = Route.useLoaderData();
  const { token, page } = Route.useParams();
  if (!result?.ok || !result.site) {
    const reason = result?.reason;
    return (
      <PreviewMessage
        title={reason === "expired" ? "This preview link has expired" : reason === "revoked" ? "This preview link was switched off" : "This preview link isn't valid"}
        body={reason === "expired" || reason === "revoked" ? "Ask for a fresh preview link." : "Check the address, or ask for a new link."}
      />
    );
  }
  if (!result.site.pageFound || !result.site.content?.sections.length) {
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
    <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
      <PublicSiteView site={result.site} preview />
      <ProspectClaimBar token={token} page={page} />
      <PreviewBeacon token={token} page={page} />
    </SiteBaseContext.Provider>
  );
}
