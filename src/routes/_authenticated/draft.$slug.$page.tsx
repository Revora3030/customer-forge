/**
 * A single page of the owner's private website draft, shown by the live preview
 * inside the builder. Unlike the public address, this serves unpublished work —
 * including pages and sections that are switched off — to signed-in members of
 * that business only.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { SitePageView } from "@/routes/s.$slug.$page";
import { DraftMessage } from "@/routes/_authenticated/draft.$slug";

export const Route = createFileRoute("/_authenticated/draft/$slug/$page")({
  loader: async ({ params }) =>
    getOwnerDraftSite({ data: { slug: params.slug, pageSlug: params.page } }),
  head: () => ({
    meta: [
      { title: "Website page draft — Revora" },
      {
        name: "description",
        content: "A private preview of one page of your website while you build it.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Website page draft — Revora" },
      { property: "og:description", content: "A private preview of a website page in progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DraftPageRoute,
  errorComponent: () => (
    <DraftMessage
      title="This page couldn't load"
      body="Refresh the preview, or reload the builder and try again."
    />
  ),
});

function DraftPageRoute() {
  const site = Route.useLoaderData();
  if (!site?.content || site.content.sections.length === 0) {
    return (
      <DraftMessage
        title="This page is empty so far"
        body="Add a section to it and the preview will fill in."
      />
    );
  }
  return <SitePageView site={site} preview />;
}
