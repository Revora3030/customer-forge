import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJarvisRunEvents } from "@/lib/jarvis.functions";

/** Steps Jarvis has finished so far in the reply it's still writing; polls every 2 seconds. */
export function LiveRunSteps({ runId }: { runId: string }) {
  const load = useServerFn(getJarvisRunEvents);
  const q = useQuery({ queryKey: ["jarvis", "live-run", runId], queryFn: () => load({ data: { runId } }), refetchInterval: 2000, retry: false });
  const steps = q.data ?? [];
  if (!steps.length) return null;
  return (
    <ol aria-live="polite" aria-label="Steps so far" className="space-y-1 border-l border-border pl-3 text-xs text-muted-foreground">
      {steps.map((e) => {
        const bad = e.status === "failed" || e.status === "rejected";
        return (
          <li key={e.id} className={bad ? "text-destructive" : ""}>
            <span className="font-medium text-foreground">{e.label ?? e.tool_id ?? e.kind}</span>
            {e.model ? ` · ${e.model}` : ""}
            {e.duration_ms !== null ? ` · ${(e.duration_ms / 1000).toFixed(1)}s` : ""}
            {bad ? " · failed" : ""}
          </li>
        );
      })}
    </ol>
  );
}
