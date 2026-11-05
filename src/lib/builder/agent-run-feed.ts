/** PAI-15: turns agent_run / agent_run_events rows into the chat's run log. Shows only what was recorded. */
export type RunRow = {
  id: string;
  status: string;
  result_summary: string | null;
  error_plain: string | null;
  created_at: string;
};
export type RunEventRow = { id: number; kind: string; message: string; created_at: string };

export type RunFeedState = "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
export type RunFeed = {
  state: RunFeedState;
  headline: string;
  detail: string | null;
  lines: { id: number; text: string; at: string; tone: "info" | "ok" | "warn" }[];
};

const WARN_KINDS = new Set([
  "tool_failed",
  "tool_timeout",
  "tool_unknown",
  "verify_failed",
  "approval_not_granted",
  "approval_request_failed",
  "model_reply_rejected",
]);
const OK_KINDS = new Set(["tool_finished", "verify_passed", "run_finished"]);

export function runFeedState(status: string): RunFeedState {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "running";
    case "needs_approval":
    case "needs_input":
      return "waiting";
    case "done":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

export function isRunLive(status: string | null | undefined): boolean {
  return status === "queued" || status === "processing";
}

export function buildRunFeed(run: RunRow | null, events: readonly RunEventRow[]): RunFeed | null {
  if (!run) return null;
  const state = runFeedState(run.status);
  const headline =
    state === "queued"
      ? "Waiting for a worker to start"
      : state === "running"
        ? "Working on it"
        : run.status === "needs_approval"
          ? "Waiting for your approval"
          : state === "waiting"
            ? "Waiting for your answer"
            : state === "done"
              ? "Finished"
              : state === "cancelled"
                ? "Stopped"
                : "Stopped before it finished";
  const detail =
    state === "done" ? run.result_summary : state === "failed" ? run.error_plain : null;
  const lines = events.map((event) => ({
    id: event.id,
    text: event.message,
    at: event.created_at,
    tone: (WARN_KINDS.has(event.kind) ? "warn" : OK_KINDS.has(event.kind) ? "ok" : "info") as
      "info" | "ok" | "warn",
  }));
  return { state, headline, detail, lines };
}
