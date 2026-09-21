import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the steps Revora's server has actually recorded for this workspace's
 * most recent build, so the owner watches real progress rather than a guess.
 * Polls only while a build is running, and only looks at the last few minutes.
 */
export type BuildProgressStep = { stage: string; detail: string | null; at: string };

export function useBuildProgress(organizationId: string | null | undefined, active: boolean) {
  const query = useQuery({
    queryKey: ["builder-progress", organizationId],
    enabled: Boolean(organizationId) && active,
    refetchInterval: active ? 900 : false,
    queryFn: async (): Promise<BuildProgressStep[]> => {
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data, error } = await supabase
        .from("builder_progress")
        .select("stage, detail, created_at")
        .eq("organization_id", organizationId as string)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        stage: row.stage,
        detail: row.detail ?? null,
        at: row.created_at,
      }));
    },
  });

  return {
    steps: query.data ?? [],
    latest: (query.data ?? [])[0] ?? null,
  };
}
