/**
 * The owner's private draft of their own website home page, used by the live
 * preview inside the builder. The public address (`/s/:slug`) only serves a
 * published site, so building a first website would show "business not found"
 * there. This route shows the work in progress instead, to signed-in members
 * of that business only.
 */
import { createFileRoute, Link, Outlet, useChildMatches, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";
import { RenderErrorBoundary } from "@/components/app/RenderErrorBoundary";

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
  const children = useChildMatches();
  const router = useRouter();
  const result = Route.useLoaderData();

  if (children.length > 0) return <Outlet />;

  const retry = () => void router.invalidate();
  const sections = result?.site?.content?.sections ?? [];

  if (result?.status === "pending") {
    return (
      <DraftMessage
        title="Your website is still being built"
        body={
          result.job?.currentStep
            ? `Revora is ${result.job.currentStep}. This preview will refresh automatically.`
            : "Revora is finishing your website. This preview will refresh automatically."
        }
        progress={result.job?.progress ?? null}
        action={
          <Button asChild variant="signal">
            <Link to="/app/website">Open builder</Link>
          </Button>
        }
        onRetry={retry}
      />
    );
  }

  if (result?.status === "ready" && result.site && sections.length > 0) {
    return (
      <RenderErrorBoundary
        title="Your draft couldn't render"
        body="The draft data is safe. Reload the preview or return to the builder."
        backHref="/app/website"
      >
        <PublicSiteView site={result.site} preview />
      </RenderErrorBoundary>
    );
  }

  return (
    <DraftMessage
      title="Nothing to preview yet"
      body="Your answers are saved. Start or reopen the website build in the builder."
      action={
        <Button asChild variant="signal">
          <Link to="/app/website">Open builder</Link>
        </Button>
      }
      onRetry={retry}
    />
  );
}
