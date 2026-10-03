/**
 * Raised when an AI design step could not produce its part of a website.
 *
 * Revora never substitutes a non-AI baseline (stock brand, fact-scaffold copy,
 * default layouts or a generic menu) for the AI team's work. The build job is
 * retried automatically; when every attempt fails the owner is told plainly to
 * try again, and nothing half-designed is shipped.
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
