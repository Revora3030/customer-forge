/**
 * Small grammar helpers for copy that is built from data (industry names,
 * competitor names). They exist so templates never print "a auto detailing",
 * "a HVAC" or "when diy website builder is the better choice".
 */

/** Lower-case a phrase for use mid-sentence, keeping acronyms (HVAC, DIY, EV) upper-case. */
export function lowerPhrase(phrase: string): string {
  return phrase
    .split(/(\s+)/)
    .map((word) => (/^[A-Z][A-Z0-9&/]+$/.test(word) ? word : word.toLowerCase()))
    .join("");
}

// Letters whose spoken name starts with a vowel sound: A, E, F, H, I, L, M, N, O, R, S, X.
const VOWEL_SOUND_LETTERS = /^[AEFHILMNORSX]/;

/** "a" or "an" for the phrase that follows, by how its first word is pronounced. */
export function articleFor(phrase: string): "a" | "an" {
  const word = phrase.trim().split(/\s+/)[0] ?? "";
  if (!word) return "a";
  // Acronyms are read letter by letter: an HVAC, an RV, an EV, a DIY, a CRM.
  if (/^[A-Z0-9]{2,}$/.test(word)) return VOWEL_SOUND_LETTERS.test(word) ? "an" : "a";
  const lower = word.toLowerCase();
  if (/^(hour|honest|honou?r|heir)/.test(lower)) return "an";
  if (/^(uni|use|usu|uti|eu|one|once)/.test(lower)) return "a";
  return /^[aeiou]/.test(lower) ? "an" : "a";
}

/** "an HVAC", "an auto detailing", "a plumbing": the phrase with the right article, lower-cased but acronym-safe. */
export function withArticle(phrase: string): string {
  const text = lowerPhrase(phrase.trim());
  return `${articleFor(text)} ${text}`;
}
