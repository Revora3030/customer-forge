import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the steps Revora's server has actually recorded for this workspace's
 * most recent build, so the owner watches real progress rather than a guess.
 * Polls only while a build is running, and only looks at the last few minutes.
 */
export type BuildProgressStep = { stage: string; detail: string | null; at: string };

export function useBuildProgress(
  organizationId: string | null | undefined,
  active: boolean,
  requestId?: string | null,
) {
  const query = useQuery({
    queryKey: ["builder-progress", organizationId, requestId ?? "workspace"],
    enabled: Boolean(organizationId) && active,
    refetchInterval: active ? 900 : false,
    queryFn: async (): Promise<BuildProgressStep[]> => {
      // A single build stage (pictures, layouts) can run well past five minutes;
      // a short window made the card go blank mid-build.
      const since = new Date(Date.now() - 45 * 60_000).toISOString();

      // Read progress stages from builder_progress (written by both the chat
      // planner and the first-build worker) AND the latest generation job's
      // current_step (written by the worker at each stage). Merging both gives
      // the owner a complete picture of what's happening right now.
      let request = supabase
        .from("builder_progress")
        .select("stage, detail, created_at")
        .eq("organization_id", organizationId as string)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30);
      if (requestId) request = request.eq("run_id", requestId);
      const { data, error } = await request;
      if (error) throw error;

      const steps = (data ?? []).map((row) => ({
        stage: row.stage,
        detail: row.detail ?? null,
        at: row.created_at,
      }));

      // Also check the latest generation job for real-time worker status.
      // The worker writes current_step to generation_jobs at each stage, and
      // this may carry progress the builder_progress table doesn't have yet.
      if (!requestId) {
        const { data: job } = await supabase
          .from("generation_jobs")
          .select("status, current_step, progress")
          .eq("organization_id", organizationId as string)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (job?.status === "processing" && job.current_step) {
          // The worker is actively running — surface its current step too.
          steps.unshift({
            stage: String(job.current_step).replace(/_/g, " "),
            detail: `Build progress: ${job.progress ?? 0}%`,
            at: new Date().toISOString(),
          });
        }
      }

      return steps;
    },
  });

  return {
    steps: query.data ?? [],
    latest: (query.data ?? [])[0] ?? null,
  };
}
