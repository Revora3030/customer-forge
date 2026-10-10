import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { PreviewMessage } from "@/components/PreviewMessage";
import { SiteBaseContext } from "@/components/site/site-address-context";
import { metaDescription } from "@/lib/seo";

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
  const { token } = Route.useParams();
  if (!result?.ok || !result.site) {
    return (
      <PreviewMessage
        title="This preview link isn't valid"
        body="Check the address, or ask for a new link."
      />
    );
  }
  return (
    <SiteBaseContext.Provider value={`/p/${encodeURIComponent(token)}`}>
      <PublicSiteView site={result.site} preview />
    </SiteBaseContext.Provider>
  );
}
