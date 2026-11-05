import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listRoutineRunsFn, runRoutineSoonFn } from "@/lib/agent/routines.functions";
import { relative } from "@/lib/format";

/** JC-54: a routine's recent runs — what it read, what it proposed, what happened, and why it failed. */
export function RoutineRunHistory({
  organizationId,
  routineId,
  isOwner,
  enabled,
}: {
  organizationId: string;
  routineId: string;
  isOwner: boolean;
  enabled: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["routine-runs", organizationId, routineId],
    queryFn: () => listRoutineRunsFn({ data: { organizationId, routineId } }),
    staleTime: 30_000,
  });
  const retry = useMutation({
    mutationFn: () => runRoutineSoonFn({ data: { organizationId, routineId } }),
    onSuccess: (r) => setMessage(r.ok ? "Queued. It will start within 15 minutes." : r.message),
    onError: () => setMessage("Couldn't queue that routine. Try again."),
  });
  if (runs.isLoading) return <p className="text-[12px] text-muted-foreground">Loading runs…</p>;
  if (runs.isError) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Couldn't load the run history.{" "}
        <button type="button" className="underline" onClick={() => runs.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  const items = runs.data?.runs ?? [];
  if (items.length === 0) return <p className="text-[12px] text-muted-foreground">No runs yet.</p>;
  return (
    <div className="space-y-2" data-testid="routine-run-history">
      {message ? (
        <p role="status" className="text-[12px] text-muted-foreground">
          {message}
        </p>
      ) : null}
      <ol className="space-y-2">
        {items.map((run) => (
          <li key={run.id} className="rounded-lg border border-border p-3 text-[12px]" data-testid="routine-run">
            <p className="font-medium">
              {run.statusLabel} · {relative(run.when)}
            </p>
            {run.read.length ? <p className="text-muted-foreground">Read: {run.read.join(", ")}</p> : null}
            {run.result ? <p className="mt-1 break-words">{run.result}</p> : null}
            {run.proposals.length ? (
              <ul className="mt-1 space-y-0.5">
                {run.proposals.map((p, i) => (
                  <li key={i}>
                    Proposed: {p.summary} — <span className="text-muted-foreground">{p.outcome}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {run.failure ? (
              <div className="mt-1 space-y-1">
                <p className="text-destructive">Why it failed: {run.failure}</p>
                {isOwner && enabled ? (
                  <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
                    Try again
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
