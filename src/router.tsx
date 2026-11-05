import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteError, RouteNotFound } from "./components/app/RouteStates";
import { routeTree } from "./routeTree.gen";
import { reportRouteError } from "@/lib/route-error-reporting";
import { installBuilderResumeSync } from "@/lib/builder/resume-sync";

/** Default freshness window for cached query results. */
export const QUERY_STALE_TIME_MS = 30_000;
/** How long unused results stay in memory for instant back-navigation. */
export const QUERY_GC_TIME_MS = 10 * 60_000;

let disposeResumeSync: (() => void) | undefined;

export const getRouter = () => {
  // Cached answers stay fresh for a short window, so moving between dashboard
  // pages and returning to the tab shows data instantly instead of refetching
  // (and flashing a loading state) every time. Mutations still invalidate
  // explicitly, and individual queries can set their own staleTime.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
      },
    },
  });
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    disposeResumeSync?.();
    disposeResumeSync = installBuilderResumeSync(queryClient, window, document);
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Any nested route failure gets a Revora screen with a real retry action.
    defaultErrorComponent: RouteError,
    // Capture router CatchBoundary failures even when the error component itself
    // never mounts (SSR/loader failures can take that path).
    defaultOnCatch: (error, errorInfo) => {
      reportRouteError(error, {
        boundary: "tanstack_router_default_on_catch",
        mechanism: "router_catch_boundary",
        ...(errorInfo?.componentStack ? { componentStack: errorInfo.componentStack } : {}),
      });
    },
    defaultNotFoundComponent: RouteNotFound,
  });

  return router;
};
