/**
 * Answering one of Revora's "missing fact" questions in the builder chat.
 *
 * The chat used to clear the box, show "Saving your answer…", and on any
 * failure quietly put the text back — so the owner saw their phone number
 * vanish and reappear with no word of what happened. Every attempt now ends in
 * exactly one visible outcome: saved, or a plain error the chat shows inline.
 */
import { friendlyError } from "@/lib/user-error";

export type FactAnswerOutcome =
  | { ok: true; answer: string }
  | { ok: false; answer: string; message: string };

export const FACT_SAVE_FALLBACK = "Couldn't save your answer. Please try again.";

/** Safe, human copy for a failed save (never a raw stack or SQL error). */
export function factSaveErrorMessage(error: unknown): string {
  return friendlyError(error, FACT_SAVE_FALLBACK);
}

/** Runs one save and reports how it ended; it never throws. */
export async function submitFactAnswer(
  answer: string,
  save: (answer: string) => Promise<unknown>,
): Promise<FactAnswerOutcome> {
  const trimmed = answer.trim();
  if (!trimmed) return { ok: false, answer, message: "Type your answer first." };
  try {
    await save(trimmed);
    return { ok: true, answer: trimmed };
  } catch (error) {
    return { ok: false, answer: trimmed, message: factSaveErrorMessage(error) };
  }
}
