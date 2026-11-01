/**
 * The inline task tree shown inside a chat bubble (CU-1): one node per real
 * step, with its status, how long it really took, and a Retry only where a
 * retry is really possible. Pure and browser-safe.
 *
 * Every node is built from something the server recorded (jarvis_run_events,
 * builder_progress, generation_jobs). Nothing is estimated: a step with no
 * recorded duration shows none, there are no percentages, and no model
 * reasoning is ever read here (the adapters only look at step names, statuses,
 * times, the model's name and a shortened error).
 */
import type { RunEvent } from "@/lib/jarvis-events";
import { formatModelLabel } from "@/lib/jarvis-model-label";
import { formatDuration, timedSteps, type FeedProgressRow, type WorkStage } from "@/lib/builder/work-feed";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export type TaskNode = {
  id: string;
  label: string;
  /** One recorded line under the label (a section count, a shortened input). */
  detail: string | null;
  status: TaskStatus;
  /** Recorded duration; null while running or when none was recorded. */
  durationMs: number | null;
  /** When a running step began, so the view can show real elapsed time. */
  startedAtMs: number | null;
  /** A model's display name, only when the step recorded one. */
  model: string | null;
  /** Plain-words reason for a failed step (already shortened and redacted by the writer). */
  error: string | null;
  /** True when the owner can retry this step; the view shows Retry only then. */
  retryable: boolean;
};

export type TaskTreeSummary = {
  total: number;
  done: number;
  running: number;
  failed: number;
  pending: number;
  /** "idle" = nothing recorded yet. */
  state: "idle" | "running" | "done" | "failed";
  /** Sum of the recorded durations; null when any finished step has none (no guessing). */
  totalMs: number | null;
};

const toMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

const node = (partial: Pick<TaskNode, "id" | "label" | "status"> & Partial<TaskNode>): TaskNode => ({
  detail: null,
  durationMs: null,
  startedAtMs: null,
  model: null,
  error: null,
  retryable: false,
  ...partial,
});

/**
 * Jarvis run events -> nodes, in the order they ran. A rejected step is one the
 * owner declined, a cancelled one was stopped; neither is offered a Retry
 * (running it again would override that choice). Only a failed LAST step is
 * retryable: an earlier failure that a later step recovered from is shown as
 * it happened, but retrying it would redo a reply that already went through.
 */
export function nodesFromRunEvents(events: readonly RunEvent[]): TaskNode[] {
  return events.map((e, index) => {
    const failed = e.status === "failed" || e.status === "rejected" || e.status === "cancelled";
    const status: TaskStatus = e.status === "running" ? "running" : failed ? "failed" : "done";
    const error = e.status === "rejected" ? "Declined" : e.status === "cancelled" ? "Stopped" : (e.error ?? (failed ? "Failed" : null));
    return node({
      id: e.id,
      label: e.label ?? e.tool_id ?? e.kind.replace(/_/g, " "),
      detail: e.input_summary,
      status,
      durationMs: status === "running" ? null : e.duration_ms,
      startedAtMs: status === "running" ? toMs(e.started_at) : null,
      model: e.kind === "model_call" ? formatModelLabel(e.model, e.provider) : null,
      error: status === "failed" ? error : null,
      retryable: e.status === "failed" && index === events.length - 1,
    });
  });
}

/** A build's stages -> nodes. The stopped stage is the retryable one. */
export function nodesFromStages(stages: readonly WorkStage[], options: { failedDetail?: string | null; runningDetail?: string | null } = {}): TaskNode[] {
  return stages.map((stage) => {
    const status: TaskStatus = stage.state === "done" ? "done" : stage.state === "running" ? "running" : stage.state === "pending" ? "pending" : "failed";
    return node({
      id: stage.key,
      label: stage.label,
      status,
      durationMs: stage.state === "done" ? stage.durationMs : null,
      detail: stage.state === "running" ? (options.runningDetail ?? null) : null,
      error: stage.state === "failed" ? (options.failedDetail ?? "Stopped before it finished") : stage.state === "cancelled" ? "Stopped before it finished" : null,
      retryable: stage.state === "failed",
    });
  });
}

/**
 * Recorded planning/apply stages (newest first, as the progress query returns
 * them) -> nodes with the gap to the next stage as each one's duration. The
 * newest stage is the one still running while `running` is true.
 */
export function nodesFromProgress(rows: readonly FeedProgressRow[], options: { running: boolean; model?: string | null }): TaskNode[] {
  const latest = rows[0]?.stage ?? null;
  return timedSteps(rows).map((step) => {
    const isRunning = options.running && step.stage === latest;
    return node({
      id: `${step.stage}-${step.at}`,
      label: step.stage,
      detail: step.detail,
      status: isRunning ? "running" : "done",
      durationMs: isRunning ? null : step.durationMs,
      startedAtMs: isRunning ? toMs(step.at) : null,
      model: isRunning ? (options.model ?? null) : null,
    });
  });
}

export function summarizeTree(nodes: readonly TaskNode[]): TaskTreeSummary {
  const count = (status: TaskStatus) => nodes.filter((n) => n.status === status).length;
  const done = count("done");
  const running = count("running");
  const failed = count("failed");
  const pending = count("pending");
  const finishedNodes = nodes.filter((n) => n.status === "done");
  const known = finishedNodes.filter((n) => n.durationMs != null);
  return {
    total: nodes.length,
    done,
    running,
    failed,
    pending,
    state: !nodes.length ? "idle" : failed ? "failed" : running || pending ? "running" : "done",
    totalMs: finishedNodes.length && known.length === finishedNodes.length ? known.reduce((sum, n) => sum + (n.durationMs ?? 0), 0) : null,
  };
}

/** The one line in the tree's header: where it is now, or how it ended. */
export function treeHeadline(nodes: readonly TaskNode[]): string {
  const s = summarizeTree(nodes);
  if (s.state === "idle") return "Getting started";
  if (s.state === "failed") return `Stopped at: ${nodes.find((n) => n.status === "failed")?.label ?? "a step"}`;
  if (s.state === "running") return nodes.find((n) => n.status === "running")?.label ?? "Working";
  return `Done · ${s.done} step${s.done === 1 ? "" : "s"}${s.totalMs != null ? ` · ${formatDuration(s.totalMs)}` : ""}`;
}

/**
 * What a screen reader hears when the tree changes: only the newest transition
 * (never a ticking timer), so a polite live region stays quiet between steps.
 */
export function treeAnnouncement(nodes: readonly TaskNode[]): string {
  const s = summarizeTree(nodes);
  if (s.state === "idle") return "";
  const failed = nodes.find((n) => n.status === "failed");
  if (failed) return `Failed: ${failed.label}`;
  const running = nodes.find((n) => n.status === "running");
  if (running) return `Now: ${running.label}`;
  return `Finished ${s.done} step${s.done === 1 ? "" : "s"}`;
}
