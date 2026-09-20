import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENTS = [
  "page_view",
  "landing_view",
  "portal_view",
  "assessment_submitted",
  "audit_requested",
  "cta_click",
  "experiment_exposure",
  "signup_started",
  "signup_completed",
  "workspace_provisioned",
  /** Owner opened the website builder (once per browser session). */
  "builder_opened",
  /** Owner asked Revora to build or change something in the builder. */
  "build_requested",
  /** Revora applied the owner's request to the website. */
  "build_applied",
  /** The apply pipeline could not carry out the request. */
  "build_failed",
  /** Publishing was refused: not paid, not ready, or not permitted. */
  "publish_blocked",
  /** Publishing broke on the way out (network, service hiccup). */
  "publish_failed",
  "site_published",

  "first_quote_request",
  "first_booking",
  "checkout_started",
  // Legacy: previously fired by the browser after a Stripe redirect. Kept so
  // historical rows stay readable, but it is NEVER a paid customer signal.
  "checkout_completed",
  /** Visitor came back from Stripe. Marketing telemetry only — untrusted. */
  "checkout_return",
  /** Marketing mirror of the authoritative platform_accounts row. */
  "account_created",
] as const;

export type ConversionEvent = (typeof EVENTS)[number];

export interface ConversionInput {
  event: string;
  landingPath?: string | null;
  industrySlug?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  sessionId?: string | null;
  /** Random per-browser id (see getVisitorId) — never personal data. */
  visitorId?: string | null;
  email?: string | null;
  amountCents?: number | null;
  /** Small flat bag: experiment variants, workspace id, milestone details. */
  metadata?: Record<string, unknown> | null;
}

const clean = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};

/** Keeps metadata small, flat and free of anything sensitive. */
const cleanMetadata = (value: unknown): Record<string, string | number | boolean> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    const safeKey = key.replace(/[^a-z0-9_]/gi, "").slice(0, 40);
    if (!safeKey) continue;
    if (typeof raw === "string") out[safeKey] = raw.slice(0, 120);
    else if (typeof raw === "number" && Number.isFinite(raw)) out[safeKey] = raw;
    else if (typeof raw === "boolean") out[safeKey] = raw;
  }
  return Object.keys(out).length > 0 ? out : null;
};

/** How many events one browser may record per window, and how long that window is. */
export const RATE_LIMIT_PER_WINDOW = 40;
export const RATE_WINDOW_MS = 60_000;

