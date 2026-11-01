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
  "to be determined",
  "xxx",
  "xxxx",
  "asdf",
  "qwerty",
  "test test",
  "sample text",
  "dummy text",
  "n/a n/a",
];

/**
 * "tbd" and "todo" are placeholders only as whole words. As substrings they
 * flagged real names ("Mastodon Mowing", "Todo's Pizza") and ordinary words.
 * A possessive ("Todo's") is a name, not a to-do marker.
 */
const WHOLE_WORD_PLACEHOLDERS = [/(?<![\p{L}\p{N}_'\u2019])tbd(?![\p{L}\p{N}_'\u2019])/iu, /(?<![\p{L}\p{N}_'\u2019])todo(?![\p{L}\p{N}_'\u2019])/iu];

function hasPlaceholderToken(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => lower === token || lower.includes(token)) || WHOLE_WORD_PLACEHOLDERS.some((pattern) => pattern.test(value));
}

const FIXTURE_PATTERNS = [
  /\bexample\.(com|org|net)\b/i,
  /\btest@(test|example)\.[a-z]+\b/i,
  /\bacme\s+(inc|corp|co)\b/i,
  /\bjohn\s+doe\b/i,
  /\bjane\s+doe\b/i,
  /\bfoo\s*bar\b/i,
  /\btest[-\s]?fixture\b/i,
  /\bqa[-\s]?fixture\b/i,
  /\bfictional\s+(?:(?:[a-z0-9-]+)\s+){0,3}(?:studio|business|company|shop|service)\b/i,
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

export type IntegrityField = {
  field: string;
  value: unknown;
  heading?: boolean;
  /**
   * The same value may legitimately appear in other fields (a city that is also
   * the service area). It is still checked on its own, but it is left out of the
   * repeated-filler count.
   */
  allowDuplicate?: boolean;
};

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
    else if (hasPlaceholderToken(value))
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

    if (value.length >= 6 && !entry.allowDuplicate) {
      const list = seen.get(lower) ?? [];
      list.push(entry.field);
      seen.set(lower, list);
    }
  }

  // The same filler string pasted across several visible fields. Two places is
  // already wrong for sentence-length copy (a heading repeated as its own
  // subheading reads as filler), so that case is caught too.
  for (const [value, fields_] of seen)
    if (fields_.length >= 3 || (fields_.length >= 2 && value.length >= 12))
      violations.push({
        field: fields_.join(", "),
        value,
        kind: "duplicated_filler",
        detail: `the same text is repeated in ${fields_.length} places, which reads as filler`,
      });


  return violations;
}

/**
 * Splits placeholder contact details from the real ones. A fixture or
 * placeholder phone or email is never shown on the site and never replaced by an
 * invented one, but it is not a reason to refuse the whole build either: it is
 * withheld, and the owner is told to add the real one.
 */
export function withholdUnrealContacts(contacts: { phone?: string | null; email?: string | null }): {
  phone: string | null;
  email: string | null;
  withheld: ("phone" | "email")[];
  details: string[];
} {
  const withheld: ("phone" | "email")[] = [];
  const details: string[] = [];
  const check = (field: "phone" | "email", value: string | null | undefined): string | null => {
    if (value === null || value === undefined || value === "") return null;
    const problems = inspectContentIntegrity([{ field, value }]);
    if (problems.length === 0) return value;
    withheld.push(field);
    for (const problem of problems) details.push(`${field}: ${problem.detail}`);
    return null;
  };
  const phone = check("phone", contacts.phone);
  const email = check("email", contacts.email);
  return { phone, email, withheld, details };
}

/** Stable code on every ContentIntegrityError, read by the build failure classifier. */
export const CONTENT_INTEGRITY_ERROR_CODE = "content_integrity" as const;

export class ContentIntegrityError extends Error {
  readonly code = CONTENT_INTEGRITY_ERROR_CODE;
  readonly violations: IntegrityViolation[];
  constructor(violations: IntegrityViolation[]) {
    super(contentIntegrityMessage(violations));
    this.name = "ContentIntegrityError";
    this.violations = violations;
  }
}

