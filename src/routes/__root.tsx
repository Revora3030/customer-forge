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
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile, enforceSessionPolicy, resolvePostLoginPath } from "@/lib/auth-session";
import { OG_IMAGE, ORGANIZATION_SCHEMA, WEBSITE_SCHEMA } from "@/lib/seo";
import { RouteError, RouteNotFound } from "@/components/app/RouteStates";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import { PlatformAnalytics } from "@/components/marketing/PlatformAnalytics";
import { loadGoogleAds } from "@/lib/google-ads";
import { reportRouteError } from "@/lib/route-error-reporting";

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
    const clientSite = matches.some((match) => {
      const routeId = String((match as { routeId?: string }).routeId ?? "");
      if (/^\/(s|p)\/\$/.test(routeId)) return true;
      // A client's own custom domain serves its site from "/" and "/$".
      const data = (match as { loaderData?: unknown }).loaderData as
        | { site?: unknown; pending?: boolean }
        | null
        | undefined;
      return (routeId === "/" || routeId === "/$") && Boolean(data && (data.site || data.pending));
    });
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
      { property: "og:image", content: OG_IMAGE.url },
      { property: "og:image:width", content: String(OG_IMAGE.width) },
      { property: "og:image:height", content: String(OG_IMAGE.height) },
      { property: "og:image:alt", content: OG_IMAGE.alt },
      { name: "twitter:image", content: OG_IMAGE.url },
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
      { type: "application/ld+json", children: JSON.stringify(ORGANIZATION_SCHEMA) },
      { type: "application/ld+json", children: JSON.stringify(WEBSITE_SCHEMA) },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
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
      void router.navigate({ to: target, replace: true });
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
        if (event !== "SIGNED_OUT") void ensureProfile();
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
    const onError = (event: ErrorEvent) => {
      reportRouteError(event.error ?? event.message, {
        boundary: "window_error",
        mechanism: "window_error",
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportRouteError(event.reason, {
        boundary: "window_unhandled_rejection",
        mechanism: "unhandled_rejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
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

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformAnalytics />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <CookieConsent />
      {!builderOpen && <Toaster position="top-right" />}
    </QueryClientProvider>
  );
}
