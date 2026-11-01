import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  notFound,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import dmSans400 from "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2?url";
import dmSans600 from "@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2?url";
import instrumentSerif400 from "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url";
import spaceGrotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile, enforceSessionPolicy, resolvePostLoginPath } from "@/lib/auth-session";
import { ORGANIZATION_SCHEMA, WEBSITE_SCHEMA, isClientSiteMatch } from "@/lib/seo";
import { RouteError, RouteNotFound } from "@/components/app/RouteStates";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { PlatformAnalytics } from "@/components/marketing/PlatformAnalytics";
import { ClarityLoader } from "@/components/marketing/ClarityLoader";
import { loadGoogleAds } from "@/lib/google-ads";
import { reportRouteError } from "@/lib/route-error-reporting";
import { BOOT_WATCHDOG } from "@/lib/boot-watchdog";
import { describeClientError, errorFromWindowEvent, isStaleDeployError, reloadOnceForNewBuild } from "@/lib/client-error-classify";
import { safeJsonLd } from "@/lib/json-ld";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  /**
   * Keeps Revora's own site and published client websites completely apart.
   *
   * On a client's verified domain, Revora's own pages (sign-in, dashboard,
   * billing, marketing, share links) are simply not there — they return "page
   * not found" instead of leaking Revora's site onto the client's address. The
   * check only runs on addresses that are not Revora's own, so nothing on
   * revoragrowthsystems.com is affected.
   */
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { isPossibleTenantHost, isRevoraOnlyPath } = await import("@/lib/revora-address");
    if (!isPossibleTenantHost(window.location.hostname)) return;
    if (!isRevoraOnlyPath(location.pathname)) return;
    const { getHostSite } = await import("@/lib/host-site.functions");
    try {
      const response = await getHostSite({ data: {} });
      if (response?.tenant) throw notFound();
    } catch (error) {
      // A failed lookup must not take Revora's own pages down, so only a
      // confirmed client address blocks the path.
      if (error && typeof error === "object" && "routerCode" in error) throw error;
    }
  },

  head: ({ matches }) => {
    // A client's published website (or its private preview) is served from
    // this same app. Revora's own description, share image, Organization
    // schema, favicon and Google Ads consent script must never be stamped
    // onto a client's site: search engines and link previews showed Revora
    // instead of the business, and crawlers saw two conflicting Organization
    // records. Those routes set their own title, description, image and icon.
    // Any public match whose loader returned a client site counts, whatever
    // its routeId: a custom domain also serves /about, /contact and /pricing.
    const clientSite = matches.some((match) =>
      isClientSiteMatch(match as { routeId?: unknown; loaderData?: unknown }),
    );
    if (clientSite) {
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
          { name: "robots", content: "max-image-preview:large, max-snippet:-1" },
        ],
        links: [{ rel: "stylesheet", href: appCss }],
      };
    }
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: "Revora — The Business Growth Operating System" },
      {
        name: "description",
        content:
          "Revora gives businesses one powerful system to get discovered, capture opportunities, convert leads, book customers, automate follow-up and measure growth.",
      },
      { name: "author", content: "Revora" },
      {
        name: "google-site-verification",
        content: "X29U2dPnKNmd9GwB685Soe4W_2tKU4F6YNJZAtkCo4w",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Revora Growth Systems" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      // Indexing is the crawler default, so this only widens previews/snippets.
      // Deliberately no "index, follow": that would fight the "noindex" that
      // not-found and private screens emit, and conflicting directives resolve
      // to the most restrictive one only by convention, not by spec.
      { name: "robots", content: "max-image-preview:large, max-snippet:-1" },
      { name: "theme-color", content: "#0A0A0C" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Revora" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    scripts: [
      // Consent Mode defaults must exist before the Google Ads tag loads.
      // Granted globally, denied in regions that require consent until the
      // visitor answers the cookie banner.
      {
        children:
          "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500,region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH','CA-QC']});",
      },
      // Boot watchdog: the app's own stale-build guard only runs once the app
      // has started, so a page whose code bundle failed to load (a cached or
      // half-downloaded script) stayed blank until a hard reload. This reloads
      // once (per minute, per tab) when a bundle script fails or the app has
      // not started 15s after the document loaded.
      { children: BOOT_WATCHDOG },
      { type: "application/ld+json", children: safeJsonLd(ORGANIZATION_SCHEMA) },
      { type: "application/ld+json", children: safeJsonLd(WEBSITE_SCHEMA) },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // DM Sans, Instrument Serif and Space Grotesk are self-hosted through
      // Fontsource (imported in styles.css), so no Google Fonts links here. The four faces
      // the first screen draws (body 400, buttons and nav 600, the editorial headline, and the
      // 700-weight REVORA wordmark in the header) are preloaded (marketing pages only) so the swap happens
      // before first paint, with metric-matched fallbacks in styles.css as the safety net.
      ...[dmSans400, dmSans600, instrumentSerif400, spaceGrotesk700].map((href) => ({
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href,
        crossOrigin: "anonymous" as const,
      })),
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RouteNotFound,
  errorComponent: RouteError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // Browser extensions (password managers, translators, Grammarly) inject
    // attributes on <html>/<body> before hydration; those are not app bugs.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Entry pages a returning client can land on after signing back in
    // (email/password, magic link, or an OAuth round-trip back to the origin).
    const entryPaths = new Set(["/", "/auth"]);

    async function sendToDashboard() {
      if (!entryPaths.has(window.location.pathname)) return;
      let target: string | null = null;
      try {
        const stored = sessionStorage.getItem("lle:redirect");
        if (stored && stored.startsWith("/")) {
          sessionStorage.removeItem("lle:redirect");
          target = stored;
        }
      } catch {
        /* storage unavailable */
      }
      target = target ?? (await resolvePostLoginPath());
      if (target === "/auth") return;
      if (window.location.pathname === target) return;
      // `href` keeps the query string (e.g. OAuth consent ?authorization_id=…
      // saved before a Google sign-in round-trip); `to` would drop it.
      void router.navigate({ href: target, replace: true });
    }

    // Returning client with a persisted session landing on a public entry page.
    // Session-only ("remember me" off) logins are ended first.
    //
    // Auth is a progressive enhancement for public pages: if the auth client
    // cannot start (e.g. a deployment built without its backend configuration),
    // every marketing page must still render instead of the whole app failing.
    void enforceSessionPolicy()
      .then(async (cleared) => {
        if (cleared) return;
        const { data } = await supabase.auth.getSession();
        if (data.session) void sendToDashboard();
      })
      .catch((error: unknown) => {
        reportRouteError(error, { boundary: "root_session_bootstrap" });
      });

    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        if (event !== "SIGNED_OUT")
          void ensureProfile().catch((error) => reportRouteError(error, { boundary: "profile_bootstrap" }));
        // A shared device must not show the previous owner's builder chat.
        if (event === "SIGNED_OUT")
          void import("@/lib/builder-memory").then((memory) => memory.clearAllCachedTurns()).catch(() => undefined);
        router.invalidate();
        if (event !== "SIGNED_OUT") {
          queryClient.invalidateQueries();
          if (event === "SIGNED_IN") void sendToDashboard();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (error) {
      reportRouteError(error, { boundary: "root_auth_listener" });
    }
    return () => unsubscribe?.();
  }, [router, queryClient]);

  useEffect(() => {
    // React route boundaries catch render/loader failures, while these listeners
    // cover errors that escape the router boundary or occur during hydration.
    const storage = (() => {
      try {
        return window.sessionStorage;
      } catch {
        return null;
      }
    })();
    const recoverStaleBuild = (error: unknown) =>
      isStaleDeployError(describeClientError(error).message) && reloadOnceForNewBuild(storage, () => window.location.reload());
    // Vite reports a code chunk that failed to load (a deploy replaced it, or the
    // module threw while loading) here. The error is swallowed only when the page
    // reloads for the new build: swallowed without a reload, the import resolves to
    // nothing and the route crashes with "undefined is not an object (evaluating
    // 'e[t ?? "default"]')", which hides the real cause from the owner and Sentry.
    const onPreloadError = (event: Event) => {
      if (reloadOnceForNewBuild(storage, () => window.location.reload())) {
        event.preventDefault();
        return;
      }
      reportRouteError((event as Event & { payload?: unknown }).payload ?? new Error("Code chunk failed to load"), {
        boundary: "window_error",
        mechanism: "preload_error",
      });
    };
    const onError = (event: ErrorEvent) => {
      if (recoverStaleBuild(errorFromWindowEvent(event))) return;
      reportRouteError(errorFromWindowEvent(event), {
        boundary: "window_error",
        mechanism: "window_error",
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (recoverStaleBuild(event.reason)) return;
      reportRouteError(event.reason, {
        boundary: "window_unhandled_rejection",
        mechanism: "unhandled_rejection",
      });
    };

    (window as Window & { __rvBooted?: boolean }).__rvBooted = true;
    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    // Google Ads measurement (Advanced Consent Mode): the tag loads after the
    // head's consent defaults, and Google's signals follow the cookie banner.
    // Deferred until the browser is idle so ~325 KB of Google tag JS no longer
    // competes with first paint (Lighthouse mobile TBT was ~9 s).
    // Never on a client's website or preview, even on Revora's own host.
    if (/^\/(s|p)\//.test(window.location.pathname)) return;
    const start = () => void loadGoogleAds(true);
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 3000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 1500);
    return () => window.clearTimeout(t);
  }, []);

  // The website builder speaks through its AI chat; pop-up banners there were
  // leftovers from the old engine and covered the builder, so they are off.
  const builderOpen = useRouterState({
    select: (s) => s.location.pathname.startsWith("/app/website"),
  });
  // Customer websites keep their own canvas. Revora's shells get the obsidian
  // atmosphere and glass panels; a published or preview site must not.
  const clientSite = useRouterState({
    select: (s) => s.matches.some((match) => isClientSiteMatch(match)),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformAnalytics />
      <ClarityLoader />
      <div className={clientSite ? "flex min-h-dvh flex-col" : "platform-shell flex min-h-dvh flex-col"}>
        <CookieConsent />
        {/* The phone notice occupies its own row, never the signup form. */}
        <div className="min-w-0 flex-1"><Outlet /></div>
      </div>
      {!builderOpen && <Toaster position="top-right" />}
    </QueryClientProvider>
  );
}
