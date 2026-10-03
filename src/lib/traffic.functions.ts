import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/paginate";

/**
 * Traffic report for the caller's own website, plus notifications for problems
 * that need attention. RLS scopes every read and write to their workspace.
 */
export const getTrafficReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; days?: number; notify?: boolean; tzOffset?: number }) => ({
    organizationId: String(input?.organizationId ?? ""),
    // Browser getTimezoneOffset(); real offsets are within ±14 hours.
    tzOffset: Number.isFinite(Number(input?.tzOffset)) ? Math.min(Math.max(Math.round(Number(input?.tzOffset)), -840), 840) : 0,
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
    notify: input?.notify !== false,
  }))
  .handler(async ({ data, context }) => {
    const { summarizeTraffic, detectTrafficIssues } = await import("@/lib/traffic");
    const since = new Date(Date.now() - data.days * 2 * 86_400_000).toISOString();

    const [events, settings, quote, services, reviews, leads] = await Promise.all([
      fetchAllRows<{
        event_type: string;
        path: string | null;
        source: string | null;
        device: string | null;
        session_id: string | null;
        created_at: string;
      }>((from, to) =>
        context.supabase
          .from("analytics_events")
          .select("event_type, path, source, device, session_id, created_at")
          .eq("organization_id", data.organizationId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      context.supabase
        .from("website_settings")
        .select("publish_state, custom_domain, dns_ok, ssl_ok, traffic_alerts_enabled")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
      context.supabase
        .from("quote_forms")
        .select("id, is_active")
        .eq("organization_id", data.organizationId)
        .eq("is_active", true)
        .limit(1),
      context.supabase
        .from("services")
        .select("id, bookable")
        .eq("organization_id", data.organizationId)
        .eq("bookable", true),
      context.supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("is_published", true),
      context.supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .gte("created_at", new Date(Date.now() - data.days * 86_400_000).toISOString()),
    ]);

    if (settings.error) throw new Error("You don't have access to that workspace.");

    const summary = summarizeTraffic(events.rows, data.days, data.tzOffset);
    const issues = detectTrafficIssues({
      summary,
      published: settings.data?.publish_state === "published",
      hasQuoteForm: (quote.data ?? []).length > 0,
      bookableServices: (services.data ?? []).length,
      reviewCount: reviews.count ?? 0,
      domainLive: !!settings.data?.dns_ok && !!settings.data?.ssl_ok,
      hasCustomDomain: !!settings.data?.custom_domain,
      leadsInWindow: leads.count ?? 0,
    });

    // Notify once per problem per day, so the bell is useful rather than noisy.
    let notified = 0;
    if (data.notify && settings.data?.traffic_alerts_enabled !== false) {
      const critical = issues.filter((issue) => issue.severity === "critical");
      if (critical.length) {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const { data: existing } = await context.supabase
          .from("notifications")
          .select("title")
          .eq("organization_id", data.organizationId)
          .eq("kind", "traffic")
          .gte("created_at", dayStart.toISOString());
        const already = new Set((existing ?? []).map((row) => row.title));
        const rows = critical
          .filter((issue) => !already.has(issue.title))
          .map((issue) => ({
            organization_id: data.organizationId,
            title: issue.title,
            body: `${issue.detail} ${issue.fix}`,
            kind: "traffic",
            link: issue.href,
          }));
        if (rows.length) {
          const { error } = await context.supabase.from("notifications").insert(rows);
          if (!error) notified = rows.length;
        }
      }
      await context.supabase
        .from("website_settings")
        .update({ traffic_checked_at: new Date().toISOString() })
        .eq("organization_id", data.organizationId);
    }

    return { summary, issues, notified, checkedAt: new Date().toISOString() };
  });

/** Turns the traffic alert notifications on or off for a workspace. */
export const setTrafficAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; enabled: boolean }) => ({
    organizationId: String(input?.organizationId ?? ""),
    enabled: !!input?.enabled,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("website_settings")
      .update({ traffic_alerts_enabled: data.enabled })
      .eq("organization_id", data.organizationId);
    if (error) throw new Error("Couldn't save that. Please try again.");
    return { enabled: data.enabled };
  });
