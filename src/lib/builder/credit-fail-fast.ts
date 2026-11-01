/**
 * Whether a failed build attempt ran out of AI CREDITS (402 / "out of
 * credits"), as opposed to being rate-limited, slow, or at today's paid cap.
 *
 * Credits don't come back on a timer: they come back when someone tops them
 * up. So a credits failure is not parked for 15 min .. 3 h and re-run up to
 * six times (each wake-up sending dozens of AI calls that all answer 402):
 * the job fails now, tagged [credits], with the owner message that says so.
 * Finished sections stay checkpointed, so Retry build resumes after a top-up.
 *
 * Today's paid cap (`paid_daily_cap_reached`) is NOT credits: it resets at a
 * known time, so it keeps the existing wait-and-retry path.
 *
 * Pure (no I/O) so it is unit-tested.
 */
import { aiCauseFromCalls, type AiCallOutcome } from "@/lib/builder/ai-cause";

export const DAILY_CAP_DETAIL = "paid_daily_cap_reached";

export function creditsExhaustedForAttempt(input: {
  /** HTTP-like status of the error that ended the attempt (0 when none). */
  status: number;
  /** classifyBuildFailure(...).kind */
  failureKind: string;
  /** RevoraAiError.detail of the error that ended the attempt, if any. */
  errorDetail?: string | null;
  /** This attempt's AI calls (ai_usage_events since the attempt started). */
  calls: readonly AiCallOutcome[];
}): boolean {
  if (input.errorDetail === DAILY_CAP_DETAIL) return false;
  if (input.failureKind === "intake_validation") return false;
  if (input.status === 402 || input.failureKind === "credits") return true;
  return aiCauseFromCalls(input.calls) === "credits";
}

/** One structured, secret-free log line for a build that stopped on credits. */
export function creditsFailLine(fields: { jobId: string; attempt: number; source: "attempt" | "cutoff" }): string {
  return `[site-engine] ${JSON.stringify({ event: "build_failed_credits", ...fields })}`;
}
