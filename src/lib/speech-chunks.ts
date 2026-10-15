/**
 * Splits a reply into short spoken chunks so Jarvis starts talking after the
 * first sentence instead of waiting for the whole reply to be synthesized.
 * The first chunk is kept short for a fast start; the total is capped so one
 * reply can't spend much voice credit.
 */
export const MAX_SPOKEN_CHARS = 1200;

export function splitSpeech(text: string, firstMax = 160, restMax = 420): string[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_SPOKEN_CHARS);
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const limit = () => (chunks.length === 0 ? firstMax : restMax);
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > limit()) {
      // A very long sentence is split at commas, then words.
      push();
      let rest = sentence.trim();
      while (rest.length > limit()) {
        const max = limit();
        const cut = Math.max(rest.lastIndexOf(", ", max), rest.lastIndexOf(" ", max));
        const at = cut > max / 2 ? cut + 1 : max;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      current = rest ? `${rest} ` : "";
      continue;
    }
    if ((current + sentence).length > limit()) push();
    current += sentence;
  }
  push();
  return chunks;
}
