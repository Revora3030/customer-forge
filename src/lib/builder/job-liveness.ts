/**
 * Build-job liveness rules, shared by the worker, the chat agent and the UI.
 *
 * A `processing` job is only "alive" while its worker keeps the lease pushed
 * forward. When a worker is cut off at the platform boundary, the row keeps
 * `status = processing` with a lease in the past. Without a shared definition
 * of "dead", the chat agent kept deferring every request ("your AI team is
 * finishing the first website now") and the UI kept showing "Finishing your
 * first website..." forever.
 *
 * Pure and dependency-free so it can run in the browser, on the server, and in
 * unit tests.
 */

/** Grace period after a lease lapses before the job is considered stalled. */
export const STALLED_LEASE_GRACE_MS = 60_000;

export type JobLivenessRow = {
  status?: string | null;
  lease_expires_at?: string | null;
  updated_at?: string | null;
};

export type JobLiveness = "idle" | "queued" | "running" | "stalled";

/**
 * Classifies a job row.
 *  - `running`: processing with a live lease (or one that lapsed less than the
 *    grace period ago — a heartbeat may simply be in flight).
 *  - `stalled`: processing whose lease lapsed more than the grace period ago
 *    AND whose row has not been touched in that window either.
 *  - `queued`: waiting for a worker.
 *  - `idle`: anything terminal or no job at all.
 */
export function jobLiveness(
  job: JobLivenessRow | null | undefined,
  now = Date.now(),
  graceMs = STALLED_LEASE_GRACE_MS,
): JobLiveness {
  if (!job?.status) return "idle";
  if (job.status === "queued") return "queued";
  if (job.status !== "processing") return "idle";
  const lease = job.lease_expires_at ? Date.parse(job.lease_expires_at) : Number.NaN;
  const touched = job.updated_at ? Date.parse(job.updated_at) : Number.NaN;
  // A processing row with no lease at all is a write we cannot reason about;
  // fall back to the last update time so it can still be recovered.
  const lastSign = Math.max(
    Number.isFinite(lease) ? lease : Number.NEGATIVE_INFINITY,
    Number.isFinite(touched) ? touched : Number.NEGATIVE_INFINITY,
  );
  if (!Number.isFinite(lastSign)) return "stalled";
  return now - lastSign > graceMs ? "stalled" : "running";
}

/** True when a job is actually being worked on (or about to be). */
export function jobIsActive(job: JobLivenessRow | null | undefined, now = Date.now()): boolean {
  const state = jobLiveness(job, now);
  return state === "queued" || state === "running";
}

/** Plain message shown to an owner whose build was interrupted. */
export const INTERRUPTED_BUILD_MESSAGE =
  "The build was interrupted and could not finish. Press Build to try again.";

/** Plain message shown while an interrupted build is being retried. */
export const RECOVERING_BUILD_MESSAGE =
  "The build worker was interrupted, so Revora is restarting your build from where it left off.";