/** Records a Revora marketing funnel event (landing page -> signup -> paid checkout). */
export const recordConversion = createServerFn({ method: "POST" })
  .inputValidator((input: ConversionInput) => {
    const event = clean(input?.event, 40);
    if (!event || !(EVENTS as readonly string[]).includes(event)) {
      throw new Error("Unsupported conversion event");
    }
    const amount =
      typeof input?.amountCents === "number" && Number.isFinite(input.amountCents)
        ? Math.max(0, Math.round(input.amountCents))
        : null;
    return {
      event,
      landingPath: clean(input?.landingPath, 200),
      industrySlug: clean(input?.industrySlug, 80),
      referrer: clean(input?.referrer, 300),
      utmSource: clean(input?.utmSource, 80),
      utmMedium: clean(input?.utmMedium, 80),
      utmCampaign: clean(input?.utmCampaign, 120),
      sessionId: clean(input?.sessionId, 60),
      visitorId: clean(input?.visitorId, 60),
      email: clean(input?.email, 160),
      amountCents: amount,
      metadata: cleanMetadata(input?.metadata),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // This endpoint is public by design — a visitor has no account yet — so it
    // is rate limited per browser. Without this, anyone could flood the funnel
    // with fabricated page views and make the owner's own numbers untrue.
    const identity = data.visitorId ?? data.sessionId;
    if (identity) {
      const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
      const column = data.visitorId ? "visitor_id" : "session_id";
      const { count, error: countError } = await supabaseAdmin
        .from("marketing_conversions")
        .select("id", { count: "exact", head: true })
        .eq(column, identity)
        .gte("created_at", windowStart);
      if (countError) {
        console.error("recordConversion rate check failed", countError.message);
        return { ok: false };
      }
      if ((count ?? 0) >= RATE_LIMIT_PER_WINDOW) return { ok: true, throttled: true };
    }

    const { error } = await supabaseAdmin.from("marketing_conversions").insert({
      event_name: data.event,
      landing_path: data.landingPath,
      industry_slug: data.industrySlug,
      referrer: data.referrer,
      utm_source: data.utmSource,
      utm_medium: data.utmMedium,
      utm_campaign: data.utmCampaign,
      session_id: data.sessionId,
      visitor_id: data.visitorId,
      email: data.email,
      amount_cents: data.amountCents,
      metadata: (data.metadata ?? null) as never,
    });
    if (error) {
      console.error("recordConversion failed", error.message);
      return { ok: false };
    }

    return { ok: true };
  });

export interface FunnelRow {
  key: string;
  label: string;
  landingViews: number;
  signupsStarted: number;
  signupsCompleted: number;
  workspacesProvisioned: number;
  firstQuotes: number;
  firstBookings: number;
  checkoutsStarted: number;
  checkoutsCompleted: number;
}

export interface VariantRow {
  experiment: string;
  variant: string;
  exposures: number;
  signupsStarted: number;
  signupsCompleted: number;
  checkoutsCompleted: number;
  /** Signups completed per 100 exposures. */
  signupRate: number;
}

const emptyRow = (key: string, label: string): FunnelRow => ({
  key,
  label,
  landingViews: 0,
  signupsStarted: 0,
  signupsCompleted: 0,
  workspacesProvisioned: 0,
  firstQuotes: 0,
  firstBookings: 0,
  checkoutsStarted: 0,
  checkoutsCompleted: 0,
});

/**
 * Super-admin funnel report.
 * Grouped by landing page / industry, plus an A/B breakdown per variant so the
 * pricing layout and Start-free copy tests can be compared directly.
 */
export const getConversionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({
    days: Math.min(365, Math.max(1, Math.round(Number(input?.days ?? 30)))),
  }))
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // Aggregate every row in the window: analytics must never be truncated.
    const rows: {
      event_name: string;
      industry_slug: string | null;
      landing_path: string | null;
      metadata: unknown;
      created_at: string;
    }[] = [];
    for (let page = 0; page < 200; page += 1) {
      const { data: batch, error } = await supabaseAdmin
        .from("marketing_conversions")
        .select("event_name, industry_slug, landing_path, metadata, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error("Analytics unavailable");
      rows.push(...(batch ?? []));
      if ((batch?.length ?? 0) < 1000) break;
    }

    const grouped = new Map<string, FunnelRow>();
    const variants = new Map<string, VariantRow>();

    for (const row of rows) {
      const key = row.industry_slug ?? row.landing_path ?? "direct";
      const entry =
        grouped.get(key) ??
        emptyRow(
          key,
          row.industry_slug ? row.industry_slug.replace(/-/g, " ") : (row.landing_path ?? "Direct"),
        );
      if (row.event_name === "landing_view") entry.landingViews += 1;
      if (row.event_name === "signup_started") entry.signupsStarted += 1;
      if (row.event_name === "signup_completed") entry.signupsCompleted += 1;
      if (row.event_name === "workspace_provisioned") entry.workspacesProvisioned += 1;
      if (row.event_name === "first_quote_request") entry.firstQuotes += 1;
      if (row.event_name === "first_booking") entry.firstBookings += 1;
      if (row.event_name === "checkout_started") entry.checkoutsStarted += 1;
      if (row.event_name === "checkout_completed") entry.checkoutsCompleted += 1;
      grouped.set(key, entry);

      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      for (const [experiment, value] of Object.entries(meta)) {
        if (experiment === "experiment" || experiment === "variant" || typeof value !== "string")
          continue;
        const vkey = `${experiment}:${value}`;
        const vrow = variants.get(vkey) ?? {
          experiment,
          variant: value,
          exposures: 0,
          signupsStarted: 0,
          signupsCompleted: 0,
          checkoutsCompleted: 0,
          signupRate: 0,
        };
        if (row.event_name === "experiment_exposure") vrow.exposures += 1;
        if (row.event_name === "signup_started") vrow.signupsStarted += 1;
        if (row.event_name === "signup_completed") vrow.signupsCompleted += 1;
        if (row.event_name === "checkout_completed") vrow.checkoutsCompleted += 1;
        variants.set(vkey, vrow);
      }
    }

    const report = [...grouped.values()].sort(
      (a, b) => b.checkoutsCompleted - a.checkoutsCompleted || b.landingViews - a.landingViews,
    );
    const variantReport = [...variants.values()]
      .map((v) => ({
        ...v,
        signupRate:
          v.exposures > 0 ? Math.round((v.signupsCompleted / v.exposures) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.experiment.localeCompare(b.experiment) || b.signupRate - a.signupRate);

    return { days: data.days, total: rows.length, report, variantReport };
  });

export interface TrafficPage {
  path: string;
  views: number;
  /** Distinct browser sessions, not verified unique people. */
  sessions: number;
}

export interface TrafficSource {
  source: string;
  /** Distinct browser sessions, not verified unique people. */
  sessions: number;
  signupStarts: number;
  checkoutReturns: number;
}

/**
 * Platform traffic report: real page views, unique sessions, portal reach and
 * how many of those sessions turned into signups and paid clients.
 *
 * Every number comes from `marketing_conversions` rows actually recorded by
 * visitors — nothing is estimated or extrapolated.
 */
export const getTrafficReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({
    days: Math.min(365, Math.max(1, Math.round(Number(input?.days ?? 30)))),
  }))
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const { eventPath, isPublicMarketingPath } = await import("@/lib/marketing-paths");

    const rows: {
      event_name: string;
      landing_path: string | null;
      session_id: string | null;
      referrer: string | null;
      utm_source: string | null;
      metadata: unknown;
      created_at: string;
    }[] = [];
    for (let page = 0; page < 200; page += 1) {
      const { data: batch, error } = await supabaseAdmin
        .from("marketing_conversions")
        .select("event_name, landing_path, session_id, referrer, utm_source, metadata, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error("Analytics unavailable");
      rows.push(...(batch ?? []));
      if ((batch?.length ?? 0) < 1000) break;
    }

    const pages = new Map<string, { views: number; sessions: Set<string> }>();
    const sources = new Map<
      string,
      { sessions: Set<string>; signupStarts: number; checkoutReturns: number }
    >();
    const allSessions = new Set<string>();
    const portalSessions = new Set<string>();
    const byDay = new Map<string, Set<string>>();
    let views = 0;
    let signupStarts = 0;
    let checkoutReturns = 0;
    /** Revora's own admin/workspace activity, kept out of the marketing numbers. */
    let internalExcluded = 0;

    for (const row of rows) {
      // Revora's own staff screens and tenant previews are not marketing traffic.
      if (!isPublicMarketingPath(eventPath(row))) {
        internalExcluded += 1;
        continue;
      }
      const session = row.session_id ?? "";
      if (session) allSessions.add(session);

      if (row.event_name === "page_view") {
        views += 1;
        const path = (eventPath(row) ?? "/").slice(0, 120);
        const page = pages.get(path) ?? { views: 0, sessions: new Set<string>() };
        page.views += 1;
        if (session) page.sessions.add(session);
        pages.set(path, page);

        const day = row.created_at.slice(0, 10);
        const dayset = byDay.get(day) ?? new Set<string>();
        if (session) dayset.add(session);
        byDay.set(day, dayset);
      }

      if (row.event_name === "portal_view" && session) portalSessions.add(session);
      if (row.event_name === "signup_started") signupStarts += 1;
      // Untrusted browser telemetry: a return from Stripe is not a payment.
      if (row.event_name === "checkout_return" || row.event_name === "checkout_completed")
        checkoutReturns += 1;

      // Attribute by utm_source, else referring host, else direct.
      let source = row.utm_source?.trim().toLowerCase() ?? "";
      if (!source && row.referrer) {
        try {
          source = new URL(row.referrer).hostname.replace(/^www\./, "");
        } catch {
          source = "";
        }
      }
      source = source || "direct";
      const bucket = sources.get(source) ?? {
        sessions: new Set<string>(),
        signupStarts: 0,
        checkoutReturns: 0,
      };
      if (session) bucket.sessions.add(session);
      if (row.event_name === "signup_started") bucket.signupStarts += 1;
      if (row.event_name === "checkout_return" || row.event_name === "checkout_completed")
        bucket.checkoutReturns += 1;
      sources.set(source, bucket);
    }

    const topPages: TrafficPage[] = [...pages.entries()]
      .map(([path, value]) => ({ path, views: value.views, sessions: value.sessions.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 15);

    const topSources: TrafficSource[] = [...sources.entries()]
      .map(([source, value]) => ({
        source,
        sessions: value.sessions.size,
        signupStarts: value.signupStarts,
        checkoutReturns: value.checkoutReturns,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 12);

    const daily = [...byDay.entries()]
      .map(([day, set]) => ({ day, sessions: set.size }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const sessions = allSessions.size;
    return {
      days: data.days,
      views,
      /** Revora's own admin/workspace and tenant-preview rows, excluded above. */
      internalExcluded,
      /** Distinct browser sessions in the window — NOT verified unique people. */
      sessions,

      portalSessions: portalSessions.size,
      signupStarts,
      checkoutReturns,
      portalRate: sessions > 0 ? Math.round((portalSessions.size / sessions) * 1000) / 10 : 0,
      signupStartRate: sessions > 0 ? Math.round((signupStarts / sessions) * 1000) / 10 : 0,
      topPages,
      topSources,
      daily,
    };
  });

/**
 * Builder → publish drop-off: how many workspaces opened the builder, asked
 * Revora for something, got changes made and reached a live website — plus the
 * step the rest stopped at and the reason recorded when they stopped. Counted
 * per workspace (not per click), so one owner pressing publish twice counts
 * once, and "live" means the server confirmed it.
 */
export const getBuilderPublishFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({
    days: Math.min(365, Math.max(1, Math.round(Number(input?.days ?? 30)))),
  }))
  .handler(async ({ context, data }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BUILDER_FUNNEL_EVENTS, summarizeBuilderFunnel } = await import("@/lib/builder-funnel");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const rows: {
      event_name: string;
      session_id: string | null;
      metadata: unknown;
      created_at: string | null;
    }[] = [];

    for (let page = 0; page < 200; page += 1) {
      const { data: batch, error } = await supabaseAdmin
        .from("marketing_conversions")
        .select("event_name, session_id, metadata, created_at")
        .in("event_name", [...BUILDER_FUNNEL_EVENTS])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error("Analytics unavailable");
      rows.push(...((batch ?? []) as typeof rows));
      if ((batch?.length ?? 0) < 1000) break;
    }

    return summarizeBuilderFunnel(rows, data.days);
  });

