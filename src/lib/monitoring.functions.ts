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
  .inputValidator(
    (input: {
      message: string;
      stack?: string;
      route?: string;
      mechanism?: string;
      componentStack?: string;
    }) => ({
      message: String(input?.message ?? "").slice(0, 500),
      stack: String(input?.stack ?? "").slice(0, 4000) || undefined,
      route: String(input?.route ?? "").slice(0, 300) || undefined,
      mechanism: String(input?.mechanism ?? "").slice(0, 80) || undefined,
      componentStack: String(input?.componentStack ?? "").slice(0, 4000) || undefined,
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
      level: "error",
      context: {
        mechanism: data.mechanism ?? "client",
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

    const rows = (data ?? []).map((row) => ({
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
        last24h: rows.filter((row) => new Date(row.createdAt).getTime() >= dayAgo).length,
        last7d: rows.length,
        forwarded: rows.filter((row) => row.forwarded).length,
      },
      sentryConfigured: Boolean(process.env["SENTRY_DSN"]),
    };
  });
