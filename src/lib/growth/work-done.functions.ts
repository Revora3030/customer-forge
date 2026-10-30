import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole } from "@/lib/org-authz.server";

const input = z.object({ organizationId: z.string().uuid() });

/**
 * Counts of the work Revora did for one business in the last 30 days and the
 * 30 before, from delivery records only. Any member of the workspace may read
 * it; every count is scoped to that workspace.
 */
export const getWorkDone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgRole(
      context.supabase as never,
      data.organizationId,
      context.userId,
      "viewer",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { summarizeWork, workWindows, WORK_ITEMS } = await import("@/lib/growth/work-done");
    type Counts = Record<(typeof WORK_ITEMS)[number]["key"], number | null>;
    const db = supabaseAdmin;
    const windows = workWindows(new Date());

    const count = async (
      run: () => PromiseLike<{ count: number | null; error: unknown }>,
    ): Promise<number | null> => {
      try {
        const { count: n, error } = await run();
        return error ? null : (n ?? 0);
      } catch {
        return null;
      }
    };

    const countsFor = async (from: string, to: string): Promise<Counts> => {
      const lifecycle = (kind: string) =>
        count(() =>
          db
            .from("lifecycle_email_log")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("kind", kind)
            .eq("status", "sent")
            .gte("created_at", from)
            .lt("created_at", to),
        );
      const [leadAlerts, followUps, leadReminders, weeklyReports, siteChecks, siteAlerts, publishes] =
        await Promise.all([
          count(() =>
            db
              .from("lead_alert_log")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .eq("status", "sent")
              .gte("created_at", from)
              .lt("created_at", to),
          ),
          count(() =>
            db
              .from("automation_runs")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .not("sent_at", "is", null)
              .gte("sent_at", from)
              .lt("sent_at", to),
          ),
          lifecycle("lead_reminder"),
          lifecycle("weekly_report"),
          count(() =>
            db
              .from("site_content_audits")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .gte("audited_at", from)
              .lt("audited_at", to),
          ),
          lifecycle("site_health_alert"),
          count(() =>
            db
              .from("publish_events")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .gte("created_at", from)
              .lt("created_at", to),
          ),
        ]);
      return { leadAlerts, followUps, leadReminders, weeklyReports, siteChecks, siteAlerts, publishes };
    };

    const [current, previous] = await Promise.all([
      countsFor(windows.start, windows.end),
      countsFor(windows.prevStart, windows.start),
    ]);
    return summarizeWork(current, previous);
  });
