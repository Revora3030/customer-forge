import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------------- Build / publish / picture health (spec L) ---------------------- */

/**
 * Seven-day platform health for builds, publishes and pictures. Super-admin
 * only; reads aggregate rows with the service role after the check. Returns
 * counts and timings only — never tenant content.
 */
export const getBuildHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { fetchAllRows } = await import("@/lib/paginate");
    const all = (build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) =>
      fetchAllRows(build).then((r) => ({ data: r.rows, error: r.error }));
    const [jobs, publishes, images] = await Promise.all([
      all((from, to) =>
        db
          .from("generation_jobs")
          .select("status, failure_kind, failed_stage, error_message, stage_timings, created_at, started_at, completed_at")
          .gte("created_at", since)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      all((from, to) => db.from("publish_events").select("smoke_status").gte("created_at", since).order("id", { ascending: true }).range(from, to)),
      all((from, to) => db.from("image_records").select("status, source").gte("updated_at", since).order("id", { ascending: true }).range(from, to)),
    ]);
    if (jobs.error) throw new Error("Couldn't load build health.");
    const { summariseBuilds, summarisePublishes, summariseImages, buildAlerts } = await import("@/lib/build-monitoring");
    const builds = summariseBuilds((jobs.data ?? []) as never);
    const publish = summarisePublishes((publishes.data ?? []) as never);
    return {
      builds,
      publishes: publish,
      images: summariseImages((images.data ?? []) as never),
      alerts: buildAlerts(builds, publish),
    };
  });

/**
 * The newest builds with what each produced: primitives used, picture counts
 * and stage timings. Super-admin only; counts and timings, never tenant words.
 * Primitives and pictures describe the organization's site as it is now.
 */
export const getRecentBuildReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const { data: jobs, error } = await db
      .from("generation_jobs")
      .select("id, organization_id, status, failed_stage, failure_kind, stage_timings, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(6);
    if (error) throw new Error("Couldn't load recent builds.");
    const { buildReport } = await import("@/lib/build-report");
    return Promise.all(
      (jobs ?? []).map(async (job) => {
        const [sections, pictures] = await Promise.all([
          db.from("website_sections").select("settings").eq("organization_id", job.organization_id).eq("is_visible", true),
          db.from("image_records").select("status").eq("organization_id", job.organization_id),
        ]);
        return {
          id: String(job.id),
          organization: String(job.organization_id).slice(0, 8),
          status: String(job.status),
          failedStage: (job.failed_stage as string | null) ?? null,
          failureKind: (job.failure_kind as string | null) ?? null,
          createdAt: String(job.created_at),
          report: buildReport(
            (sections.data ?? []) as { settings: unknown }[],
            (pictures.data ?? []) as { status: string }[],
            job.stage_timings as Record<string, number> | null,
          ),
        };
      }),
    );
  });
