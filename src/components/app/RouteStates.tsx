/**
 * Shared route-level error and not-found screens.
 *
 * These are wired both on the root route and as the router defaults, so a
 * failure inside any nested route (builder, leads, billing, public site)
 * shows a Revora screen with a real recovery action instead of a blank page
 * or a framework default.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

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
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="eyebrow">Error 404</p>
        <h1 className="mt-3 font-editorial text-[30px] leading-tight text-foreground">This page doesn't exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the business page you're looking for has moved.
        </p>
        <div className="mt-6">
          <Button asChild><Link to="/">Back to Revora</Link></Button>
        </div>
      </div>
    </div>
  );
}

export function RouteError({ error, reset }: { error: unknown; reset?: () => void }) {
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
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="eyebrow">Temporarily unavailable</p>
        <h1 className="mt-3 font-editorial text-[30px] leading-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't load this page. Try again, or return to the start.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={async () => {
              await router.invalidate();
              reset?.();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline"><a href="/">Go home</a></Button>
        </div>
      </div>
    </div>
  );
}

/** How long a screen may stay on "Loading" before the visitor is offered a reload. */
export const ROUTE_PENDING_RELOAD_MS = 8000;

/**
 * Shown while a client-only route (the signed-in app, owner drafts) checks the
 * session and loads its data. It is also what the server sends for those
 * routes, so the first paint is never a blank dark screen. A load that hangs
 * offers a plain reload link, which works even when the app's script did not.
 */
export function RoutePending() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), ROUTE_PENDING_RELOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" data-route-pending="" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <p className="text-sm text-muted-foreground">Loading…</p>
        {slow ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Taking longer than usual. <button type="button" className="underline underline-offset-4 text-foreground" onClick={() => window.location.reload()}>Reload the page</button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
