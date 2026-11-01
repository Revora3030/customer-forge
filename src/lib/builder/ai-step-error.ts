/**
 * Raised when an AI design step could not produce its part of a website.
 *
 * Revora never substitutes a non-AI baseline (stock brand, default layouts or a
 * generic menu) for work the AI team produced and the checks refused. The build
 * job is retried automatically; when every attempt fails the owner is told
 * plainly to try again, and nothing half-designed is shipped.
 *
 * One exception (owner decision 2026-11-01): when the AI team is out of
 * capacity or credits after the retries, required section layouts and the
 * required wording ship as a facts-only version built from the owner's saved
 * details (fallback-sections.ts, copy-scaffold.ts), and the site is flagged
 * for an AI upgrade that runs only with the owner's OK.
 */
export class AiStepUnavailableError extends Error {
  readonly step: string;
  constructor(step: string, detail?: string | null) {
    super(
      `The AI design team couldn't finish the ${step} right now${
        detail ? ` (${String(detail).slice(0, 160)})` : ""
      }. Nothing basic was shipped in its place — please try the build again in a few minutes.`,
    );
    this.name = "AiStepUnavailableError";
    this.step = step;
  }
}

/**
 * An AI step ran out of capacity (rate limits, quotas, timeouts, rescue
 * deadline). The job is parked through the capacity deferral and resumes from
 * its checkpoints; it is not counted as a failed attempt.
 */
export class AiCapacityParkError extends AiStepUnavailableError {
  constructor(step: string, detail?: string | null) {
    super(step, detail);
    this.name = "AiCapacityParkError";
  }
}
