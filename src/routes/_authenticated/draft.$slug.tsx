/**
 * The owner's private draft of their own website home page, used by the live
 * preview inside the builder. The public address (`/s/:slug`) only serves a
 * published site, so building a first website would show "business not found"
 * there. This route shows the work in progress instead, to signed-in members
 * of that business only.
 */
import { SiteBaseContext } from "@/components/site/site-address-context";
import { createFileRoute, Link, Outlet, useChildMatches, useRouter } from "@tanstack/react-router";
import { DRAFT_PENDING_MS, isDraftChildPath, draftHeadTitle } from "@/lib/builder/draft-route";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOwnerDraftSite } from "@/lib/public-site.functions";
import { DRAFT_CHANNEL } from "@/lib/builder/preview-bridge";
import { shouldRefreshDraft } from "@/lib/builder/draft-refresh";
import { PreviewModeContext } from "@/components/site/preview-mode-context";
import { stepLabel } from "@/lib/site-engine";
import { PublicSiteView } from "@/components/site/PublicSiteView";
import { DRAFT_LOAD_TIMEOUT_MS, withTimeout } from "@/lib/builder/no-progress";
import { ErrorBoundary } from "@/components/app/ErrorBoundary";

export const Route = createFileRoute("/_authenticated/draft/$slug")({
  // An inner page (/draft/<slug>/services) loads its own data; loading the
  // home draft as well only delayed it.
  loader: async ({ params, location }) =>
    isDraftChildPath(location.pathname, params.slug)
      ? null
      : // Never "Loading…" forever: after the limit the error screen offers a retry.
        withTimeout(getOwnerDraftSite({ data: { slug: params.slug } }), DRAFT_LOAD_TIMEOUT_MS, "The draft took too long to load."),
  // This route renders only in the browser (the signed-in area has no server
  // render), so without a pending screen a slow load was a blank black page.
  pendingMs: DRAFT_PENDING_MS,
  pendingComponent: () => (
    <DraftMessage title="Loading your draft…" body="Getting the latest version of your site." />
  ),
  head: ({ loaderData }) => ({
    meta: [
      { title: draftHeadTitle(loaderData) },
      {
        name: "description",
        content: "A private preview of your website while you build it.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: draftHeadTitle(loaderData) },
      { property: "og:description", content: "A private preview of a website in progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DraftHomeRoute,
  errorComponent: DraftLoadError,
});

function DraftLoadError({ reset }: { error?: unknown; reset?: () => void }) {
  const router = useRouter();
  return (
    <DraftMessage
      title="This draft couldn't load"
      body="The preview took too long or hit a problem. Your website is safe. Try again, or go back to the builder."
      onRetry={() => {
        reset?.();
        void router.invalidate().catch(() => undefined);
      }}
    />
  );
}

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
        <h1 className="font-editorial text-[26px] leading-tight">{title}</h1>
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
  held = false,
}: {
  job: { currentStep: string | null; progress: number } | null | undefined;
  /** The preview shows the pre-rebuild site while a fresh rebuild runs. */
  held?: boolean;
}) {
  const progress = Math.min(100, Math.max(5, job?.progress ?? 0));
  // The job stores a step KEY ("wording"); show the owner the readable label.
  const step = job?.currentStep ? stepLabel(job.currentStep) : null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="draft-updating-banner"
      // Floating, non-blocking badge: the draft underneath stays fully visible
      // and clickable. Long stage titles wrap (never clip) on narrow phones.
      className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex justify-center sm:inset-x-auto sm:right-4"
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-background/95 px-4 py-2.5 text-xs text-foreground shadow-lg backdrop-blur">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="min-w-0 flex-1 break-words leading-snug">
          <span className="font-medium">Sol is drafting revisions…</span>
          {held ? (
            <span className="block text-muted-foreground" data-testid="draft-held-note">
              Showing your current site; the new version appears when it is ready.
            </span>
          ) : null}
          {step ? (
            <span className="block text-muted-foreground">
              {step} · {Math.round(job?.progress ?? 0)}%
            </span>
          ) : null}
        </span>
        <div
          className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(job?.progress ?? 0)}
          aria-label="Draft update progress"
        >
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
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

  // A change saved in another tab (builder, inline edit) reloads this draft.
  useEffect(() => {
    // Inside the builder's own frame the builder already reloads it.
    if (typeof BroadcastChannel === "undefined" || window.parent !== window) return;
    const channel = new BroadcastChannel(DRAFT_CHANNEL);
    channel.onmessage = (event) => {
      if (shouldRefreshDraft(event.data, result?.site?.org.id)) void router.invalidate().catch(() => undefined);
    };
    return () => channel.close();
  }, [router, result?.site?.org.id]);

  useEffect(() => {
    if (result?.status !== "pending") return;
    const timer = window.setInterval(() => void router.invalidate().catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, [result?.status, router]);

  // Coming back from an inner page, this route has not loaded the home draft
  // yet (it skips that while an inner page is open): load it now.
  const needsHome = children.length === 0 && result === null;
  useEffect(() => {
    if (needsHome) void router.invalidate().catch(() => undefined);
  }, [needsHome, router]);
  // Past the limit the loading screen becomes an error with a retry.
  const [stuckLoading, setStuckLoading] = useState(false);
  const [stuckAttempt, setStuckAttempt] = useState(0);
  useEffect(() => {
    setStuckLoading(false);
    if (!needsHome) return;
    const timer = window.setTimeout(() => setStuckLoading(true), DRAFT_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [needsHome, stuckAttempt]);

  if (children.length > 0) return <Outlet />;
  if (needsHome)
    return stuckLoading ? (
      <DraftMessage
        title="This draft is taking too long"
        body="The preview didn't load. Your website is safe. Try again, or go back to the builder."
        onRetry={() => {
          setStuckAttempt((n) => n + 1);
          void router.invalidate().catch(() => undefined);
        }}
      />
    ) : (
      <DraftMessage title="Loading your draft…" body="Getting the latest version of your site." />
    );

  // A draft that already has sections stays visible during rebuilds and AI
  // updates; only a brand-new empty first build gets the full-page message.
  if (result?.site && sections.length > 0 && (result.status === "pending" || result.status === "ready")) {
    return (
      <>
        {result.status === "pending" ? <DraftUpdatingBanner job={result.job} held={result.held} /> : null}
        <PreviewModeContext.Provider value={true}>
          <SiteBaseContext.Provider value={`/draft/${encodeURIComponent(result.site.org.slug)}`}>
            <PublicSiteView site={result.site} preview />
          </SiteBaseContext.Provider>
        </PreviewModeContext.Provider>
      </>
    );
  }

  if (result?.status === "pending") {
    return (
      <DraftMessage
        title="Your website is still being built"
        body={
          result.job?.currentStep
            ? `${stepLabel(result.job.currentStep)}. This preview will refresh automatically.`
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
