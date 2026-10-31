/**
 * Maps the latest build job row (generation_jobs) onto the labelled stages the
 * Welcome page tracker shows. Pure and dependency-light so it is unit tested.
 *
 * Everything here is read straight from what the worker recorded:
 *  - `status`: queued | processing | completed | failed | cancelled
 *  - `steps`: the stage keys the worker has finished, in order
 *  - `current_step`: the LAST stage finished (the worker writes it when a stage
 *    completes), so the stage being worked on is the one after it
 *  - `failed_stage`: the stage an attempt stopped on, when the worker knew it
 *
 * There is no percentage and no time estimate: the tracker says what is done,
 * what is being worked on, and what has not started.
 */
import { GENERATION_STEPS } from "@/lib/site-engine";
import { describeBuildFailure, untaggedMessage } from "@/lib/builder/build-failure";
import { isRetryWait } from "@/lib/builder/job-liveness";

export type TrackerStepState = "done" | "current" | "pending" | "failed";

export type TrackerStep = { key: string; label: string; state: TrackerStepState };

export type TrackerPhase = "queued" | "building" | "completed" | "failed" | "cancelled";

export type TrackerJobRow = {
  status?: string | null;
  steps?: unknown;
  current_step?: string | null;
  failed_stage?: string | null;
  failure_kind?: string | null;
  error_message?: string | null;
  attempts?: number | null;
  started_at?: string | null;
};

export type BuildTrackerModel = {
  phase: TrackerPhase;
  /** Short status line for the header pill. */
  statusLabel: string;
  /** Plain sentence under the heading. */
  summary: string;
  steps: TrackerStep[];
  doneCount: number;
  /** The existing owner-facing failure explanation, for failed and cancelled builds. */
  failure: { label: string; message: string } | null;
  /** A completed build that carries a worker note (e.g. a basic design used in places), shown as-is. */
  completedNote: string | null;
};

const KEYS = GENERATION_STEPS.map((step) => step.key);

function completedKeys(row: TrackerJobRow): Set<string> {
  const done = new Set<string>();
  if (Array.isArray(row.steps)) {
    for (const key of row.steps) if (typeof key === "string" && KEYS.includes(key)) done.add(key);
  }
  // current_step is the last finished stage; everything before it is finished too.
  const last = row.current_step ? KEYS.indexOf(row.current_step) : -1;
  if (last >= 0) for (const key of KEYS.slice(0, last + 1)) done.add(key);
  return done;
}

/** Returns null when there is no build job at all (nothing real to show). */
export function buildTrackerModel(row: TrackerJobRow | null | undefined): BuildTrackerModel | null {
  const status = row?.status ?? null;
  if (!row || !status) return null;

  let phase: TrackerPhase;
  if (status === "completed") phase = "completed";
  else if (status === "failed") phase = "failed";
  else if (status === "cancelled") phase = "cancelled";
  else if (status === "processing") phase = "building";
  else if (status === "queued") phase = "queued";
  else return null; // an unknown status is not something we can honestly label

  const done = phase === "completed" ? new Set(KEYS) : completedKeys(row);
  const firstOpen = KEYS.find((key) => !done.has(key)) ?? null;
  const failedKey = row.failed_stage && KEYS.includes(row.failed_stage) ? row.failed_stage : null;

  const steps: TrackerStep[] = GENERATION_STEPS.map((step) => {
    let state: TrackerStepState = "pending";
    if (done.has(step.key)) state = "done";
    else if (phase === "building" && step.key === firstOpen) state = "current";
    else if (phase === "failed" && step.key === (failedKey ?? firstOpen)) state = "failed";
    return { key: step.key, label: step.label, state };
  });
  const doneCount = steps.filter((step) => step.state === "done").length;

  const failure = phase === "failed" || phase === "cancelled" ? describeBuildFailure(row) : null;
  const current = steps.find((step) => step.state === "current");

  const statusLabel = {
    queued: isRetryWait(row) ? "Waiting to retry" : "Queued",
    building: "Building",
    completed: "Draft ready",
    failed: "Build stopped",
    cancelled: "Cancelled",
  }[phase];

  const summary = {
    queued: isRetryWait(row)
      ? "The build is waiting for its next attempt. Stages already finished are kept."
      : "Your build is queued and has not started yet.",
    building: current ? `Working on: ${current.label}` : "The build is running.",
    completed: "Every build stage finished. Your draft is ready for review.",
    failed: "The build stopped before it finished. Stages that finished are kept.",
    cancelled: "The build was cancelled before it finished.",
  }[phase];

  const completedNote = phase === "completed" ? untaggedMessage(row.error_message).trim() || null : null;

  return {
    phase,
    statusLabel,
    summary,
    steps,
    doneCount,
    failure: failure ? { label: failure.label, message: failure.message } : null,
    completedNote,
  };
}
