import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bot, Check, Clock, ExternalLink, Hand, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getJarvisRunEvents } from "@/lib/jarvis.functions";
import type { RunEvent } from "@/lib/jarvis-events";

const KIND_ICON = { model_call: Bot, tool: Wrench, proposal: Hand, approval: Check, error: AlertTriangle, cancelled: X } as const;
const STATUS_LABEL: Record<RunEvent["status"], string> = { running: "Running", ok: "Done", failed: "Failed", rejected: "Rejected", cancelled: "Cancelled" };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** The recorded steps of one Jarvis reply. Phone: bottom sheet; wide: side panel. */
export function RunStepsSheet({ runId, open, onOpenChange, wide }: { runId: string | null; open: boolean; onOpenChange: (open: boolean) => void; wide: boolean }) {
  const load = useServerFn(getJarvisRunEvents);
  const q = useQuery({ queryKey: ["jarvis", "run", runId], queryFn: () => load({ data: { runId: runId! } }), enabled: open && Boolean(runId), staleTime: 60000 });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={wide ? "right" : "bottom"} className={`${wide ? "w-full sm:max-w-md" : "h-[85dvh] max-h-[85dvh] rounded-t-2xl"} flex flex-col gap-0 p-0 [&>button:first-child]:hidden`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 py-1 pl-4 pr-2">
          <SheetHeader className="min-w-0 space-y-0.5 pt-2 text-left">
            <SheetTitle>What Jarvis did</SheetTitle>
            <SheetDescription>Recorded steps for this reply. Inputs and results are shortened and secrets removed.</SheetDescription>
          </SheetHeader>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close steps"><X className="size-5" aria-hidden /></Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {q.isPending ? <p className="text-sm text-muted-foreground">Loading steps…</p> : null}
          {q.isError ? (
            <div role="alert" className="space-y-2 text-sm"><p>Couldn't load these steps.</p><Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>
          ) : null}
          {q.data && !q.data.length ? <p className="text-sm text-muted-foreground">No steps were recorded for this reply.</p> : null}
          <ol className="space-y-3">
            {(q.data ?? []).map((e) => {
              const Icon = KIND_ICON[e.kind] ?? Wrench;
              const bad = e.status === "failed" || e.status === "rejected";
              return (
                <li key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${bad ? "text-destructive" : "text-primary"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">{e.label ?? e.tool_id ?? e.kind}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span className={bad ? "text-destructive" : ""}>{STATUS_LABEL[e.status]}</span>
                        {e.tool_id ? <span className="font-mono">{e.tool_id}</span> : null}
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{time(e.started_at)}{e.duration_ms !== null ? ` · ${(e.duration_ms / 1000).toFixed(1)}s` : ""}</span>
                        {e.provider ? <span>{e.provider}{e.model ? ` · ${e.model}` : ""}</span> : null}
                      </p>
                      {e.input_summary ? <p className="mt-2 break-words text-xs"><span className="text-muted-foreground">Input: </span>{e.input_summary}</p> : null}
                      {e.output_summary ? <details className="mt-1 text-xs"><summary className="cursor-pointer py-1 text-muted-foreground">Result</summary><p className="break-words">{e.output_summary}</p></details> : null}
                      {e.error ? <p className="mt-1 break-words text-xs text-destructive">{e.error}</p> : null}
                      {e.artifact_url ? <a href={e.artifact_url} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-primary underline" target="_blank" rel="noreferrer">Open result<ExternalLink className="size-3" aria-hidden /></a> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
