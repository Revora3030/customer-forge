/**
 * The inline task tree inside a chat bubble (CU-1). It replaces the spinner and
 * the steps drawer: each real step appears as it is recorded, with its status,
 * how long it took, and a Retry on a failed step when a retry is possible.
 * Collapses to one line once everything is done and opens by itself if a step
 * fails, so the way forward is never hidden. See lib/builder/task-tree.ts for
 * where the nodes come from (recorded steps only; no estimates, no model
 * reasoning).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Circle, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { formatDuration } from "@/lib/builder/work-feed";
import { summarizeTree, treeAnnouncement, treeHeadline, type TaskNode } from "@/lib/builder/task-tree";
import { cn } from "@/lib/utils";

/** Re-renders each second while `active`, so a running step's elapsed time is real, not frozen. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function StatusIcon({ status }: { status: TaskNode["status"] }) {
  if (status === "done") return <Check className="size-3.5 text-emerald-400" />;
  if (status === "running") return <Loader2 className="size-3.5 text-primary motion-safe:animate-spin" />;
  if (status === "failed") return <TriangleAlert className="size-3.5 text-destructive" />;
  return <Circle className="size-3 text-muted-foreground/50" />;
}

const STATUS_WORD: Record<TaskNode["status"], string> = { pending: "Waiting", running: "Running", done: "Done", failed: "Failed" };

/** The steps alone (no frame), for places that already have their own header. */
export function TaskTreeList({
  nodes,
  ariaLabel = "Steps",
  onRetry,
  retryDisabled = false,
  className,
}: {
  nodes: readonly TaskNode[];
  ariaLabel?: string;
  /** Offered only on a node marked retryable. */
  onRetry?: (node: TaskNode) => void;
  retryDisabled?: boolean;
  className?: string;
}) {
  const now = useNow(nodes.some((n) => n.status === "running" && n.startedAtMs != null));
  return (
    <ol className={cn("space-y-1.5", className)} aria-label={ariaLabel}>
      {nodes.map((n) => {
        const elapsed = n.status === "running" && n.startedAtMs != null ? formatDuration(Math.max(0, now - n.startedAtMs)) : "";
        const time = n.status === "done" || n.status === "failed" ? formatDuration(n.durationMs) : elapsed;
        return (
          <li key={n.id} data-status={n.status} className="flex items-start gap-2 text-[13px] leading-5">
            <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center" aria-hidden>
              <StatusIcon status={n.status} />
            </span>
            <span className={cn("min-w-0 flex-1 break-words", n.status === "pending" ? "text-muted-foreground/70" : n.status === "done" ? "text-muted-foreground" : n.status === "failed" ? "text-destructive" : "text-foreground")}>
              <span className="sr-only">{STATUS_WORD[n.status]}: </span>
              {n.label}
              {n.model ? <span className="ml-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">{n.model}</span> : null}
              {n.detail ? <span className={cn("mt-0.5 block", n.emphasizeDetail ? "text-[13px] text-foreground/80" : "text-xs text-muted-foreground/80")}>{n.detail}</span> : null}
              {n.status === "failed" && n.error ? <span className="block text-xs">{n.error}</span> : null}
              {n.status === "failed" && n.retryable && onRetry ? (
                <button
                  type="button"
                  disabled={retryDisabled}
                  onClick={() => onRetry(n)}
                  aria-label={`Retry ${n.label}`}
                  className="relative mt-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-foreground transition-colors after:absolute after:-inset-1 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Retry
                </button>
              ) : null}
            </span>
            {time ? <span className="tnum shrink-0 text-xs text-muted-foreground/70" aria-hidden={n.status === "running"}>{time}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The framed, collapsible tree. `children` render inside the open panel under
 * the steps (a note, a "Stop waiting" button). `headline` overrides the
 * computed one-liner.
 */
export function TaskTree({
  nodes,
  ariaLabel = "Steps",
  headline,
  onRetry,
  retryDisabled = false,
  children,
  testId = "task-tree",
  defaultOpen,
}: {
  nodes: readonly TaskNode[];
  ariaLabel?: string;
  headline?: string;
  onRetry?: (node: TaskNode) => void;
  retryDisabled?: boolean;
  children?: ReactNode;
  testId?: string;
  /** Overrides the starting state (open while running or failed, closed once done). */
  defaultOpen?: boolean;
}) {
  const summary = summarizeTree(nodes);
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen ?? summary.state !== "done");
  const touched = useRef(false);
  const last = useRef(summary.state);

  // Collapse by itself once everything is done and open up if a step fails,
  // unless the owner has already chosen for themselves.
  useEffect(() => {
    if (last.current !== summary.state && !touched.current) {
      if (summary.state === "done") setOpen(false);
      if (summary.state === "failed") setOpen(true);
    }
    last.current = summary.state;
  }, [summary.state]);

  const text = headline ?? treeHeadline(nodes);
  const running = summary.state === "running" || summary.state === "idle";
  const runningNode = nodes.find((n) => n.status === "running" && n.startedAtMs != null);
  const now = useNow(Boolean(runningNode));
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40" data-testid={testId} data-state={summary.state}>
      <button
        type="button"
        onClick={() => {
          touched.current = true;
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="relative grid size-5 shrink-0 place-items-center" aria-hidden>
          {running ? (
            <>
              <span className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-primary" />
            </>
          ) : summary.state === "done" ? (
            <Check className="size-4 text-emerald-400" />
          ) : (
            <TriangleAlert className="size-4 text-destructive" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{text}</span>
        {runningNode?.startedAtMs != null ? <span className="tnum shrink-0 text-xs text-muted-foreground" aria-hidden>{formatDuration(Math.max(0, now - runningNode.startedAtMs))}</span> : null}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {/* One polite announcement per change; the ticking timer is never read out. */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{treeAnnouncement(nodes)}</span>
      {open ? (
        <div id={panelId} className="space-y-2 border-t border-border/60 px-3.5 py-2.5">
          {nodes.length ? <TaskTreeList nodes={nodes} ariaLabel={ariaLabel} {...(onRetry ? { onRetry } : {})} retryDisabled={retryDisabled} /> : <p className="text-xs text-muted-foreground">Waiting for the first step to be recorded…</p>}
          {summary.elapsedMs != null ? (
            <p className="tnum border-t border-border/60 pt-2 text-xs text-muted-foreground" data-testid="task-tree-total">
              Total elapsed {formatDuration(summary.elapsedMs)}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
