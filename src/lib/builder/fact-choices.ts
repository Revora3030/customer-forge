/**
 * COMP-13: tap-to-answer choices for a missing fact in the builder chat.
 *
 * A choice is only offered when it is built from something the owner already
 * told us (for now: their city), so tapping it is the owner's own answer, not
 * a guess. Facts with no honest choices (phone, email, hours…) get none and are
 * typed as before. "Skip for now" stays: a skipped fact is left off the site.
 */
export const MAX_FACT_CHOICES = 3;

export type FactChoiceContext = { city?: string | null | undefined };

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

export function factChoices(gapKey: string, context: FactChoiceContext): string[] {
  const city = clean(context.city);
  if (gapKey === "service_area" && city) {
    return [`${city} only`, `${city} and nearby towns`, `Within 25 miles of ${city}`].slice(0, MAX_FACT_CHOICES);
  }
  return [];
}
