/**
 * Per-step status of one build, for the owner/bot status views.
 *
 * Built only from the job row: the step list, the last finished step, the
 * failed stage (when there is one) and the names of the saved stage
 * checkpoints. Nothing here reads site content.
 */

export type BuildStepStatus = "done" | "running" | "failed" | "waiting" | "pending";

export type BuildStepInfo = {
  key: string;
  status: BuildStepStatus;
  /** Saved checkpoint(s) from this step; a retry reuses them when the inputs are unchanged. */
  checkpoints: string[];
};

/** The build step each saved checkpoint belongs to. */
export const CHECKPOINT_STEP: Record<string, string> = {
  brief: "analysis",
  identity: "brand",
  architecture: "structure",
  refined: "pictures",
  pictures: "pictures",
  wording: "wording",
  "qa-repair": "checks",
};

export function buildStepStatuses(
  stepKeys: readonly string[],
  job: { status?: string | null; currentStep?: string | null; failedStage?: string | null; checkpointKeys?: readonly string[] | null },
): { steps: BuildStepInfo[]; failedStep: string | null; resumable: boolean } {
  const status = job.status ?? "";
  const lastDone = job.currentStep ? stepKeys.indexOf(job.currentStep) : -1;
  const failedAt = job.failedStage ? stepKeys.indexOf(job.failedStage) : -1;
  const finished = status === "completed";
  const failed = status === "failed" || status === "parked";
  const waiting = status === "waiting";
  const active = status === "processing";
  // The step in progress (or the one that stopped): the failed stage when known, else the step after the last finished one.
  const stoppedAt = failedAt >= 0 ? failedAt : Math.min(lastDone + 1, stepKeys.length - 1);
  const saved = new Set(job.checkpointKeys ?? []);
  const steps = stepKeys.map((key, index): BuildStepInfo => {
    let state: BuildStepStatus = "pending";
    if (finished) state = "done";
    else if (failedAt >= 0 && (failed || waiting)) state = index < failedAt ? "done" : index === failedAt ? (failed ? "failed" : "waiting") : "pending";
    else if (index <= lastDone) state = "done";
    else if (index === stoppedAt) state = failed ? "failed" : waiting ? "waiting" : active ? "running" : "pending";
    const checkpoints = Object.keys(CHECKPOINT_STEP).filter((name) => CHECKPOINT_STEP[name] === key && saved.has(name));
    return { key, status: state, checkpoints };
  });
  const failedStep = steps.find((s) => s.status === "failed" || s.status === "waiting")?.key ?? null;
  return { steps, failedStep, resumable: !finished && saved.size > 0 };
}
