/**
 * Spoken-reply brevity for Jarvis (Lovable round 10, item 2).
 *
 * When the owner is listening (Live mode, or the voice toggle is on), the
 * whole reply is read aloud through the existing ladder: ElevenLabs when its key is
 * set, then Lovable Gateway speech, then the browser's speechSynthesis. Long
 * replies are slow and costly to speak, so voice turns ask Jarvis for a short
 * spoken answer and to offer details in the chat instead. Browser-safe: no server
 * imports.
 */

/** Most words in the spoken core of a voice reply. */
export const VOICE_REPLY_MAX_WORDS = 25;

export const VOICE_BREVITY_RULE =
  `VOICE TURN: the owner is listening and this reply is read aloud. Keep the whole reply to ${VOICE_REPLY_MAX_WORDS} words or fewer: ` +
  "plain spoken sentences, bottom line first, no lists, tables, links, URLs or markdown. " +
  "Leave supporting data (number lists, steps, drafts, code) out of the spoken answer; offer to put it in the chat, e.g. end with \"Want the details in chat?\". " +
  "Action blocks and follow-up tags are unaffected.";

/** System-prompt lines to add for this turn: the brevity rule only on voice turns. */
export function voiceBrevityLines(voice: boolean): string[] {
  return voice ? [VOICE_BREVITY_RULE] : [];
}

/** Only an explicit `true` makes a turn a voice turn. */
export function parseVoiceFlag(value: unknown): boolean {
  return value === true;
}

/** Words in `text`, counting runs of non-space characters. */
export function countSpokenWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
