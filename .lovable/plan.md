# Finish connecting free services to the AI team

## Where things stand (checked today)
Already linked to the app: GitHub, Gmail, Google Ads, Google Analytics, Google Business Profile, Google Search Console, Google Maps, Linear, Notion, PostHog, Semrush, Perplexity.
Not linked: LinkedIn (plus duplicate GitHub/Linear/PostHog/Search Console copies, which stay unlinked on purpose).
Sentry is not offered as a connector here; it needs your own Sentry account key.

Most connections exist, but only Perplexity actually feeds the AI team during builds. The real gain now is wiring the linked services into the build and review steps.

## What gets built

1. **Google Maps for real location facts** — when a customer gives an address, the builder confirms it, adds an accurate map and directions, and passes verified location to Sol. Nothing invented.
2. **Google Business Profile import** — if the customer owns a listing, their real hours, category, and photos flow into onboarding as facts (with customer confirmation). Real reviews are only shown if the customer's own listing supplies them.
3. **Search Console + Semrush in SEO review** — for sites on a verified domain, Terra's SEO reviewer gets real search queries and keyword gaps, so titles and headings target what people actually search.
4. **PostHog + Analytics in improvement suggestions** — Astra reads real visitor drop-off for a published site and proposes specific changes in chat (you approve each one; nothing auto-applies).
5. **Perplexity on competitor patterns** — extend live research to layout and trust expectations per industry for the first-build planner (marked as outside research, never copied).
6. **LinkedIn** — link only if you want the AI to post launch announcements for Revora; it doesn't improve customer sites, so it's optional.

Every connector is optional at build time: if one is down or out of quota, the build carries on without it.

## Needs you
- Sentry: send a Sentry project key if you want live error tracking.
- Customer-owned Google data (their Search Console/Business Profile) needs each customer to connect their own account; your admin connection only covers your own properties. Step 2 and 3 will use your connection for Revora itself and a per-customer connect button for everyone else.

## Technical details
- New server helpers under `src/lib/integrations/` (maps, business-profile, search-insights, visitor-insights), each gateway-backed, timeout-bounded, returning `trust: "verified" | "research"` tags.
- Inject into `review-panel.server.ts` (seo, industry_fit areas) and `first-build-compositions.server.ts` intake; tenant checks before any per-org data read.
- Tests per helper plus architecture test updates; typecheck, full vitest, then publish.
