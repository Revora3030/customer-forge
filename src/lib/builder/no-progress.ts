/**
 * NO-PROGRESS GUARD FOR THE BUILD PIPELINE.
 *
 * A build must never sit at a percentage forever. The lease heartbeat keeps a
 * running job "alive" on its own, so a hung AI call (or a provider that is out
 * of credits and answers nothing) used to look healthy until the platform
 * killed the request, and the owner saw a frozen bar and then nothing.
 *
 * "Progress" is any of: a stage finishing, a section checkpoint being saved,
 * or an AI model answering. When none of those happens for the limit below the
 * attempt is failed with a plain owner message and its checkpoints are kept,
 * so pressing Build again resumes instead of starting over.
 *
 * Everything here is pure (no database, no timers) so it is unit-tested.
 */

import { AI_CAUSE_OWNER_MESSAGE, type AiCause } from "./ai-cause";

/** No stage, section or model answer for this long = the step is stuck. */
export const NO_PROGRESS_LIMIT_MS = 4 * 60_000;
/** How often the server watchdog and the owner's browser re-check. */
export const NO_PROGRESS_CHECK_MS = 15_000;
/** The owner's browser calls a running build stalled when nothing moved this long. */
export const CLIENT_STALL_AFTER_MS = 5 * 60_000;
/** The owner's draft page stops waiting for the site after this long. */
export const DRAFT_LOAD_TIMEOUT_MS = 20_000;

/** Older wording (still recognised on stored rows). */
export const STALL_MESSAGE_BUSY = "AI service out of credits or busy, try again shortly.";
export const STALL_MESSAGE_GENERIC =
  "This build stopped making progress and was ended safely. Nothing was published, and your finished sections were kept. Press Build again to continue.";

/** True for the stored message of a build ended by the no-progress guard. */
export function isStallMessage(message: string | null | undefined): boolean {
  const text = (message ?? "").replace(/^\[[a-z_]+\]\s*/, "").trim();
  return (
    text === STALL_MESSAGE_BUSY ||
    text === STALL_MESSAGE_GENERIC ||
    (Object.values(AI_CAUSE_OWNER_MESSAGE) as string[]).includes(text)
  );
}

export class NoProgressError extends Error {
  readonly busy: boolean;
  readonly idleMs: number;
  /** Why the AI team went quiet (402 credits, 429 rate limit, timeout), when known. */
  readonly aiCause: AiCause | null;
  /** `cause` may be `true` for "the AI was busy, reason unknown" (older callers). */
  constructor(readonly stage: string | null, idleMs: number, cause: AiCause | boolean | null) {
    super(typeof cause === "string" ? AI_CAUSE_OWNER_MESSAGE[cause] : cause ? STALL_MESSAGE_BUSY : STALL_MESSAGE_GENERIC);
    this.name = "NoProgressError";
    this.aiCause = typeof cause === "string" ? cause : null;
    this.busy = Boolean(cause);
    this.idleMs = idleMs;
  }
}

export type ProgressWatch = {
  /** Record that something moved (stage done, section saved, model answered). */
  touch: (stage?: string | null) => void;
  idleMs: (now?: number) => number;
  stalled: (now?: number) => boolean;
  stage: () => string | null;
};

export function createProgressWatch(limitMs = NO_PROGRESS_LIMIT_MS, now = Date.now()): ProgressWatch {
  let last = now;
  let stage: string | null = null;
  return {
    touch: (next) => {
      last = Date.now();
      if (next !== undefined) stage = next;
    },
    idleMs: (at = Date.now()) => Math.max(0, at - last),
    stalled: (at = Date.now()) => at - last >= limitMs,
    stage: () => stage,
  };
}

/**
 * Did the AI gateway answer "out of credits" (402) or "slow down" (429) or time
 * out during the attempt? Decides which owner message the stall gets.
 */
export function aiPressureSeen(calls: { ok: boolean | null; error_category: string | null }[]): boolean {
  return calls.some((call) => call.ok === false && ["rate_limited", "quota", "timeout"].includes(call.error_category ?? ""));
}

/**
 * Runs `work`, but rejects with NoProgressError when the watch stops moving.
 * `onStall` runs first (abort the AI calls) and may report whether the AI
 * service was busy; the work promise is left to unwind on its own abort.
 */
export async function runWithNoProgressGuard<T>(
  work: () => Promise<T>,
  watch: ProgressWatch,
  options: {
    checkEveryMs?: number;
    onStall?: () => Promise<AiCause | boolean | null> | AiCause | boolean | null;
  } = {},
): Promise<T> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stall = new Promise<never>((_, reject) => {
    let firing = false;
    timer = setInterval(() => {
      if (firing || !watch.stalled()) return;
      firing = true;
      void (async () => {
        let busy: AiCause | boolean | null = false;
        try {
          busy = (await options.onStall?.()) ?? false;
        } catch {
          /* the message just falls back to the generic wording */
        }
        reject(new NoProgressError(watch.stage(), watch.idleMs(), busy));
      })();
    }, options.checkEveryMs ?? NO_PROGRESS_CHECK_MS);
    (timer as { unref?: () => void }).unref?.();
  });
  const guarded = work();
  // The losing promise must never surface as an unhandled rejection.
  guarded.catch(() => undefined);
  stall.catch(() => undefined);
  try {
    return await Promise.race([guarded, stall]);
  } finally {
    if (timer) clearInterval(timer);
  }
}

/**
 * Copies a stalled job's finished work onto its retry. Checkpoints are bound to
 * their job id, so the copy is re-stamped; each entry is still only reused when
 * its input digest matches, so changed inputs regenerate instead of reusing.
 */
export function carryOverCheckpoints<T>(raw: T, newJobId: string): T | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { ...(raw as Record<string, unknown>), jobId: newJobId } as T;
}

/** A client-side verdict on a running build from the timestamps it can see. */
export function clientStallVerdict(
  job: { status?: string | null; updated_at?: string | null; lease_expires_at?: string | null } | null | undefined,
  now = Date.now(),
  afterMs = CLIENT_STALL_AFTER_MS,
): boolean {
  if (!job || job.status !== "processing") return false;
  const updated = Date.parse(job.updated_at ?? "");
  return Number.isFinite(updated) && now - updated >= afterMs;
}

const watches = new Map<string, ProgressWatch>();
/** Registers the running attempt's watch so saves elsewhere can mark progress. */
export function registerProgressWatch(jobId: string, watch: ProgressWatch | null): void {
  if (watch) watches.set(String(jobId), watch);
  else watches.delete(String(jobId));
}
/** A stage or section checkpoint was saved, or a stage finished, for this job. */
export function noteProgress(jobId: string, stage?: string | null): void {
  watches.get(String(jobId))?.touch(stage);
}

export class LoadTimeoutError extends Error {
  constructor(message = "This took too long to load.") {
    super(message);
    this.name = "LoadTimeoutError";
  }
}

/** Rejects with LoadTimeoutError when `work` has not settled in `ms` (never hangs forever). */
export function withTimeout<T>(work: Promise<T>, ms = DRAFT_LOAD_TIMEOUT_MS, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LoadTimeoutError(message)), ms); // DevSkim: ignore DS172411 -- Fixed callback and caller-supplied numeric delay; no untrusted data.
  });
  work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
