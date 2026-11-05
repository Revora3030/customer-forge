import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOT_MEASURED, formatRate } from "@/lib/ai-city-metrics";
import { TIER_LABEL, elapsedLabel, retryDraft, type PipelineLanes as Board } from "@/lib/builder/pipeline-lanes";
import { getPipelineLanes } from "@/lib/builder/pipeline-lanes.functions";

const STATUS_TONE: Record<string, string> = { processing: "text-success", queued: "text-muted-foreground", waiting: "text-gold", retrying: "text-gold", parked: "text-gold", failed: "text-destructive" };

/** JC-20: one lane per active build, from stored job rows and recorded AI team calls only. */
export function PipelineLanesView({ board, error, loading, onDraft }: { board: Board | undefined; error?: boolean; loading?: boolean; onDraft: (draft: string) => void }) {
  if (error) return <p role="alert" className="mt-2 text-xs text-destructive">Build lanes unavailable.</p>;
  if (loading || !board) return <p role="status" className="mt-2 text-xs text-muted-foreground">Loading build lanes…</p>;
  const s = board.success;
  return <>
    <p className="mt-2 text-xs"><span className="text-muted-foreground">Build success, last {s?.windowDays ?? 7} days: </span><span className="font-semibold">{formatRate(s)}</span>{s ? <span className="text-muted-foreground"> · {s.succeeded} completed · {s.failed} failed</span> : null}</p>
    {!board.jobsAvailable ? <p role="alert" className="mt-2 text-xs text-destructive">Build jobs could not be read.</p>
      : !board.lanes.length ? <p className="mt-2 text-xs text-muted-foreground">No active builds right now.</p>
      : <ol className="mt-2 space-y-1.5">{board.lanes.map((lane) => <li key={lane.jobId} className="rounded-md border border-border p-2 text-xs">
        <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{lane.name ?? <span className="font-mono">{lane.organizationId.slice(0, 8)}</span>}</span><span className={`shrink-0 font-semibold capitalize ${STATUS_TONE[lane.status] ?? "text-muted-foreground"}`}>{lane.stalled ? "stalled" : lane.status}</span></div>
        <p className="mt-1 text-[11px] text-muted-foreground">{lane.stage ? `Step ${lane.stage.number}/${lane.stage.total}: ${lane.stage.label}` : lane.status === "queued" ? "Waiting for a worker" : "Stage not recorded"} · {lane.elapsedFrom === "queued" ? "queued" : "running"} {elapsedLabel(lane.elapsedMs)}{lane.attempts ? ` · attempt ${lane.attempts}` : ""}</p>
        {lane.waitReason || lane.resumesAt ? <p className="mt-1 break-words text-[11px] text-gold">Waiting: {lane.waitReason ?? "scheduled retry"}{lane.resumesAt ? ` (resumes ${new Date(lane.resumesAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}</p> : null}
        {lane.failureKind && (lane.status === "failed" || lane.status === "parked") ? <p className="mt-1 text-[11px] text-destructive">Recorded cause: {lane.failureKind}</p> : null}
        <p className="mt-1 text-[11px] text-muted-foreground" aria-label="Recorded AI team handoffs">{lane.handoffs.length ? lane.handoffs.map((h) => TIER_LABEL[h.tier]).join(" → ") : board.traceAvailable ? "No Sol/Terra/Luna calls recorded" : "Handoffs not readable"}{lane.otherCalls ? ` · ${lane.otherCalls} other model call${lane.otherCalls === 1 ? "" : "s"}` : ""}</p>
        {lane.retry ? <Button variant="outline" size="sm" className="mt-2 min-h-11 w-full justify-start" onClick={() => onDraft(retryDraft(lane))}><RotateCcw className="size-4" /> Retry from "{lane.retry.label}" (draft)</Button> : null}
      </li>)}</ol>}
    <p className="mt-2 text-[11px] text-muted-foreground">Retry appears only for a stopped build with saved steps; it opens a draft in Jarvis and runs nothing. Success rate counts finished builds only{s ? "" : ` (${NOT_MEASURED} when none finished)`}.</p>
  </>;
}

export function PipelineLanes({ enabled, onDraft }: { enabled: boolean; onDraft: (draft: string) => void }) {
  const load = useServerFn(getPipelineLanes);
  const q = useQuery({ queryKey: ["admin-city-pipeline-lanes"], queryFn: () => load(), enabled, refetchInterval: enabled ? 30_000 : false });
  return <section className="mt-5" aria-label="Build pipeline lanes"><h3 className="text-xs font-semibold uppercase">Build pipeline lanes</h3><PipelineLanesView board={q.data} error={q.isError} loading={q.isLoading} onDraft={onDraft} /></section>;
}
