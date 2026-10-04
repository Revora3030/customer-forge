/**
 * The owner's private draft of their own website home page, used by the live
 * preview inside the builder. The public address (`/s/:slug`) only serves a
 * published site, so building a first website would show "business not found"
 * there. This route shows the work in progress instead, to signed-in members
 * of that business only.
 */
import { createFileRoute, Link, Outlet, useChildMatches, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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

export function DraftMessage({
  title,
  body,
  action,
  onRetry,
  progress,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  onRetry?: () => void;
  progress?: number | null;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-[20px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{body}</p>
        {typeof progress === "number" ? (
          <div className="mx-auto mt-4 w-full max-w-xs">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(progress)}% complete</p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {action}
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Button asChild variant={action || onRetry ? "ghost" : "outline"} size="sm">
            <Link to="/app/website">
              <ArrowLeft className="size-4" /> Back to builder
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DraftHomeRoute() {
  return (
    <RenderErrorBoundary
      title="Your draft could not render"
      body="The draft data is safe. Reload the preview or return to the builder."
      backHref="/app/website"
    >
      <DraftHomeRouteContent />
    </RenderErrorBoundary>
  );
}

function DraftHomeRouteContent() {
  const children = useChildMatches();
  const router = useRouter();
  const result = Route.useLoaderData();
  const retry = () => void router.invalidate();
  const sections = result?.site?.content?.sections ?? [];

  useEffect(() => {
    if (result?.status !== "pending") return;
    const timer = window.setInterval(() => void router.invalidate(), 2500);
    return () => window.clearInterval(timer);
  }, [result?.status, router]);

  if (children.length > 0) return <Outlet />;

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
    return <PublicSiteView site={result.site} preview />;
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
