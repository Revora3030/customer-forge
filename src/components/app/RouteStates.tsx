/**
 * Shared route-level error and not-found screens.
 *
 * These are wired both on the root route and as the router defaults, so a
 * failure inside any nested route (builder, leads, billing, public site)
 * shows a Revora screen with a real recovery action instead of a blank page
 * or a framework default.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";
import { reportRouteError } from "@/lib/route-error-reporting";

export function RouteNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {/*
        React hoists these into <head>, which is the only reliable way to set
        not-found metadata: a route that throws notFound() never runs its own
        head(), so without this a 404 would inherit the site's real title and
        "index, follow" directive and get indexed as a live page.
      */}
      <title>Page not found — Revora</title>
      <meta name="robots" content="noindex" />
      <div className="max-w-md text-center">
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">This page doesn't exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the business page you're looking for has moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Revora
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RouteError({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
    reportRouteError(error, {
      boundary: "tanstack_route_error_component",
      mechanism: "react_error_boundary",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow">Something broke</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit an unexpected error. Nothing you've saved is lost — try again, or head back to the
          start.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset?.();
            }}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-elevated"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
