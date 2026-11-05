/**
 * JC-20 build pipeline lanes, pure part.
 *
 * One lane per active build job, built only from the stored job row and the recorded AI team trace:
 *  - stage: the step the job is on (from `current_step` / `failed_stage` via B13-2 `buildStepStatuses`);
 *  - elapsed: time since the job started (or since it was queued, when it has not started);
 *  - wait reason: the stored `wait_reason` / `resumes_at`, never a guess;
 *  - handoff markers: changes between Sol, Terra and Luna in the recorded trace, only for calls whose recorded model
 *    is the configured model of that tier. Calls by any other model are counted, not labelled;
 *  - retry: offered only for a failed or parked job that has saved stage checkpoints (B13-2 resume). It is a step
 *    pointer for a drafted Jarvis mission, never an action from here.
 * The success rate is the B15-1 measurement (finished builds, last 7 days) and always carries its N.
 */
import { buildStepStatuses } from "@/lib/builder/build-step-status";
import { jobLiveness } from "@/lib/builder/job-liveness";
import type { CityMetrics } from "@/lib/ai-city-metrics";

export type Tier = "sol" | "terra" | "luna";
export const TIER_LABEL: Record<Tier, string> = { sol: "Sol", terra: "Terra", luna: "Luna" };

export type LaneJob = {
  id: string;
  organization_id: string;
  status: string;
  current_step: string | null;
  failed_stage: string | null;
  failure_kind: string | null;
  wait_reason: string | null;
  resumes_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
  lease_expires_at: string | null;
  attempts: number | null;
  stage_checkpoints: unknown;
};

export type TraceRow = { organization_id: string | null; model: string | null; stage: string; created_at: string };

export type Handoff = { tier: Tier; stage: string; at: string };

export type Lane = {
  jobId: string;
  organizationId: string;
  name: string | null;
  status: string;
  stalled: boolean;
  stage: { key: string; label: string; number: number; total: number } | null;
  /** Milliseconds since start (or since queued); null when the row has no usable time. */
  elapsedMs: number | null;
  elapsedFrom: "started" | "queued";
  waitReason: string | null;
  resumesAt: string | null;
  attempts: number | null;
  failureKind: string | null;
  handoffs: Handoff[];
  /** Recorded calls in this job's window whose model is not a configured Sol/Terra/Luna model. */
  otherCalls: number;
  retry: { step: string; label: string; checkpoints: string[] } | null;
};

export type PipelineLanes = {
  checkedAt: string;
  jobsAvailable: boolean;
  traceAvailable: boolean;
  lanes: Lane[];
  success: CityMetrics["success"];
};

export const ACTIVE_STATUSES = ["queued", "processing", "waiting", "retrying", "parked", "failed"] as const;

const time = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

const checkpointKeys = (v: unknown): string[] => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v as object) : []);

/** Tier changes in time order. Consecutive calls by the same tier collapse into one marker. */
export function handoffsFor(rows: readonly TraceRow[], tierOfModel: (model: string) => Tier | null): { handoffs: Handoff[]; otherCalls: number } {
  const handoffs: Handoff[] = [];
  let otherCalls = 0;
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const tier = r.model ? tierOfModel(r.model) : null;
    if (!tier) { otherCalls++; continue; }
    if (handoffs[handoffs.length - 1]?.tier !== tier) handoffs.push({ tier, stage: r.stage, at: r.created_at });
  }
  return { handoffs: handoffs.slice(-8), otherCalls };
}

export function buildLanes(input: {
  jobs: LaneJob[] | null;
  names: Map<string, string> | null;
  trace: TraceRow[] | null;
  steps: readonly { key: string; label: string }[];
  tierOfModel: (model: string) => Tier | null;
  success: CityMetrics["success"];
  now: number;
}): PipelineLanes {
  const keys = input.steps.map((s) => s.key);
  const labelOf = (key: string) => input.steps.find((s) => s.key === key)?.label ?? key;
  const lanes: Lane[] = (input.jobs ?? []).map((job) => {
    const saved = checkpointKeys(job.stage_checkpoints);
    const view = buildStepStatuses(keys, { status: job.status, currentStep: job.current_step, failedStage: job.failed_stage, checkpointKeys: saved });
    const current = view.steps.find((s) => s.status === "running" || s.status === "failed" || s.status === "waiting")
      ?? (job.status === "queued" ? null : view.steps.find((s) => s.status === "pending") ?? null);
    const index = current ? keys.indexOf(current.key) : -1;
    const started = time(job.started_at);
    const from = started ?? time(job.created_at);
    const windowStart = from ?? input.now;
    const windowEnd = job.status === "failed" || job.status === "parked" ? (time(job.updated_at) ?? input.now) : input.now;
    const traceRows = (input.trace ?? []).filter((r) => r.organization_id === job.organization_id && (time(r.created_at) ?? -1) >= windowStart && (time(r.created_at) ?? Infinity) <= windowEnd);
    const { handoffs, otherCalls } = handoffsFor(traceRows, input.tierOfModel);
    const stopped = job.status === "failed" || job.status === "parked";
    const retryStep = stopped && view.resumable ? view.failedStep : null;
    return {
      jobId: job.id,
      organizationId: job.organization_id,
      name: input.names?.get(job.organization_id) ?? null,
      status: job.status,
      stalled: jobLiveness(job, input.now) === "stalled",
      stage: current && index >= 0 ? { key: current.key, label: labelOf(current.key), number: index + 1, total: keys.length } : null,
      elapsedMs: from === null ? null : Math.max(0, (stopped ? windowEnd : input.now) - from),
      elapsedFrom: started === null ? "queued" : "started",
      waitReason: job.wait_reason?.trim() ? job.wait_reason.trim().slice(0, 200) : null,
      resumesAt: job.resumes_at,
      attempts: typeof job.attempts === "number" ? job.attempts : null,
      failureKind: job.failure_kind,
      handoffs,
      otherCalls,
      retry: retryStep ? { step: retryStep, label: labelOf(retryStep), checkpoints: saved.slice(0, 12) } : null,
    };
  });
  return { checkedAt: new Date(input.now).toISOString(), jobsAvailable: Array.isArray(input.jobs), traceAvailable: Array.isArray(input.trace), lanes, success: input.success };
}

export function elapsedLabel(ms: number | null): string {
  if (ms === null) return "time not recorded";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "under 1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

/** A Jarvis mission draft for retrying from the saved steps. Nothing runs until the owner sends it and approves the build. */
export function retryDraft(lane: Lane): string {
  if (!lane.retry) return "";
  return `[AI City · Retry build] Workspace ${lane.organizationId}, build ${lane.jobId} stopped at "${lane.retry.label}" (step ${lane.retry.step}). `
    + `Saved checkpoints: ${lane.retry.checkpoints.join(", ") || "none"}. Check why it stopped, then propose a retry from the saved steps; `
    + `do not start a paid build without my explicit approval.`;
}
