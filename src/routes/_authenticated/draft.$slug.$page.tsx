/**
 * A single page of the owner's private website draft, shown by the live preview
 * inside the builder. Unlike the public address, this serves unpublished work —
 * including pages and sections that are switched off — to signed-in members of
 * that business only.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { RenderErrorBoundary } from "@/components/app/RenderErrorBoundary";
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
  return (
    <RenderErrorBoundary
      title="This draft page could not render"
      body="The page data is safe. Reload the preview or return to the builder."
      backHref="/app/website"
    >
      <DraftPageRouteContent />
    </RenderErrorBoundary>
  );
}

function DraftPageRouteContent() {
  const router = useRouter();
  const result = Route.useLoaderData();
  const sections = result?.site?.content?.sections ?? [];

  useEffect(() => {
    if (result?.status !== "pending") return;
    const timer = window.setInterval(() => void router.invalidate(), 2500);
    return () => window.clearInterval(timer);
  }, [result?.status, router]);

  if (result?.status === "pending") {
    return (
      <DraftMessage
        title="This page is still being built"
        body={
          result.job?.currentStep
            ? `Revora is ${result.job.currentStep}. The preview will refresh automatically.`
            : "Revora is finishing this page. The preview will refresh automatically."
        }
        progress={result.job?.progress ?? null}
        action={
          <Link
            to="/app/website"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Open builder
          </Link>
        }
        onRetry={() => void router.invalidate()}
      />
    );
  }

  if (result?.status === "ready" && result.site && sections.length > 0) {
    return <SitePageView site={result.site} preview />;
  }

  return (
    <DraftMessage
      title="This page is empty so far"
      body="Revora has your workspace data, but this page has no generated sections yet."
      action={
        <Link
          to="/app/website"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Open builder
        </Link>
      }
      onRetry={() => void router.invalidate()}
    />
  );
}
