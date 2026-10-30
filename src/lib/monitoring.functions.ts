/** Error reporting + the admin error feed. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ErrorFeedRow = {
  id: string;
  fingerprint: string;
  level: string;
  source: string;
  message: string;
  route: string | null;
  statusCode: number | null;
  organizationId: string | null;
  createdAt: string;
  forwarded: boolean;
};

export type ErrorGroup = {
  fingerprint: string;
  message: string;
  route: string | null;
  level: string;
  source: string;
  count: number;
  lastSeen: string;
  firstSeen: string;
};

export type ErrorFeed = {
  groups: ErrorGroup[];
  recent: ErrorFeedRow[];
  totals: { last24h: number; last7d: number; forwarded: number };
  /** True only when Sentry forwarding is actually configured. */
  sentryConfigured: boolean;
};

/** Records a browser-side crash. Deliberately small, bounded and unauthenticated. */
export const reportClientError = createServerFn({ method: "POST" })
  .validator(
    (input: {
      message: string;
      stack?: string;
      route?: string;
      mechanism?: string;
      componentStack?: string;
      kind?: string;
      level?: string;
    }) => ({
      message: String(input?.message ?? "").slice(0, 500),
      stack: String(input?.stack ?? "").slice(0, 4000) || undefined,
      route: String(input?.route ?? "").slice(0, 300) || undefined,
      mechanism: String(input?.mechanism ?? "").slice(0, 80) || undefined,
      componentStack: String(input?.componentStack ?? "").slice(0, 4000) || undefined,
      kind: String(input?.kind ?? "").slice(0, 60) || undefined,
      level: input?.level === "warning" ? ("warning" as const) : ("error" as const),
    }),
  )
  .handler(async ({ data }) => {
    if (!data.message) return { recorded: false };
    const { captureError } = await import("@/lib/monitoring.server");
    const result = await captureError({
      message: data.message,
      stack: data.stack ?? null,
      route: data.route ?? null,
      source: "client",
      level: data.level,
      context: {
        mechanism: data.mechanism ?? "client",
        thrownKind: data.kind ?? "",
        componentStack: data.componentStack ?? "",
      },
    });
    return { recorded: result.recorded };
  });

/** Grouped, actionable error feed for the platform admin. */
export const getErrorFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ErrorFeed> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("error_events")
      .select(
        "id, fingerprint, level, source, message, route, status_code, organization_id, created_at, forwarded",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Couldn't load the error feed.");

    // The feed samples the newest 1,000 rows; the totals are exact counts so
    // an error storm never plateaus at 1,000.
    const dayAgoIso = new Date(Date.now() - 86_400_000).toISOString();
    const exact = (from: string, forwardedOnly = false) => {
      let query = supabaseAdmin.from("error_events").select("id", { count: "exact", head: true }).gte("created_at", from).in("level", ["fatal", "error"])
        // Visitor disconnects are not failures (see captureError).
        .or("status_code.is.null,status_code.neq.499")
        .not("message", "in", '("aborted","This operation was aborted","The operation was aborted.")');
      if (forwardedOnly) query = query.eq("forwarded", true);
      return query;
    };
    const [day, week, forwarded] = await Promise.all([exact(dayAgoIso), exact(since), exact(since, true)]);

    const { isAbortLike } = await import("@/lib/monitoring.server");
    // Rows written before aborts stopped being recorded (visitor disconnects,
    // status 499) are hidden from the feed; they are not failures.
    const rows = (data ?? []).filter((row) => row.status_code !== 499 && !isAbortLike(null, row.message)).map((row) => ({
      id: row.id as string,
      fingerprint: row.fingerprint as string,
      level: row.level as string,
      source: row.source as string,
      message: row.message as string,
      route: (row.route as string | null) ?? null,
      statusCode: (row.status_code as number | null) ?? null,
      organizationId: (row.organization_id as string | null) ?? null,
      createdAt: row.created_at as string,
      forwarded: Boolean(row.forwarded),
    }));

    const byFingerprint = new Map<string, ErrorGroup>();
    for (const row of rows) {
      const existing = byFingerprint.get(row.fingerprint);
      if (existing) {
        existing.count += 1;
        existing.firstSeen = row.createdAt;
      } else {
        byFingerprint.set(row.fingerprint, {
          fingerprint: row.fingerprint,
          message: row.message,
          route: row.route,
          level: row.level,
          source: row.source,
          count: 1,
          lastSeen: row.createdAt,
          firstSeen: row.createdAt,
        });
      }
    }

    const dayAgo = Date.now() - 86_400_000;
    return {
      groups: [...byFingerprint.values()].sort((a, b) => b.count - a.count).slice(0, 50),
      recent: rows.slice(0, 100),
      totals: {
        last24h: day.error ? rows.filter((row) => row.level !== "warning" && row.level !== "info" && new Date(row.createdAt).getTime() >= dayAgo).length : (day.count ?? 0),
        last7d: week.error ? rows.length : (week.count ?? 0),
        forwarded: forwarded.error ? rows.filter((row) => row.forwarded).length : (forwarded.count ?? 0),
      },
      sentryConfigured: Boolean(process.env["SENTRY_DSN"]),
    };
  });
