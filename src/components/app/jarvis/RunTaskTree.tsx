import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TaskTree } from "@/components/app/TaskTree";
import { getJarvisRunEvents } from "@/lib/jarvis.functions";
import { nodesFromRunEvents } from "@/lib/builder/task-tree";
import { pollInterval, useRunEventsRealtime } from "@/lib/builder/run-events-realtime";

/**
 * The steps of one Jarvis reply as an inline task tree. While the reply is
 * being written (`live`) it follows the recorded steps; for a finished reply
 * it reads them once. `onRetry` is offered on a failed last step only.
 */
export function RunTaskTree({
  runId,
  live,
  onRetry,
  retryDisabled = false,
  defaultOpen,
}: {
  runId: string;
  live: boolean;
  onRetry?: () => void;
  retryDisabled?: boolean;
  defaultOpen?: boolean;
}) {
  const load = useServerFn(getJarvisRunEvents);
  const qc = useQueryClient();
  const key = ["jarvis", live ? "live-run" : "run", runId];
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["jarvis", "live-run", runId] }), [qc, runId]);
  const { connected } = useRunEventsRealtime({ runId, enabled: live, onChange: refresh });
  const q = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { runId } }),
    refetchInterval: live ? pollInterval(2000, connected) : false,
    staleTime: live ? 0 : 60_000,
    retry: false,
  });
  if (q.isError) {
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-border/70 bg-card/40 px-3.5 py-2.5 text-sm">
        <p>Couldn't load these steps.</p>
        <button type="button" onClick={() => void q.refetch()} className="min-h-9 cursor-pointer rounded-full border border-border px-3 text-xs font-medium">Try again</button>
      </div>
    );
  }
  if (q.isPending) return <p className="text-xs text-muted-foreground" role="status">Loading steps…</p>;
  const nodes = nodesFromRunEvents(q.data ?? []);
  if (!live && !nodes.length) return <p className="text-xs text-muted-foreground">No steps were recorded for this reply.</p>;
  return (
    <TaskTree
      nodes={nodes}
      ariaLabel="What Jarvis did"
      testId="jarvis-task-tree"
      retryDisabled={retryDisabled}
      {...(defaultOpen !== undefined ? { defaultOpen } : {})}
      {...(onRetry && !live ? { onRetry: () => onRetry() } : {})}
    />
  );
}
