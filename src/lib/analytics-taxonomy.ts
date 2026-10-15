/**
 * Single analytics event taxonomy (spec I).
 *
 * Every business milestone has exactly one canonical event, one source of
 * truth, and one idempotency rule. Browser events are suggestions (marketing
 * telemetry, possibly blocked or duplicated); server events are confirmed by a
 * persisted record or a verified provider webhook and are the only ones that
 * may be counted as business outcomes on a dashboard.
 *
 * Pure data + helpers: imported by the server recorders, the dashboards and
 * tests. Adding an event means adding it here first.
 */

export type EventSource = "browser" | "server";

export type TaxonomyEntry = {
  event: string;
  source: EventSource;
  /** Funnel position, or null for diagnostic events outside the funnel. */
  funnelStep: number | null;
  /** What makes two occurrences "the same" event (idempotency scope). */
  idempotency: "per_session" | "per_visitor" | "per_workspace" | "per_record" | "per_provider_event";
  definition: string;
};

/**
 * Funnel: visitor → account created → trial started → active trial →
 * checkout started → setup payment completed → subscription active →
 * published site → lead captured.
 */
export const EVENT_TAXONOMY: readonly TaxonomyEntry[] = [
  { event: "landing_view", source: "browser", funnelStep: 1, idempotency: "per_session", definition: "A visitor viewed a marketing landing page (one per session)." },
  { event: "account_created", source: "server", funnelStep: 2, idempotency: "per_record", definition: "A platform account row was created (mirrors platform_accounts)." },
  { event: "trial_started", source: "server", funnelStep: 3, idempotency: "per_workspace", definition: "The 3-day full-access trial began for a workspace (server-set trial_ends_at)." },
  { event: "trial_active", source: "server", funnelStep: 4, idempotency: "per_workspace", definition: "Workspace is inside its trial window per server time (derived, never browser)." },
  { event: "checkout_started", source: "server", funnelStep: 5, idempotency: "per_record", definition: "A Stripe Checkout session was created server-side for an authorized member." },
  { event: "setup_payment_completed", source: "server", funnelStep: 6, idempotency: "per_provider_event", definition: "Verified Stripe webhook confirmed the $750 setup payment (or the audited internal waiver)." },
  { event: "subscription_active", source: "server", funnelStep: 7, idempotency: "per_provider_event", definition: "Verified Stripe webhook shows the $100/month subscription active or trialing (first month free)." },
  { event: "site_published", source: "server", funnelStep: 8, idempotency: "per_record", definition: "A validated immutable website version was published." },
  { event: "lead_created", source: "server", funnelStep: 9, idempotency: "per_record", definition: "A public lead was durably saved in the customer's own workspace." },
  // Diagnostic / marketing telemetry (never counted as a business outcome).
  { event: "page_view", source: "browser", funnelStep: null, idempotency: "per_session", definition: "Page view telemetry." },
  { event: "cta_click", source: "browser", funnelStep: null, idempotency: "per_session", definition: "CTA click telemetry." },
  { event: "checkout_return", source: "browser", funnelStep: null, idempotency: "per_session", definition: "Visitor returned from Stripe. Untrusted: never a paid signal." },
  { event: "checkout_completed", source: "browser", funnelStep: null, idempotency: "per_session", definition: "Legacy browser event, kept readable. Never a paid signal." },
  { event: "builder_opened", source: "browser", funnelStep: null, idempotency: "per_session", definition: "Owner opened the builder (once per browser session)." },
  { event: "build_requested", source: "browser", funnelStep: null, idempotency: "per_record", definition: "Owner asked Revora to build or change something." },
  { event: "build_failed", source: "browser", funnelStep: null, idempotency: "per_record", definition: "The apply pipeline could not carry out a request." },
  { event: "publish_blocked", source: "browser", funnelStep: null, idempotency: "per_record", definition: "Publishing was refused (not paid, not ready, not permitted)." },
] as const;

const BY_EVENT = new Map(EVENT_TAXONOMY.map((entry) => [entry.event, entry]));

export const taxonomyEntry = (event: string): TaxonomyEntry | null => BY_EVENT.get(event) ?? null;

/** True only for events a dashboard may count as a confirmed business outcome. */
export const isServerConfirmed = (event: string): boolean => BY_EVENT.get(event)?.source === "server";

/** The ordered business funnel. */
export const FUNNEL = EVENT_TAXONOMY.filter((e) => e.funnelStep !== null).sort(
  (a, b) => (a.funnelStep ?? 0) - (b.funnelStep ?? 0),
);

/**
 * Stable idempotency key for an event, so retries and double fires collapse to
 * one row. `scope` is the session, visitor, workspace, record or provider event
 * id that the taxonomy names for that event.
 */
export function eventIdempotencyKey(event: string, scope: string): string {
  const entry = BY_EVENT.get(event);
  const kind = entry?.idempotency ?? "per_record";
  return `${event}:${kind}:${String(scope).trim().slice(0, 120)}`;
}

/**
 * Hosts whose traffic must never reach customer production analytics
 * (previews, local development, the builder's draft frame).
 */
export function isNonProductionTraffic(hostname: string, pathname = "/"): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (host.includes("id-preview--") || host.endsWith(".lovableproject.com")) return true;
  return /^\/(draft|p)\//.test(pathname);
}
