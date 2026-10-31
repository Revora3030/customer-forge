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
  "The build worker was interrupted, so Revora is picking your build back up automatically.";

/** How many attempts the worker gives one build (mirrors MAX_ATTEMPTS in the site-engine worker). */
export const MAX_BUILD_ATTEMPTS = 3;

/** How long a build may sit queued, with nothing picking it up, before the chat stops waiting on it. */
export const QUEUED_PICKUP_TIMEOUT_MS = 10 * 60_000;

export type JobRetryRow = JobLivenessRow & {
  attempts?: number | null;
  created_at?: string | null;
  started_at?: string | null;
  current_step?: string | null;
  error_message?: string | null;
  failure_kind?: string | null;
};

/**
 * A queued job that a worker has already run is waiting for its RETRY (or for
 * the next slice of one long build), not waiting to start. After a failed
 * attempt the row goes back to "queued" with its original `created_at`, so
 * "queued for N minutes" measured from creation said "your build hasn't
 * started yet" about a build that had been running for eleven of those
 * minutes.
 */
export function isRetryWait(job: JobRetryRow | null | undefined): boolean {
  if (job?.status !== "queued") return false;
  return (
    Number(job.attempts ?? 0) > 0 ||
    Boolean(job.started_at) ||
    Boolean(job.current_step) ||
    Boolean(job.error_message) ||
    Boolean(job.failure_kind)
  );
}

/** Why the chat should stop waiting on a build, or null while it should keep watching. */
export type StopWaiting = "never_started" | "retry_overdue" | "stalled";

/**
 * The one rule for "stop watching this build". A running job stops when its
 * lease has lapsed. A job that never started stops after the pickup timeout,
 * counted from its creation. A job waiting to retry is counted from the moment
 * the retry became due (its lease is the retry-not-before time, so a build
 * parked for AI capacity is not abandoned early), never from creation.
 */
export function stopWaiting(job: JobRetryRow | null | undefined, now = Date.now()): StopWaiting | null {
  if (!job?.status) return null;
  if (job.status === "processing") return jobLiveness(job, now) === "stalled" ? "stalled" : null;
  if (job.status !== "queued") return null;
  const created = job.created_at ? Date.parse(job.created_at) : Number.NaN;
  if (!isRetryWait(job)) {
    return Number.isFinite(created) && now - created > QUEUED_PICKUP_TIMEOUT_MS ? "never_started" : null;
  }
  const dueAt = job.lease_expires_at ? Date.parse(job.lease_expires_at) : Number.NaN;
  const touched = job.updated_at ? Date.parse(job.updated_at) : Number.NaN;
  const since = Math.max(Number.isFinite(dueAt) ? dueAt : Number.NEGATIVE_INFINITY, Number.isFinite(touched) ? touched : Number.NEGATIVE_INFINITY);
  return Number.isFinite(since) && now - since > QUEUED_PICKUP_TIMEOUT_MS ? "retry_overdue" : null;
}

/** What the chat says when it stops waiting. Nothing is claimed about how the build ended. */
export function stopWaitingMessage(reason: StopWaiting): string {
  switch (reason) {
    case "never_started":
      return "Your build hasn't started yet, so I've stopped waiting on it here. Nothing was published — check the preview in a few minutes, or start the build again.";
    case "retry_overdue":
      return "Your build ran into a problem and was waiting to try again, but it hasn't resumed, so I've stopped waiting on it here. Nothing was published — check the preview in a few minutes, or start the build again.";
    case "stalled":
      return "Your build stopped responding, so I've stopped waiting on it here. Nothing was published — check the preview in a minute, or start the build again.";
  }
}

/** A failed build blocks an automatic restart for this long. */
export const AUTO_BUILD_COOLDOWN_AFTER_FAILURE_MS = 24 * 60 * 60_000;

/**
 * Whether the builder must NOT start a build on its own. A build that is queued
 * or running is already in hand; one the owner stopped stays stopped; and one
 * that failed in the last day is not silently re-queued each time the page is
 * opened, which is how an empty workspace with a failing build would keep
 * spending (a full build is a dollar or more) without anyone asking. The
 * server has already tried the build up to three times, and the owner can
 * start it again by hand with one message. An old failure (a new day, a
 * recovered provider) allows one fresh automatic start.
 */
export function blocksAutoBuild(
  job: (JobRetryRow & { completed_at?: string | null }) | null | undefined,
  now = Date.now(),
): boolean {
  const status = job?.status ?? "";
  if (status === "queued" || status === "processing" || status === "cancelled") return true;
  if (status !== "failed") return false;
  const ended = Date.parse(job?.completed_at ?? job?.updated_at ?? job?.created_at ?? "");
  // A failure with no usable time is treated as recent: never guess toward spending.
  if (!Number.isFinite(ended)) return true;
  return now - ended < AUTO_BUILD_COOLDOWN_AFTER_FAILURE_MS;
}

/** A queued job untouched this long, with nothing waiting on it, is a leftover from a failed attempt. */
export const STALE_QUEUED_AFTER_MS = 30 * 60_000;

/** The message written when a leftover queued job is cleared for a new build request. */
export const STALE_QUEUED_CLEARED_MESSAGE = "Stale job cleared for new build request";

type StaleQueuedRow = {
  status?: string | null;
  updated_at?: string | null;
  lease_expires_at?: string | null;
  resumes_at?: string | null;
};

/**
 * True when a queued row is a leftover that a new build request may clear.
 *
 * A build parked for AI capacity is queued on purpose: the deferral path sets
 * `lease_expires_at` and `resumes_at` to the retry time, which can be well past
 * the 30 minutes a row may sit untouched. It is waiting, not stale, until that
 * retry time itself has been overdue for the whole stale window. (A fresh or
 * normally retrying job has an empty lease and an empty resume time.)
 */
export function isStaleQueuedJob(job: StaleQueuedRow, now = Date.now()): boolean {
  if (job.status !== "queued") return false;
  const cutoff = now - STALE_QUEUED_AFTER_MS;
  const updated = Date.parse(job.updated_at ?? "");
  if (!Number.isFinite(updated) || updated >= cutoff) return false;
  for (const parkedUntil of [job.resumes_at, job.lease_expires_at]) {
    if (!parkedUntil) continue;
    const at = Date.parse(parkedUntil);
    if (Number.isFinite(at) && at >= cutoff) return false;
  }
  return true;
}

/**
 * PostgREST `or()` filters that keep capacity-parked jobs out of the stale
 * clear. Apply every entry with `.or(...)`; together they mirror isStaleQueuedJob.
 */
export function staleQueuedGuardFilters(now = Date.now()): string[] {
  const cutoff = new Date(now - STALE_QUEUED_AFTER_MS).toISOString();
  return [`resumes_at.is.null,resumes_at.lt.${cutoff}`, `lease_expires_at.is.null,lease_expires_at.lt.${cutoff}`];
}

/** The row update that closes a stale queued job: failed, tagged infrastructure, with no lease left behind. */
export function staleQueuedClearUpdate(nowIso: string): {
  status: "failed";
  error_message: string;
  failure_kind: "infrastructure";
  completed_at: string;
  lease_expires_at: null;
} {
  return {
    status: "failed",
    // Same "[kind] message" tag the worker writes, so the owner and admin views classify it.
    error_message: `[infrastructure] ${STALE_QUEUED_CLEARED_MESSAGE}`,
    failure_kind: "infrastructure",
    completed_at: nowIso,
    lease_expires_at: null,
  };
}
