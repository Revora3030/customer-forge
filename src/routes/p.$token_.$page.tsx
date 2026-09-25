import { createFileRoute } from "@tanstack/react-router";
import { getPreviewSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { PreviewMessage } from "@/components/PreviewMessage";

/** Sub-pages of a private draft preview link, checked on the server like the home page. */
export const Route = createFileRoute("/p/$token_/$page")({
  loader: async ({ params }) =>
    getPreviewSite({ data: { token: params.token, pageSlug: params.page } }),
  head: () => ({
    meta: [
      { title: "Website draft page preview — Revora" },
      { name: "description", content: "A private, time-limited preview of a website draft page." },
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
  if (!result?.ok || !result.site) {
    return (
      <PreviewMessage
        title="This preview link isn't valid"
        body="Check the address, or ask for a new link."
      />
    );
  }
  return <PublicSiteView site={result.site} preview />;
}
