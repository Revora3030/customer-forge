/**
 * Speculation Rules for full-document navigations (Chromium 121+; other
 * browsers ignore the script and nothing changes).
 *
 * Prefetch only, never prerender: a prerendered page runs its JavaScript
 * before the visitor arrives, which would fire analytics/Ads/Clarity for
 * pages nobody opened and could run the Supabase session bootstrap (token
 * refresh) in a hidden tab. Prefetch just warms the HTML response.
 *
 * "moderate" eagerness = the browser starts after ~200ms of hover (or on
 * pointerdown on touch), so idle scrolling costs nothing.
 *
 * Anything that is signed in, token-bearing, or may do something on a GET
 * (unsubscribe links, invites, OAuth consent, private previews) is excluded,
 * as are links marked rel="nofollow" or data-no-speculate.
 */
export const SPECULATION_EXCLUDED_PATHS: readonly string[] = [
  "/api",
  "/auth",
  "/app",
  "/admin",
  "/my",
  "/draft",
  "/onboarding",
  "/login",
  "/signup",
  "/logout",
  "/reset-password",
  "/portal",
  "/invite",
  "/unsubscribe",
  "/p",
  "/share",
  "/mcp",
  "/lovable",
  "/.lovable",
  "/.well-known",
];

/** URL patterns (same-origin) for an excluded base path and everything under it. */
function excludedPatterns(): string[] {
  return SPECULATION_EXCLUDED_PATHS.flatMap((base) => [base, `${base}/*`]);
}

export const SPECULATION_RULES = {
  prefetch: [
    {
      source: "document",
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: excludedPatterns() } },
          { not: { selector_matches: "[rel~=nofollow], [data-no-speculate], [download], [target=_blank]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
} as const;

/** Inline JSON for `<script type="speculationrules">`. Static, no user input. */
export const SPECULATION_RULES_JSON = JSON.stringify(SPECULATION_RULES);

/** The head script entry, shared by Revora pages and client sites. */
export const speculationRulesScript = { type: "speculationrules", children: SPECULATION_RULES_JSON } as const;
