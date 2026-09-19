import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
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
import { PlatformAnalytics } from "@/components/marketing/PlatformAnalytics";
import { reportRouteError } from "@/lib/route-error-reporting";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { type: "application/ld+json", children: JSON.stringify(ORGANIZATION_SCHEMA) },
      { type: "application/ld+json", children: JSON.stringify(WEBSITE_SCHEMA) },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
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
    void enforceSessionPolicy().then(async (cleared) => {
      if (cleared) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) void sendToDashboard();
    });

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event !== "SIGNED_OUT") void ensureProfile();
      router.invalidate();
      if (event !== "SIGNED_OUT") {
        queryClient.invalidateQueries();
        if (event === "SIGNED_IN") void sendToDashboard();
      }
    });
    return () => data.subscription.unsubscribe();
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

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformAnalytics />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
