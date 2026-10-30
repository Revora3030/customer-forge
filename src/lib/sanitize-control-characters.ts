/**
 * Replace ASCII control characters in untrusted text before it is used as a
 * search query. Keep this as a character-code loop so static security tooling
 * does not mistake the sanitiser's intentional control-character filter for
 * a dangerous regular expression.
 */
export function replaceControlCharacters(value: string, replacement = " "): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code < 0x20 || code === 0x7f ? replacement : char;
  }
  return out;
}
