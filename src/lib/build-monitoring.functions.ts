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
    const [jobs, publishes, images] = await Promise.all([
      db
        .from("generation_jobs")
        .select("status, failure_kind, failed_stage, error_message, stage_timings, created_at, started_at, completed_at")
        .gte("created_at", since)
        .limit(5000),
      db.from("publish_events").select("smoke_status").gte("created_at", since).limit(5000),
      db.from("image_records").select("status, source").gte("updated_at", since).limit(10000),
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
