/**
 * CU-6 / JC-44: two or three next-step chips under the latest finished reply.
 *
 * Pure: every chip comes from the stored outcome of that request (its open
 * requirements, the changes it applied and where they landed) or from what the
 * builder can really do next. Nothing is guessed, no number is invented, and a
 * chip never sends anything on its own: follow-ups only fill the composer.
 */
export type NextStepAction =
  | { kind: "follow-up"; prompt: string }
  | { kind: "lead-test" }
  | { kind: "history" }
  | { kind: "preview" };

export type NextStepChip = { id: string; label: string; reason: string; action: NextStepAction };

export type NextStepFacts = {
  state: string;
  instruction: string;
  applied: number;
  requirements: readonly { label: string; covered: boolean }[];
  /** Titles and locations of the changes that were applied. */
  changed: readonly string[];
  /** Questions Revora asked back: those already have their own buttons. */
  questionCount: number;
  canLeadTest: boolean;
  canOpenHistory: boolean;
  canShowPreview: boolean;
};

export const NEXT_STEP_LIMIT = 3;

const LEAD_PATH = /\b(form|contact|quote|estimate|booking|book|appointment|call ?back|lead|request)s?\b/i;

const short = (value: string, max = 40) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export function nextStepChips(facts: NextStepFacts): NextStepChip[] {
  // Only after a finished request that is not waiting on the owner already.
  if (facts.state !== "complete" || facts.questionCount > 0) return [];
  const chips: NextStepChip[] = [];

  // 1. Parts of the request the result says are still open.
  for (const requirement of facts.requirements.filter((r) => !r.covered).slice(0, 2)) {
    chips.push({
      id: `open:${requirement.label}`,
      label: `Finish: ${short(requirement.label)}`,
      reason: "Your last request listed this as still open.",
      action: {
        kind: "follow-up",
        prompt: `Finish the part of my request “${facts.instruction}” that is still open: ${requirement.label}. Plan it against my site as it is now and don't invent facts.`,
      },
    });
  }

  if (facts.applied > 0) {
    // 2. The change touched how visitors reach the business: prove it works.
    if (facts.canLeadTest && facts.changed.some((line) => LEAD_PATH.test(line))) {
      chips.push({
        id: "lead-test",
        label: "Send a test lead",
        reason: "This change touched how visitors contact you. A labelled test lead checks it end to end.",
        action: { kind: "lead-test" },
      });
    }
    // 3. See it where most visitors will: on a phone (the Preview tab).
    if (facts.canShowPreview) {
      chips.push({
        id: "preview",
        label: "See it on the preview",
        reason: "Open the preview with this change applied.",
        action: { kind: "preview" },
      });
    }
    // 4. Compare before and after (History holds the saved version).
    if (facts.canOpenHistory) {
      chips.push({
        id: "history",
        label: "Compare before and after",
        reason: "History keeps the version from before this change, so you can compare or restore it.",
        action: { kind: "history" },
      });
    }
  }

  return chips.slice(0, NEXT_STEP_LIMIT);
}
