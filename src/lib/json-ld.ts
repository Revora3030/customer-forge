/**
 * JSON that is safe to place inside a <script> tag: "</script>" and HTML
 * comment openers in owner-supplied text can no longer close the tag early,
 * and U+2028/U+2029 can no longer break the script on older parsers.
 */
export function safeJsonLd(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") return "{}";
  return serialized
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
