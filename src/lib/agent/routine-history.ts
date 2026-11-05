/**
 * JC-54: one routine run in plain words — what it read, what it proposed, what
 * happened to each proposal, and why it failed. Built only from stored rows;
 * nothing is guessed.
 */
export type HistoryRun = {
  id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  result_summary: string | null;
  error_plain: string | null;
};
export type HistoryStep = { run_id: string; seq: number; tool: string | null; status: string };
export type HistoryApproval = { run_id: string | null; summary: string; status: string; tool: string };

export type RoutineRunView = {
  id: string;
  when: string;
  statusLabel: string;
  tone: "ok" | "waiting" | "failed";
  read: string[];
  proposals: { summary: string; outcome: string }[];
  result: string | null;
  failure: string | null;
};

const STATUS: Record<string, { label: string; tone: RoutineRunView["tone"] }> = {
  queued: { label: "Waiting to start", tone: "waiting" },
  processing: { label: "Running", tone: "waiting" },
  needs_approval: { label: "Waiting for your approval", tone: "waiting" },
  needs_input: { label: "Waiting for your answer", tone: "waiting" },
  done: { label: "Finished", tone: "ok" },
  failed: { label: "Failed", tone: "failed" },
  cancelled: { label: "Stopped", tone: "failed" },
};

const OUTCOME: Record<string, string> = {
  pending: "Waiting for you",
  approved: "You approved it",
  consumed: "You approved it and it was done",
  rejected: "You turned it down; nothing was sent",
  expired: "Expired without an answer; nothing was sent",
  cancelled: "Cancelled; nothing was sent",
};

export const FAILURE_FALLBACK = "The run stopped without saying why.";

const toolLabel = (tool: string) => tool.replace(/[_.]+/g, " ").trim();

export function routineRunViews(runs: HistoryRun[], steps: HistoryStep[], approvals: HistoryApproval[]): RoutineRunView[] {
  return [...runs]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((run) => {
      const status = STATUS[run.status] ?? { label: run.status, tone: "waiting" as const };
      const read = [
        ...new Set(
          steps
            .filter((s) => s.run_id === run.id && s.tool && s.status === "ok")
            .sort((a, b) => a.seq - b.seq)
            .map((s) => toolLabel(s.tool!)),
        ),
      ];
      const proposals = approvals
        .filter((a) => a.run_id === run.id)
        .map((a) => ({ summary: a.summary.trim() || toolLabel(a.tool), outcome: OUTCOME[a.status] ?? a.status }));
      const failed = status.tone === "failed" && run.status === "failed";
      return {
        id: run.id,
        when: run.created_at,
        statusLabel: status.label,
        tone: status.tone,
        read,
        proposals,
        result: run.result_summary?.trim() || null,
        failure: failed ? run.error_plain?.trim() || FAILURE_FALLBACK : null,
      };
    });
}
