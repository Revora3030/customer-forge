/**
 * The owner's private draft of their own website home page, used by the live
 * preview inside the builder. The public address (`/s/:slug`) only serves a
 * published site, so building a first website would show "business not found"
 * there. This route shows the work in progress instead, to signed-in members
 * of that business only.
 */
import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";

export const Route = createFileRoute("/_authenticated/draft/$slug")({
  loader: async ({ params }) => getOwnerDraftSite({ data: { slug: params.slug } }),
  head: () => ({
    meta: [
      { title: "Website draft — Revora" },
      {
        name: "description",
        content: "A private preview of your website while you build it.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Website draft — Revora" },
      { property: "og:description", content: "A private preview of a website in progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DraftHomeRoute,
  errorComponent: () => (
    <DraftMessage
      title="This draft couldn't load"
      body="Refresh the preview, or reload the builder and try again."
    />
  ),
});

export function DraftMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[20px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{body}</p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link to="/app/website">
            <ArrowLeft className="size-4" /> Back to builder
          </Link>
        </Button>
      </div>
    </div>
  );
}

function DraftHomeRoute() {
  // `/draft/:slug/:page` nests under this route, so inner pages render instead
  // of the home page.
  const children = useChildMatches();
  const site = Route.useLoaderData();
  if (children.length > 0) return <Outlet />;
  if (!site) {
    return (
      <DraftMessage
        title="Nothing to preview yet"
        body="Once your website has been built, it appears here."
      />
    );
  }
  return <PublicSiteView site={site} preview />;
}
