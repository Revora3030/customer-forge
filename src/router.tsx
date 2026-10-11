import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { RouteError, RouteNotFound } from "./components/app/RouteStates";
import { routeTree } from "./routeTree.gen";
import { reportRouteError } from "@/lib/route-error-reporting";
import { installBuilderResumeSync } from "@/lib/builder/resume-sync";

let disposeResumeSync: (() => void) | undefined;

export const getRouter = () => {
  const queryClient = new QueryClient();
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
