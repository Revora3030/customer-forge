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
import { ErrorBoundary } from "@/components/app/ErrorBoundary";

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

/**
 * Slim progress header shown above a live draft while a rebuild or AI update
 * runs. The draft stays visible underneath, so the owner can watch sections
 * change instead of losing the preview to a full-page "still building" screen.
 */
export function DraftUpdatingBanner({
  job,
}: {
  job: { currentStep: string | null; progress: number } | null | undefined;
}) {
  const progress = Math.min(100, Math.max(5, job?.progress ?? 0));
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="draft-updating-banner"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-2 text-xs backdrop-blur"
    >
      <span className="truncate font-medium text-muted-foreground">
        {job?.currentStep
          ? `Updating draft: ${job.currentStep} (${Math.round(job.progress ?? 0)}%)`
          : "Updating draft in background..."}
      </span>
      <div
        className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job?.progress ?? 0)}
        aria-label="Draft update progress"
      >
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function DraftHomeRoute() {
  return (
    <ErrorBoundary
      title="Your draft could not render"
      body="The draft data is safe. Reload the preview or return to the builder."
      backHref="/app/website"
    >
      <DraftHomeRouteContent />
    </ErrorBoundary>
  );
}

function DraftHomeRouteContent() {
  const children = useChildMatches();
  const router = useRouter();
  const result = Route.useLoaderData();
  const retry = () => void router.invalidate().catch(() => undefined);
  // Mid-build reads can return a partial row; never assume an array.
  const rawSections: unknown = result?.site?.content?.sections;
  const sections = Array.isArray(rawSections) ? rawSections : [];

  useEffect(() => {
    if (result?.status !== "pending") return;
    const timer = window.setInterval(() => void router.invalidate().catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, [result?.status, router]);

  if (children.length > 0) return <Outlet />;

  // A draft that already has sections stays visible during rebuilds and AI
  // updates; only a brand-new empty first build gets the full-page message.
  if (result?.site && sections.length > 0 && (result.status === "pending" || result.status === "ready")) {
    return (
      <>
        {result.status === "pending" ? <DraftUpdatingBanner job={result.job} /> : null}
        <PublicSiteView site={result.site} preview />
      </>
    );
  }

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
