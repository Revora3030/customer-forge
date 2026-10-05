import { recordConversion, type ConversionEvent } from "@/lib/conversion.functions";
import { isNonProductionTraffic } from "@/lib/analytics-taxonomy";
import { ga4Event, ga4PageView } from "@/lib/ga4";

const KEY = "revora.attribution.v1";

interface Attribution {
  landingPath: string;
  industrySlug: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  sessionId: string;
}

const isBrowser = () => typeof window !== "undefined";

function newSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/**
 * Privacy-safe visitor id.
 *
 * A random value created in this browser and kept in this browser. It is not
 * derived from IP address, user agent, screen size, email or any other personal
 * detail, so it identifies nobody — it only lets repeat visits from the same
 * browser be counted once instead of as several separate sessions. If storage
 * is unavailable (private mode, blocked cookies) the visit is simply counted as
 * a session with no visitor id, never fingerprinted as a fallback.
 */
const VISITOR_KEY = "revora.visitor.v1";

export function getVisitorId(): string | null {
  if (!isBrowser()) return null;
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[a-z0-9-]{8,60}$/i.test(existing)) return existing;
    const fresh = newSessionId();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/** Captures (once per browser session) where the visitor first landed. */
export function getAttribution(): Attribution | null {
  if (!isBrowser()) return null;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored) return JSON.parse(stored) as Attribution;
  } catch {
    /* storage unavailable */
  }
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const match = /^\/industries\/([a-z0-9-]+)$/.exec(path);
  const attribution: Attribution = {
    landingPath: path.slice(0, 200),
    industrySlug: match?.[1] ?? null,
    referrer: document.referrer ? document.referrer.slice(0, 300) : null,
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    sessionId: newSessionId(),
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* storage unavailable */
  }
  return attribution;
}

/** Fire-and-forget conversion event with first-touch attribution attached. */
export function trackConversion(
  event: ConversionEvent,
  extra?: {
    email?: string | null;
    amountCents?: number | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  if (!isBrowser()) return;
  // Spec I: preview hosts, local development and the builder's draft/preview
  // frames never reach customer production analytics.
  if (isNonProductionTraffic(window.location.hostname, window.location.pathname)) return;
  const attribution = getAttribution();
  // Variants ride along on every event so each funnel stage can be split by test.
  let variants: Record<string, string> = {};
  try {
    const raw = window.localStorage.getItem("revora.experiments.v1");
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      variants = parsed as Record<string, string>;
    }
  } catch {
    /* storage unavailable */
  }
  const landingPath = attribution?.landingPath ?? window.location.pathname;
  const metadata = { ...variants, ...(extra?.metadata ?? {}) };

  // Mirror to GA4 when a measurement ID is configured; a no-op otherwise.
  if (event === "page_view") ga4PageView(window.location.pathname);
  else {
    ga4Event(event, {
      landing_path: landingPath,
      page_path: window.location.pathname,
      campaign: attribution?.utmCampaign ?? undefined,
      source: attribution?.utmSource ?? undefined,
      value: typeof extra?.amountCents === "number" ? extra.amountCents / 100 : undefined,
      currency: typeof extra?.amountCents === "number" ? "USD" : undefined,
    });
  }

  void recordConversion({
    data: {
      event,
      landingPath,
      industrySlug: attribution?.industrySlug ?? null,
      referrer: attribution?.referrer ?? null,
      utmSource: attribution?.utmSource ?? null,
      utmMedium: attribution?.utmMedium ?? null,
      utmCampaign: attribution?.utmCampaign ?? null,
      sessionId: attribution?.sessionId ?? null,
      visitorId: getVisitorId(),
      email: extra?.email ?? null,
      amountCents: extra?.amountCents ?? null,
      metadata,
    },
  }).catch(() => undefined);
}
