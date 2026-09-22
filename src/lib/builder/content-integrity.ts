/**
 * CONTENT INTEGRITY — A HARD GATE, NOT A WARNING.
 *
 * A generated site that shows "Wieueueu", lorem ipsum, a 555 phone number or an
 * empty heading is a failed build, not a published website. This module decides
 * that, and it decides it the same way everywhere: on the business facts before
 * generation, and on the finished copy before materialization and before
 * publishing.
 *
 * It only ever REJECTS. It never invents a replacement fact, never substitutes
 * canned copy and never silently rewrites the AI's words — the build stops and
 * asks for the real information instead.
 *
 * Pure module: no environment, no network, no secrets.
 */

export type IntegrityViolation = {
  field: string;
  value: string;
  kind:
    | "gibberish"
    | "lorem_ipsum"
    | "placeholder_token"
    | "fake_phone"
    | "fake_address"
    | "fixture_data"
    | "empty_heading"
    | "duplicated_filler";
  /** Plain-language explanation shown to the business owner. */
  detail: string;
};

const LOREM = /\b(lorem\s+ipsum|dolor\s+sit\s+amet|consectetur\s+adipiscing)\b/i;

const PLACEHOLDER_TOKENS = [
  "your business name",
  "your company",
  "business name here",
  "insert text",
  "placeholder",
  "coming soon text",
  "tbd",
  "to be determined",
  "todo",
  "xxx",
  "xxxx",
  "asdf",
  "qwerty",
  "test test",
  "sample text",
  "dummy text",
  "n/a n/a",
];

const FIXTURE_PATTERNS = [
  /\bexample\.(com|org|net)\b/i,
  /\btest@(test|example)\.[a-z]+\b/i,
  /\bacme\s+(inc|corp|co)\b/i,
  /\bjohn\s+doe\b/i,
  /\bjane\s+doe\b/i,
  /\bfoo\s*bar\b/i,
];

const FAKE_ADDRESSES = [/\b123\s+main\s+st/i, /\b1\s+infinite\s+loop/i, /\b123\s+fake\s+st/i];

/**
 * Nonsense typing detection, deliberately conservative so real words, brand
 * names and non-English business names survive.
 *
 * A value is nonsense when it is a single alphabetic token that repeats a short
 * syllable ("wieueueu", "ueueueu", "ababab"), is a long vowel-only or
 * consonant-only run, or repeats one character many times.
 */
export function looksLikeGibberish(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (value.length < 5) return false;
  if (/\s/.test(value)) return false;
  if (!/^[a-z]+$/.test(value)) return false;
  if (/^([a-z])\1{3,}$/.test(value)) return true;
  if (/^[aeiou]{5,}$/.test(value)) return true;
  if (/^[^aeiou]{5,}$/.test(value)) return true;
  for (let size = 2; size <= 3; size += 1) {
    const unit = value.slice(0, size);
    // A syllable repeated to fill the word, with an optional partial tail.
    const repeated = unit.repeat(Math.ceil(value.length / size)).slice(0, value.length);
    if (value === repeated) return true;
  }
  // "wieueueu": a trailing syllable repeated at least twice after a short stem.
  if (/^[a-z]{1,4}?([a-z]{2})\1{1,}$/.test(value)) return true;
  return false;
}

export function looksLikeFakePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  if (/^(?:1)?555\d{4}$/.test(digits)) return true;
  if (/555(?:01\d{2}|1212)/.test(digits)) return true;
  if (digits.includes("1234567") || digits.includes("0123456")) return true;
  if (digits.includes("9876543")) return true;
  return false;
}

export type IntegrityField = { field: string; value: unknown; heading?: boolean };

/**
 * Inspects any set of named text values. Callers pass business facts, generated
 * copy, section headings — anything that can reach a rendered page.
 */
export function inspectContentIntegrity(fields: IntegrityField[]): IntegrityViolation[] {
  const violations: IntegrityViolation[] = [];
  const seen = new Map<string, string[]>();

  for (const entry of fields) {
    if (typeof entry.value !== "string") {
      if (entry.heading && (entry.value === null || entry.value === undefined))
        violations.push({
          field: entry.field,
          value: "",
          kind: "empty_heading",
          detail: "a heading was left empty, which renders as a blank block",
        });
      continue;
    }
    const value = entry.value.trim();
    if (value.length === 0) {
      if (entry.heading)
        violations.push({
          field: entry.field,
          value: "",
          kind: "empty_heading",
          detail: "a heading was left empty, which renders as a blank block",
        });
      continue;
    }
    const lower = value.toLowerCase();

    if (LOREM.test(value))
      violations.push({
        field: entry.field,
        value,
        kind: "lorem_ipsum",
        detail: "placeholder Latin filler cannot appear on a real website",
      });
    else if (PLACEHOLDER_TOKENS.some((token) => lower === token || lower.includes(token)))
      violations.push({
        field: entry.field,
        value,
        kind: "placeholder_token",
        detail: "this is placeholder text, not real business information",
      });
    else if (FIXTURE_PATTERNS.some((pattern) => pattern.test(value)))
      violations.push({
        field: entry.field,
        value,
        kind: "fixture_data",
        detail: "this looks like test or demo data",
      });
    else if (FAKE_ADDRESSES.some((pattern) => pattern.test(value)))
      violations.push({
        field: entry.field,
        value,
        kind: "fake_address",
        detail: "this is a placeholder address",
      });
    else if (/phone|tel|mobile/i.test(entry.field) && looksLikeFakePhone(value))
      violations.push({
        field: entry.field,
        value,
        kind: "fake_phone",
        detail: "this is not a real, reachable phone number",
      });
    else if (looksLikeGibberish(value))
      violations.push({
        field: entry.field,
        value,
        kind: "gibberish",
        detail: "this does not read as real business information",
      });

    if (value.length >= 6) {
      const list = seen.get(lower) ?? [];
      list.push(entry.field);
      seen.set(lower, list);
    }
  }

  // The same filler string pasted across several visible fields.
  for (const [value, fields_] of seen)
    if (fields_.length >= 3)
      violations.push({
        field: fields_.join(", "),
        value,
        kind: "duplicated_filler",
        detail: `the same text is repeated in ${fields_.length} places, which reads as filler`,
      });

  return violations;
}

export class ContentIntegrityError extends Error {
  readonly violations: IntegrityViolation[];
  constructor(violations: IntegrityViolation[]) {
    super(contentIntegrityMessage(violations));
    this.name = "ContentIntegrityError";
    this.violations = violations;
  }
}

export function contentIntegrityMessage(violations: IntegrityViolation[]): string {
  const first = violations
    .slice(0, 3)
    .map((entry) => `${entry.field}: ${entry.detail}`)
    .join("; ");
  return `The build stopped because some business details are not real information yet (${first}). Please correct them in your business details and build again — nothing was invented in their place.`;
}

/** Throws when anything unreal would reach a rendered page. */
export function assertContentIntegrity(fields: IntegrityField[]): void {
  const violations = inspectContentIntegrity(fields);
  if (violations.length > 0) throw new ContentIntegrityError(violations);
}
