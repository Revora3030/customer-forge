import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRunFeed,
  isRunLive,
  type RunEventRow,
  type RunRow,
} from "@/lib/builder/agent-run-feed";

/** Reads one run and its events (workspace members can read both). Polls while the run is live. */
export function useAgentRunFeed(
  organizationId: string | null | undefined,
  runId: string | null | undefined,
) {
  const enabled = Boolean(organizationId && runId);
  const runQuery = useQuery({
    queryKey: ["agent-run", organizationId, runId],
    enabled,
    refetchInterval: (query) =>
      isRunLive((query.state.data as RunRow | null | undefined)?.status ?? "queued") ? 3000 : false,
    queryFn: async (): Promise<RunRow | null> => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, status, result_summary, error_plain, created_at")
        .eq("organization_id", organizationId as string)
        .eq("id", runId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as RunRow | null;
    },
  });
  const live = isRunLive(runQuery.data?.status);
  const eventsQuery = useQuery({
    queryKey: ["agent-run-events", organizationId, runId, runQuery.data?.status],
    enabled: enabled && Boolean(runQuery.data),
    refetchInterval: live ? 3000 : false,
    queryFn: async (): Promise<RunEventRow[]> => {
      const { data, error } = await supabase
        .from("agent_run_events")
        .select("id, kind, message, created_at, data")
        .eq("organization_id", organizationId as string)
        .eq("run_id", runId as string)
        .order("id", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as RunEventRow[];
    },
  });
  return {
    feed: buildRunFeed(runQuery.data ?? null, eventsQuery.data ?? []),
    loading: runQuery.isLoading,
  };
}
