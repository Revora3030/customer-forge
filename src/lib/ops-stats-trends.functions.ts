import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TREND_ROW_LIMIT,
  buildOpsStatsTrends,
  type OpsStatsTrends,
  type TrendKey,
} from "./ops-stats-trends";

/**
 * JC-52: read-only daily trend series for the ops command board. Platform
 * admins only. A source that errors or throws reports null for that series,
 * never an invented zero trend. Nothing here writes, sends or edits.
 */

type StampRead = { stamps: string[] | null; capped: boolean };

const stampsFrom = async (
  query: () => PromiseLike<{ data: unknown; error: unknown }>,
  field: string,
): Promise<StampRead> => {
  try {
    const result = await query();
    if (result.error || !Array.isArray(result.data)) return { stamps: null, capped: false };
    const stamps: string[] = [];
    for (const row of result.data as Record<string, unknown>[]) {
      const value = row[field];
      if (typeof value === "string" && value) stamps.push(value);
    }
    return { stamps, capped: (result.data as unknown[]).length >= TREND_ROW_LIMIT };
  } catch {
    return { stamps: null, capped: false };
  }
};

export const getOpsStatsTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpsStatsTrends> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { TEST_LEAD_SOURCE } = await import("./test-lead");
    const now = Date.now();
    const since = new Date(now - 30 * 86_400_000).toISOString();

    const [buildsOk, buildsFailed, leads, trialRows, customerIds, approvals] = await Promise.all([
      stampsFrom(
        () =>
          db
            .from("generation_jobs")
            .select("updated_at")
            .eq("status", "completed")
            .gte("updated_at", since)
            .order("updated_at", { ascending: false })
            .limit(TREND_ROW_LIMIT),
        "updated_at",
      ),
      stampsFrom(
        () =>
          db
            .from("generation_jobs")
            .select("updated_at")
            .eq("status", "failed")
            .gte("updated_at", since)
            .order("updated_at", { ascending: false })
            .limit(TREND_ROW_LIMIT),
        "updated_at",
      ),
      stampsFrom(
        () =>
          db
            .from("leads")
            .select("created_at")
            .neq("source", TEST_LEAD_SOURCE)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(TREND_ROW_LIMIT),
        "created_at",
      ),
      (async (): Promise<{ rows: { organization_id: string; started_at: string }[] | null; capped: boolean }> => {
        try {
          const result = await db
            .from("platform_trials")
            .select("organization_id, started_at")
            .gte("started_at", since)
            .order("started_at", { ascending: false })
            .limit(TREND_ROW_LIMIT);
          if (result.error || !Array.isArray(result.data)) return { rows: null, capped: false };
          const rows = (result.data as { organization_id: string; started_at: string }[]).filter(
            (row) => typeof row.started_at === "string" && typeof row.organization_id === "string",
          );
          return { rows, capped: result.data.length >= TREND_ROW_LIMIT };
        } catch {
          return { rows: null, capped: false };
        }
      })(),
      (async (): Promise<Set<string> | null> => {
        try {
          const { loadCustomerOrgIds } = await import("./customer-orgs.server");
          return await loadCustomerOrgIds(db);
        } catch {
          return null;
        }
      })(),
      stampsFrom(
        () =>
          db
            .from("approval_queue")
            .select("created_at")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(TREND_ROW_LIMIT),
        "created_at",
      ),
    ]);

    // Trials match the platform funnel: customer orgs only. If that set could
    // not be loaded, the series stays unreadable instead of counting demos.
    let trials: StampRead = { stamps: null, capped: false };
    if (trialRows.rows === null || customerIds === null) {
      trials = { stamps: null, capped: false };
    } else {
      trials = {
        stamps: trialRows.rows.filter((row) => customerIds.has(row.organization_id)).map((row) => row.started_at),
        capped: trialRows.capped,
      };
    }

    const caps: Partial<Record<TrendKey, boolean>> = {
      buildsOk: buildsOk.capped,
      buildsFailed: buildsFailed.capped,
      leads: leads.capped,
      trials: trials.capped,
      approvalsWaited: approvals.capped,
    };

    return buildOpsStatsTrends({
      buildsOk: buildsOk.stamps,
      buildsFailed: buildsFailed.stamps,
      leads: leads.stamps,
      trials: trials.stamps,
      approvalsWaited: approvals.stamps,
      caps,
      checkedAt: new Date(now).toISOString(),
      now,
      rowLimit: TREND_ROW_LIMIT,
    });
  });