/** True for a content integrity refusal, even across module copies (checks the code, not only the class). */
export function isContentIntegrityError(error: unknown): error is { message: string; code: string; violations?: IntegrityViolation[] } {
  if (error instanceof ContentIntegrityError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === CONTENT_INTEGRITY_ERROR_CODE
  );
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

/**
 * The business facts every build checks before any AI work starts. Shared by
 * the build request (so the owner hears about a bad detail at once) and the
 * worker (the hard gate), so both always check the same fields.
 */
export function businessFactIntegrityFields(facts: {
  businessName: string | null | undefined;
  description?: string | null;
  city?: string | null;
  serviceArea?: string | null;
  phone?: string | null;
  email?: string | null;
  services?: { name: string; description?: string | null }[];
}): IntegrityField[] {
  const services = facts.services ?? [];
  return [
    { field: "business name", value: facts.businessName ?? "", heading: true },
    { field: "description", value: facts.description ?? null },
    // A business's city is very often its service area too; that is not filler.
    { field: "city", value: facts.city ?? null, allowDuplicate: true },
    { field: "service area", value: facts.serviceArea ?? null, allowDuplicate: true },
    { field: "phone", value: facts.phone ?? null },
    { field: "email", value: facts.email ?? null },
    ...services.map((service, index) => ({ field: `service ${index + 1} name`, value: service.name, heading: true })),
    ...services.map((service, index) => ({ field: `service ${index + 1} description`, value: service.description ?? null })),
  ];
}

/** What each problem means, in the owner's words. */
const OWNER_PROBLEM: Record<IntegrityViolation["kind"], string> = {
  fixture_data: "looks like test data",
  placeholder_token: "is placeholder text",
  lorem_ipsum: "is placeholder text",
  fake_phone: "isn't a real, reachable phone number",
  fake_address: "is a placeholder address",
  gibberish: "doesn't read as real information",
  empty_heading: "is empty",
  duplicated_filler: "repeats the same text",
};

/** Maps the stored detail text back to its kind (the stored error keeps only field + detail). */
function kindFromDetail(detail: string): IntegrityViolation["kind"] | null {
  const text = detail.trim().toLowerCase();
  if (text.startsWith("this looks like test or demo data")) return "fixture_data";
  if (text.startsWith("this is placeholder text")) return "placeholder_token";
  if (text.startsWith("placeholder latin filler")) return "lorem_ipsum";
  if (text.startsWith("this is not a real, reachable phone")) return "fake_phone";
  if (text.startsWith("this is a placeholder address")) return "fake_address";
  if (text.startsWith("this does not read as real business information")) return "gibberish";
  if (text.startsWith("a heading was left empty")) return "empty_heading";
  if (text.startsWith("the same text is repeated")) return "duplicated_filler";
  return null;
}

/**
 * Reads the field/problem pairs back out of a stored integrity message
 * ("... not real information yet (email: this looks like test or demo data; city: ...)").
 * Returns [] when the message is not one.
 */
export function parseIntegrityViolations(message: string | null | undefined): { field: string; kind: IntegrityViolation["kind"] }[] {
  const match = /not real information yet \((.*)\)\. Please correct/i.exec(message ?? "");
  if (!match) return [];
  const out: { field: string; kind: IntegrityViolation["kind"] }[] = [];
  for (const part of (match[1] ?? "").split(/;\s*/)) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const kind = kindFromDetail(part.slice(colon + 1));
    if (kind) out.push({ field: part.slice(0, colon).trim(), kind });
  }
  return out;
}

/** The owner-facing name of a refused field ("email" -> "business email"). */
export function ownerFieldName(field: string): string {
  const name = field.trim().toLowerCase();
  if (name === "email") return "business email";
  if (name === "phone") return "business phone";
  if (name === "city") return "business city";
  if (name === "description") return "business description";
  return name;
}

/**
 * The owner-facing explanation for a content integrity refusal: which field,
 * what is wrong with it, where to fix it, and that Build has to be pressed
 * again (nothing resumes on its own).
 * e.g. "Your business email looks like test data. Update it in Business details, then press Build again."
 */
export function integrityOwnerMessage(violations: { field: string; kind: IntegrityViolation["kind"] }[]): string {
  if (violations.length === 0)
    return "Some business details look like test or placeholder data. Update them in Business details, then press Build again.";
  // Kept short enough for a chat line or toast (friendlyError drops anything
  // over 180 characters): name up to three fields, fewer if they run long.
  let text = "";
  for (let count = Math.min(3, violations.length); count >= 1; count -= 1) {
    const phrases = violations.slice(0, count).map((entry) => `${ownerFieldName(entry.field)} ${OWNER_PROBLEM[entry.kind]}`);
    const rest = violations.length - count;
    if (rest > 0) phrases.push(`${rest} more ${rest === 1 ? "detail needs" : "details need"} fixing`);
    const sentence =
      phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
    const pronoun = violations.length === 1 ? "it" : "them";
    text = `Your ${sentence}. Update ${pronoun} in Business details, then press Build again.`;
    if (text.length <= 175) break;
  }
  return text;
}
