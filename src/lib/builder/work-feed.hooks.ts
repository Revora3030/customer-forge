import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { buildWorkFeed, type FeedGeneration, type FeedImage, type FeedJob } from "@/lib/builder/work-feed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The first-build AI rows worth showing; the rest are bookkeeping. */
const AI_KINDS = ["collective_first_build", "ai_page_architecture", "first_build_images", "collective_section_wording", "first_build_compositions", "first_build_chrome"];

export type WorkFeedJobRow = FeedJob & {
  resumes_at?: string | null;
  wait_reason?: string | null;
  wait_providers?: unknown;
  capacity_deferrals?: number | null;
};

/**
 * Everything the work log needs for one build, read from what the server
 * recorded. `runId` is the chat request id (or job id) the build was started
 * under; without one it follows the workspace's latest build. Polls while the
 * build runs, reads once when it has ended.
 */
export function useWorkFeed(organizationId: string | null | undefined, options: { runId?: string | null; live: boolean }) {
  const { runId = null, live } = options;
  const enabled = Boolean(organizationId);

  const jobQuery = useQuery({
    queryKey: ["work-feed-job", organizationId, runId ?? "latest"],
    enabled,
    refetchInterval: live ? 2500 : false,
    queryFn: async (): Promise<WorkFeedJobRow | null> => {
      let query = supabase
        .from("generation_jobs")
        .select("id, status, current_step, progress, steps, stage_timings, created_at, started_at, completed_at, error_message, failure_kind, section_checkpoints, look:stage_checkpoints->stages->identity->value, lease_expires_at, updated_at, resumes_at, wait_reason, wait_providers, capacity_deferrals, attempts")
        .eq("organization_id", organizationId as string)
        .order("created_at", { ascending: false })
        .limit(1);
      if (runId) query = UUID.test(runId) ? query.or(`request_id.eq.${runId},id.eq.${runId}`) : query.eq("request_id", runId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WorkFeedJobRow | null;
    },
  });
  const job = jobQuery.data ?? null;
  const since = job?.created_at ?? null;
  const running = live && (job?.status === "queued" || job?.status === "processing");

  const aiQuery = useQuery({
    queryKey: ["work-feed-ai", organizationId, job?.id],
    enabled: enabled && Boolean(since),
    refetchInterval: running ? 3000 : false,
    queryFn: async (): Promise<FeedGeneration[]> => {
      const { data, error } = await supabase
        .from("ai_generations")
        // Only the one-line message of a row is read, never its (large) result.
        .select("kind, model, created_at, message:result->>message, status:result->>status")
        .eq("organization_id", organizationId as string)
        .gte("created_at", since as string)
        .in("kind", AI_KINDS)
        .order("created_at", { ascending: true })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as FeedGeneration[];
    },
  });

  const imagesQuery = useQuery({
    queryKey: ["work-feed-images", organizationId, job?.id],
    enabled: enabled && Boolean(since),
    refetchInterval: running ? 4000 : false,
    queryFn: async (): Promise<FeedImage[]> => {
      const { data: records, error } = await supabase
        .from("image_records")
        .select("id, slot, status, rendered_url, media_id, created_at")
        .eq("organization_id", organizationId as string)
        .gte("created_at", since as string)
        .order("created_at", { ascending: true })
        .limit(12);
      if (error) throw error;
      const rows = (records ?? []) as unknown as { id: string; slot: string | null; status: string; rendered_url: string | null; media_id: string | null; created_at: string }[];
      const mediaIds = rows.filter((r) => !r.rendered_url && r.media_id).map((r) => r.media_id as string);
      const urls = new Map<string, string>();
      if (mediaIds.length) {
        const { data: media } = await supabase.from("media").select("id, url").in("id", mediaIds);
        for (const m of (media ?? []) as { id: string; url: string | null }[]) if (m.url) urls.set(m.id, m.url);
      }
      return rows.map((r) => ({ id: r.id, slot: r.slot, status: r.status, url: r.rendered_url ?? (r.media_id ? (urls.get(r.media_id) ?? null) : null), at: r.created_at }));
    },
  });

  const progress = useBuildProgress(organizationId, running, runId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const feed = useMemo(
    () => buildWorkFeed({ job, progress: progress.steps, generations: aiQuery.data ?? [], images: imagesQuery.data ?? [], now }),
    [job, progress.steps, aiQuery.data, imagesQuery.data, now],
  );
  return { feed, job, loading: jobQuery.isLoading };
}
