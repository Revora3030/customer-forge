/**
 * Owner dashboard PWA (vite-plugin-pwa, MIT) — service worker policy.
 *
 * The service worker is registered with scope `/app/` only, so it never
 * controls marketing pages, tenant sites (/s/*), the portal, or admin.
 *
 * What it caches:
 *   - the static brand icons, precached at install time;
 *   - content-hashed build assets under /assets/ (JS/CSS/fonts/images), cached
 *     on first use (CacheFirst, capped) — immutable and free of user data;
 *   - a static offline page (`/app-offline.html`) used only when a dashboard
 *     navigation fails because the device is offline.
 *
 * What it never caches:
 *   - HTML navigations (they are server-rendered and can hold user data):
 *     NetworkOnly, falling back to the static offline page;
 *   - Supabase (REST, auth, realtime, storage, functions) and any /api/,
 *     /_serverFn/ or other same-origin dynamic request: NetworkOnly.
 *
 * "Network-first app shell": navigations always go to the network first; the
 * only cached shell is the static, user-free offline page.
 */
import type { VitePWAOptions } from "vite-plugin-pwa";

export const OWNER_PWA_SCOPE = "/app/";
export const OWNER_PWA_OFFLINE_PAGE = "/app-offline.html";

/** Patterns a request URL is tested against to force NetworkOnly. */
export const NEVER_CACHE_URL_PATTERNS: readonly RegExp[] = [
  /^https:\/\/[^/]+\.supabase\.co\//i,
  /^https:\/\/[^/]+\.supabase\.in\//i,
  /\/api\//i,
  /\/_serverFn\//i,
  /\/rest\/v1\//i,
  /\/auth\/v1\//i,
  /\/realtime\/v1\//i,
  /\/storage\/v1\//i,
  /\/functions\/v1\//i,
];

/** Pure helper (also used by tests): would the SW ever serve this URL from cache? */
export function isNeverCached(url: string): boolean {
  return NEVER_CACHE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export const ownerPwaOptions: Partial<VitePWAOptions> = {
  // The update prompt is our own React component (OwnerPwaUpdatePrompt).
  registerType: "prompt",
  injectRegister: false,
  // The manifest is served by src/routes/manifest[.]webmanifest.ts.
  manifest: false,
  scope: OWNER_PWA_SCOPE,
  filename: "sw.js",
  // TanStack Start + Nitro (cloudflare-module) writes the client build to
  // .output/public, which wrangler serves as static assets.
  outDir: ".output/public",
  strategies: "generateSW",
  devOptions: { enabled: false },
  includeAssets: [],
  workbox: {
    // Precache only the static offline page and brand icons (a few KiB), so
    // installing never downloads the whole site. Never any server HTML.
    globPatterns: ["app-offline.html", "icon-192.png", "icon-512.png", "favicon.png"],
    globDirectory: ".output/public",
    globIgnores: ["**/*.map"],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    // No SPA fallback: navigations are handled by the NetworkOnly rule below.
    navigateFallback: null,
    cleanupOutdatedCaches: true,
    clientsClaim: false,
    skipWaiting: false,
    runtimeCaching: [
      {
        // Dashboard navigations: network only, static offline page when offline.
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkOnly",
        options: { precacheFallback: { fallbackURL: OWNER_PWA_OFFLINE_PAGE } },
      },
      {
        // Content-hashed build output only (same origin, /assets/*).
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
        handler: "CacheFirst",
        options: {
          cacheName: "revora-owner-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        // Supabase, server functions and APIs: never cached.
        urlPattern: ({ url }) =>
          url.hostname.endsWith(".supabase.co") ||
          url.hostname.endsWith(".supabase.in") ||
          /\/(api|_serverFn|rest\/v1|auth\/v1|realtime\/v1|storage\/v1|functions\/v1)\//.test(
            url.pathname,
          ),
        handler: "NetworkOnly",
      },
    ],
  },
};
