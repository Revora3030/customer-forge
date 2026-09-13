/**
 * REVORA PRESENTATION INTELLIGENCE ENGINE
 * MASTER CODE #8
 *
 * This module is the final deterministic safety boundary between generated
 * business/site data and visitor-facing presentation.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. Never fabricate business facts.
 * 2. Never render null/undefined/NaN/object debris.
 * 3. Never create clickable links from invalid contact data.
 * 4. Preserve intentional multiline copy.
 * 5. Normalize visitor-facing values consistently.
 * 6. Reject unsafe protocols.
 * 7. Remain synchronous, deterministic and dependency-free.
 * 8. Never require paid AI.
 * 9. Never silently turn machine IDs into marketing copy.
 * 10. Prefer omission over an invented value.
 */

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const DISPLAY_KEYS = [
  "label",
  "title",
  "name",
  "text",
  "value",
  "summary",
  "display",
  "description",
  "content",
  "heading",
  "caption",
] as const;

const LEAK_PATTERNS: RegExp[] = [
  /\[object\s+\w+\]/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\bNaN\b/i,
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,

  /\byour\s+(?:business|company|guarantee|logo|text|headline|tagline)\s+here\b/i,

  /\b(?:add|write|insert|enter|replace|put)\s+your\b/i,

  /\b123\s+main\s+st\b/i,
  /\b555[-.\s]?01\d\d\b/i,

  /\b(?:test|sample|example)@(test|example)\.(?:com|net|org|test)\b/i,

  /\bexample\.(?:com|net|org)\b/i,

  /\{\{[^}]*\}\}/,
  /\$\{[^}]*\}/,
  /<%[^%]*%>/,

  /\b(?:insert|replace)\s+(?:image|photo|logo|video)\b/i,

  /\b(?:business|company)\s+name\s+goes\s+here\b/i,

  /\b(?:headline|subheadline|description|cta)\s+goes\s+here\b/i,
];

const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const DANGEROUS_PROTOCOL =
  /^(?:javascript|data|vbscript|file):/i;

const SAFE_PROTOCOL =
  /^(?:https?|mailto|tel|sms):/i;

/* -------------------------------------------------------------------------- */
/* BASIC STRING SAFETY                                                        */
/* -------------------------------------------------------------------------- */

function cleanControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}

function normalizeWhitespace(value: string): string {
  return cleanControlCharacters(value)
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function collapseBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function recordOf(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* TEMPLATE LEAK DETECTION                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Detects obvious placeholder/template debris.
 *
 * This is deliberately conservative. It does not attempt to determine
 * whether a business claim is true; it only catches obvious generated
 * placeholders and machine/template artifacts.
 */
export function hasTemplateLeak(
  value: unknown,
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const text = value.trim();

  if (!text) {
    return false;
  }

  return LEAK_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
}

/**
 * Returns true when the value is clearly machine-generated debris.
 */
export function isPresentationLeak(
  value: unknown,
): boolean {
  return hasTemplateLeak(value);
}

/* -------------------------------------------------------------------------- */
/* SAFE TEXT                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Converts a value into visitor-facing text without ever stringifying an
 * arbitrary object.
 *
 * Objects are inspected only through known display properties.
 */
export function safeText(
  value: unknown,
  depth = 0,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "string") {
    const clean = normalizeWhitespace(value);

    if (!clean) {
      return null;
    }

    if (hasTemplateLeak(clean)) {
      return null;
    }

    return clean;
  }

  if (typeof value === "number") {
    return isFiniteNumber(value)
      ? String(value)
      : null;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  /*
   * Booleans should generally never appear as visitor-facing copy.
   */
  if (typeof value === "boolean") {
    return null;
  }

  /*
   * Protect against recursive/cyclic structures and excessively deep data.
   */
  if (depth > 3) {
    return null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) =>
        safeText(item, depth + 1),
      )
      .filter(
        (item): item is string =>
          Boolean(item),
      );

    return parts.length
      ? parts.join(", ")
      : null;
  }

  const record = recordOf(value);

  if (!record) {
    return null;
  }

  for (const key of DISPLAY_KEYS) {
    const candidate = safeText(
      record[key],
      depth + 1,
    );

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PARAGRAPH SAFETY                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Same safety boundary as safeText(), but intentionally preserves meaningful
 * line breaks.
 */
export function safeParagraph(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return safeText(value);
  }

  const lines = cleanControlCharacters(value)
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(line),
    )
    .filter(
      (line) =>
        Boolean(line) &&
        !hasTemplateLeak(line),
    );

  if (!lines.length) {
    return null;
  }

  return collapseBlankLines(
    lines.join("\n"),
  );
}

/**
 * Safely limits presentation text without breaking Unicode characters.
 */
export function safeExcerpt(
  value: unknown,
  maxLength = 180,
): string | null {
  const text = safeText(value);

  if (!text) {
    return null;
  }

  const limit = Math.max(
    20,
    Math.min(
      Math.floor(maxLength),
      10000,
    ),
  );

  if (text.length <= limit) {
    return text;
  }

  const shortened =
    text
      .slice(0, limit + 1)
      .replace(/\s+\S*$/, "")
      .trim();

  return shortened
    ? `${shortened}…`
    : `${text.slice(0, limit)}…`;
}

/* -------------------------------------------------------------------------- */
/* LISTS                                                                       */
/* -------------------------------------------------------------------------- */

export function safeList(
  value: unknown,
  options: {
    maxItems?: number;
    separator?: string;
  } = {},
): string[] {
  const maxItems = Math.max(
    1,
    Math.min(
      Math.floor(
        options.maxItems ?? 100,
      ),
      1000,
    ),
  );

  const source = Array.isArray(value)
    ? value
    : [value];

  const result: string[] = [];

  for (const item of source) {
    const text = safeText(item);

    if (!text) {
      continue;
    }

    if (!result.includes(text)) {
      result.push(text);
    }

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

export function joinSafe(
  values: unknown[],
  separator = ", ",
): string | null {
  const items = values
    .map((value) =>
      safeText(value),
    )
    .filter(
      (value): value is string =>
        Boolean(value),
    );

  return items.length
    ? items.join(separator)
    : null;
}

/* -------------------------------------------------------------------------- */
/* PHONE                                                                       */
/* -------------------------------------------------------------------------- */

const digitsOf = (
  value: string,
): string =>
  value.replace(/\D/g, "");

function isRepeatedDigits(
  value: string,
): boolean {
  return (
    value.length > 0 &&
    /^(\d)\1+$/.test(value)
  );
}

function isObviousFakePhone(
  digits: string,
): boolean {
  if (!digits) {
    return true;
  }

  if (isRepeatedDigits(digits)) {
    return true;
  }

  if (/^0+$/.test(digits)) {
    return true;
  }

  /*
   * NANP fictional 555-01xx range.
   */
  if (
    /^\d{3}55501\d{2}$/.test(
      digits,
    )
  ) {
    return true;
  }

  /*
   * Common placeholder patterns.
   */
  if (
    /^1234567890$/.test(digits) ||
    /^0123456789$/.test(digits)
  ) {
    return true;
  }

  return false;
}

/**
 * Shape validation only.
 *
 * This does NOT claim that a number exists or belongs to a business.
 */
export function isUsablePhone(
  value: unknown,
): boolean {
  const raw =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!raw) {
    return false;
  }

  if (hasTemplateLeak(raw)) {
    return false;
  }

  if (
    /^[a-z\s]+$/i.test(raw)
  ) {
    return false;
  }

  const digits = digitsOf(raw);

  if (isObviousFakePhone(digits)) {
    return false;
  }

  /*
   * International E.164-style representation.
   */
  if (raw.startsWith("+")) {
    return (
      digits.length >= 11 &&
      digits.length <= 15
    );
  }

  /*
   * NANP 11-digit format.
   */
  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    return true;
  }

  /*
   * NANP 10-digit format.
   */
  if (digits.length === 10) {
    const areaCode =
      digits.slice(0, 3);

    const exchange =
      digits.slice(3, 6);

    if (/^[01]/.test(areaCode)) {
      return false;
    }

    if (/^[01]/.test(exchange)) {
      return false;
    }

    return true;
  }

  return false;
}

export function phoneDisplay(
  value: unknown,
): string | null {
  if (!isUsablePhone(value)) {
    return null;
  }

  const raw = String(value).trim();
  const digits = digitsOf(raw);

  if (raw.startsWith("+")) {
    return `+${digits}`;
  }

  const national =
    digits.length === 11 &&
    digits.startsWith("1")
      ? digits.slice(1)
      : digits;

  if (national.length === 10) {
    return (
      `(${national.slice(0, 3)}) ` +
      `${national.slice(3, 6)}-${national.slice(6)}`
    );
  }

  return raw;
}

export function phoneLink(
  value: unknown,
): string | null {
  if (!isUsablePhone(value)) {
    return null;
  }

  const raw = String(value).trim();
  const digits = digitsOf(raw);

  return raw.startsWith("+")
    ? `tel:+${digits}`
    : `tel:${digits}`;
}

/* -------------------------------------------------------------------------- */
/* EMAIL                                                                       */
/* -------------------------------------------------------------------------- */

const EMAIL =
  /^[^\s@<>"'`]+@[^\s@<>"'`.]+(?:\.[^\s@<>"'`.]+)+$/;

const DISALLOWED_EMAIL_DOMAINS =
  new Set([
    "example.com",
    "example.org",
    "example.net",
    "test.com",
    "test.org",
    "test.net",
    "test.test",
    "localhost",
  ]);

function normalizedEmail(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (!email) {
    return null;
  }

  return email;
}

export function isUsableEmail(
  value: unknown,
): boolean {
  const email =
    normalizedEmail(value);

  if (!email) {
    return false;
  }

  if (hasTemplateLeak(email)) {
    return false;
  }

  if (!EMAIL.test(email)) {
    return false;
  }

  const parts = email.split("@");

  if (parts.length !== 2) {
    return false;
  }

  const [local, domain] = parts;

  if (
    local.length < 1 ||
    local.length > 254 ||
    domain.length < 3 ||
    domain.length > 253
  ) {
    return false;
  }

  if (
    DISALLOWED_EMAIL_DOMAINS.has(
      domain,
    )
  ) {
    return false;
  }

  if (
    !/^[a-z0-9.-]+$/i.test(domain)
  ) {
    return false;
  }

  if (
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.includes("..")
  ) {
    return false;
  }

  if (
    !/\.[a-z]{2,63}$/i.test(
      domain,
    )
  ) {
    return false;
  }

  return true;
}

export function emailDisplay(
  value: unknown,
): string | null {
  return isUsableEmail(value)
    ? normalizedEmail(value)
    : null;
}

/**
 * Builds a `mailto:` link. The email address itself must stay readable —
 * `encodeURIComponent` would turn the `@` into `%40` and break the header —
 * so only characters that are illegal in an email header value are percent-encoded.
 */
export function emailLink(
  value: unknown,
): string | null {
  const email =
    emailDisplay(value);

  if (!email) {
    return null;
  }

  return `mailto:${email
    .split("")
    .map((character) =>
      /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/.test(character)
        ? character
        : encodeURIComponent(character),
    )
    .join("")}`;
}

/* -------------------------------------------------------------------------- */
/* PLACE / ADDRESS                                                             */
/* -------------------------------------------------------------------------- */

const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "de",
  "for",
  "in",
  "la",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
]);

const US_STATE_CODES = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "dc",
]);

function titleWord(
  word: string,
  index: number,
): string {
  const lower =
    word.toLowerCase();

  if (
    word.length === 2 &&
    US_STATE_CODES.has(lower)
  ) {
    return lower.toUpperCase();
  }

  if (
    index > 0 &&
    SMALL_WORDS.has(lower)
  ) {
    return lower;
  }

  return lower.replace(
    /(^|[-'’])([a-z])/g,
    (
      _match,
      separator: string,
      character: string,
    ) =>
      `${separator}${character.toUpperCase()}`,
  );
}

export function placeDisplay(
  value: unknown,
): string | null {
  const text = safeText(value);

  if (!text) {
    return null;
  }

  return text
    .split(",")
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map(titleWord)
        .join(" "),
    )
    .filter(Boolean)
    .join(", ");
}

export function addressDisplay(parts: {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}): string | null {
  const street =
    safeText(parts.address);

  const city =
    placeDisplay(parts.city);

  const state =
    placeDisplay(parts.state);

  const zip =
    safeText(parts.zip);

  const region = [
    state,
    zip,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const locality = [
    city,
    region,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  const result = [
    street,
    locality,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();

  return result || null;
}

/* -------------------------------------------------------------------------- */
/* HOURS                                                                       */
/* -------------------------------------------------------------------------- */

const DAY_ORDER = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

const DAY_LABEL: Record<
  string,
  string
> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function dayKey(
  key: string,
): string | null {
  const normalized =
    key.trim().toLowerCase();

  const aliases: Record<
    string,
    string
  > = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };

  return aliases[normalized] ?? null;
}

function hoursEntry(
  value: unknown,
): string | null {
  if (typeof value === "string") {
    return safeText(value);
  }

  const record =
    recordOf(value);

  if (!record) {
    return safeText(value);
  }

  return (
    safeText(record.hours) ??
    safeText(record.open) ??
    safeText(record.time) ??
    safeText(record.value) ??
    safeText(record.label) ??
    safeText(record.text)
  );
}

export function hoursDisplay(
  value: unknown,
): string | null {
  if (typeof value === "string") {
    return safeText(value);
  }

  const record =
    recordOf(value);

  if (!record) {
    return safeText(value);
  }

  const entries = Object.entries(
    record,
  )
    .map(([key, rawHours]) => ({
      key: dayKey(key),
      hours: hoursEntry(rawHours),
    }))
    .filter(
      (
        entry,
      ): entry is {
        key: string;
        hours: string;
      } =>
        Boolean(
          entry.key &&
            entry.hours,
        ),
    )
    .sort(
      (a, b) =>
        DAY_ORDER.indexOf(
          a.key as (typeof DAY_ORDER)[number],
        ) -
        DAY_ORDER.indexOf(
          b.key as (typeof DAY_ORDER)[number],
        ),
    );

  if (entries.length) {
    return entries
      .map(
        (entry) =>
          `${DAY_LABEL[entry.key]}: ${entry.hours}`,
      )
      .join("\n");
  }

  const summary =
    safeText(record.summary) ??
    safeText(record.text) ??
    safeText(record.label) ??
    safeText(record.description);

  if (!summary) {
    return null;
  }

  /*
   * Prevent obviously malformed numeric data from becoming hours.
   */
  if (/^\d{1,2}$/.test(summary)) {
    return null;
  }

  return summary;
}

/* -------------------------------------------------------------------------- */
/* URL SAFETY                                                                  */
/* -------------------------------------------------------------------------- */

function hasDangerousProtocol(
  value: string,
): boolean {
  return DANGEROUS_PROTOCOL.test(
    value.trim(),
  );
}

/**
 * Absolute HTTP(S) URL only.
 */
export function externalUrl(
  value: unknown,
): string | null {
  const text = safeText(value);

  if (!text) {
    return null;
  }

  if (hasDangerousProtocol(text)) {
    return null;
  }

  try {
    const url = new URL(text);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    /*
     * Credentials embedded in URLs are never appropriate for visitor-facing
     * business links.
     */
    if (
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Local website path only.
 */
export function internalPath(
  value: unknown,
): string | null {
  const text = safeText(value);

  if (!text) {
    return null;
  }

  if (
    !text.startsWith("/") ||
    text.startsWith("//")
  ) {
    return null;
  }

  if (hasDangerousProtocol(text)) {
    return null;
  }

  return text;
}

/**
 * Safe visitor action target.
 */
export function actionTarget(
  value: unknown,
): string | null {
  const text = safeText(value);

  if (!text) {
    return null;
  }

  const local =
    internalPath(text);

  if (local) {
    return local;
  }

  const external =
    externalUrl(text);

  if (external) {
    return external;
  }

  const phone =
    phoneLink(text);

  if (phone) {
    return phone;
  }

  const email =
    emailLink(text);

  if (email) {
    return email;
  }

  /*
   * Explicitly allow safe SMS links only when supplied as such.
   */
  if (/^sms:/i.test(text)) {
    return /^sms:[^<>\s]+$/i.test(
      text,
    )
      ? text
      : null;
  }

  return null;
}

/**
 * Useful for external navigation where a new tab is intended.
 */
export function safeTarget(
  value: unknown,
): string | null {
  const target =
    safeText(value);

  if (
    target === "_blank" ||
    target === "_self" ||
    target === "_parent" ||
    target === "_top"
  ) {
    return target;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* NUMBERS / COUNTS                                                            */
/* -------------------------------------------------------------------------- */

export function positiveCount(
  value: unknown,
): number | null {
  const number =
    typeof value === "number"
      ? value
      : Number(
          safeText(value) ?? "",
        );

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number <= 0) {
    return null;
  }

  return Math.floor(number);
}

export function yearsDisplay(
  value: unknown,
): string | null {
  const years =
    positiveCount(value);

  if (!years) {
    return null;
  }

  /*
   * A calendar year or obviously corrupt value should never become
   * "2026 years".
   */
  if (years > 150) {
    return null;
  }

  return (
    `${years} year` +
    `${years === 1 ? "" : "s"}`
  );
}

export function countDisplay(
  value: unknown,
  singular: string,
  plural = `${singular}s`,
): string | null {
  const count =
    positiveCount(value);

  if (count === null) {
    return null;
  }

  const safeSingular =
    safeText(singular);

  const safePlural =
    safeText(plural);

  if (
    !safeSingular ||
    !safePlural
  ) {
    return null;
  }

  return (
    `${count} ` +
    `${count === 1 ? safeSingular : safePlural}`
  );
}

/* -------------------------------------------------------------------------- */
/* RATINGS                                                                     */
/* -------------------------------------------------------------------------- */

export function ratingDisplay(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    decimals?: number;
  } = {},
): string | null {
  const number =
    typeof value === "number"
      ? value
      : Number(
          safeText(value) ?? "",
        );

  if (!Number.isFinite(number)) {
    return null;
  }

  const min =
    Number.isFinite(options.min)
      ? Number(options.min)
      : 0;

  const max =
    Number.isFinite(options.max)
      ? Number(options.max)
      : 5;

  if (
    number < min ||
    number > max
  ) {
    return null;
  }

  const decimals = Math.max(
    0,
    Math.min(
      2,
      Math.floor(
        options.decimals ?? 1,
      ),
    ),
  );

  return number.toFixed(
    decimals,
  );
}

/* -------------------------------------------------------------------------- */
/* DATES                                                                       */
/* -------------------------------------------------------------------------- */

export function dateDisplay(
  value: unknown,
  locale = "en-US",
): string | null {
  const text =
    safeText(value);

  if (!text) {
    return null;
  }

  const date =
    new Date(text);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(
      locale,
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    ).format(date);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* MEDIA                                                                       */
/* -------------------------------------------------------------------------- */

export function imageUrl(
  value: unknown,
): string | null {
  return externalUrl(value);
}

export function imageAlt(
  value: unknown,
): string | null {
  return safeText(value);
}

/**
 * Determines whether a supplied image value is safe enough to render.
 */
export function isUsableImageUrl(
  value: unknown,
): boolean {
  return imageUrl(value) !== null;
}

/* -------------------------------------------------------------------------- */
/* LABELS                                                                      */
/* -------------------------------------------------------------------------- */

export function readableLabel(
  value: unknown,
  fallback: string | null = null,
): string | null {
  return (
    safeText(value) ??
    safeText(fallback)
  );
}

/**
 * Prevents UUIDs, hashes and long machine identifiers from becoming visitor
 * labels.
 */
export function displayId(
  value: unknown,
  fallback: string | null = null,
): string | null {
  const text =
    safeText(value);

  if (!text) {
    return safeText(fallback);
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      text,
    )
  ) {
    return safeText(fallback);
  }

  if (
    /^[A-Za-z0-9_-]{24,}$/.test(
      text,
    )
  ) {
    return safeText(fallback);
  }

  return text;
}

/* -------------------------------------------------------------------------- */
/* CTA / CONVERSION PRESENTATION                                              */
/* -------------------------------------------------------------------------- */

const CTA_WORDS =
  /\b(?:book|quote|contact|call|get started|start now|enquire|inquire|estimate|schedule|request|message|email|apply|hire|order|reserve|consult|learn more|shop|buy|discover|view|explore)\b/i;

export function isActionLabel(
  value: unknown,
): boolean {
  const text =
    safeText(value);

  return Boolean(
    text && CTA_WORDS.test(text),
  );
}

export function normalizeCtaLabel(
  value: unknown,
): string | null {
  const text =
    safeText(value);

  if (!text) {
    return null;
  }

  /*
   * Avoid accidental sentence-sized "buttons".
   */
  if (text.length > 90) {
    return safeExcerpt(
      text,
      80,
    );
  }

  return text;
}

/**
 * Returns whether a contact route is actually usable.
 */
export function hasContactRoute(
  input: {
    phone?: unknown;
    email?: unknown;
    url?: unknown;
  },
): boolean {
  return Boolean(
    isUsablePhone(input.phone) ||
      isUsableEmail(input.email) ||
      actionTarget(input.url),
  );
}

/* -------------------------------------------------------------------------- */
/* BUSINESS PRESENTATION                                                       */
/* -------------------------------------------------------------------------- */

export interface PresentationContact {
  phone: string | null;
  phoneLink: string | null;
  email: string | null;
  emailLink: string | null;
}

export interface PresentationLocation {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fullAddress: string | null;
}

export interface PresentationResult {
  text: string | null;
  paragraph: string | null;
  contact: PresentationContact;
  location: PresentationLocation;
  url: string | null;
}

/**
 * Central presentation normalizer.
 *
 * It does not invent missing facts.
 */
export function presentBusinessValue(
  input: {
    text?: unknown;
    paragraph?: unknown;
    phone?: unknown;
    email?: unknown;
    address?: unknown;
    city?: unknown;
    state?: unknown;
    zip?: unknown;
    url?: unknown;
  },
): PresentationResult {
  const phone =
    phoneDisplay(input.phone);

  const email =
    emailDisplay(input.email);

  const city =
    placeDisplay(input.city);

  const state =
    placeDisplay(input.state);

  const zip =
    safeText(input.zip);

  return {
    text: safeText(input.text),

    paragraph:
      safeParagraph(
        input.paragraph,
      ),

    contact: {
      phone,
      phoneLink: phone
        ? phoneLink(input.phone)
        : null,
      email,
      emailLink: email
        ? emailLink(input.email)
        : null,
    },

    location: {
      address:
        safeText(input.address),
      city,
      state,
      zip,
      fullAddress:
        addressDisplay({
          address:
            input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
        }),
    },

    url:
      externalUrl(input.url),
  };
}

/* -------------------------------------------------------------------------- */
/* VISITOR-FACING GUARDS                                                       */
/* -------------------------------------------------------------------------- */

export function visitorText(
  value: unknown,
  fallback: unknown = null,
): string | null {
  return (
    safeText(value) ??
    safeText(fallback)
  );
}

export function isPresentableText(
  value: unknown,
): boolean {
  return (
    safeText(value) !== null
  );
}

export function shouldHideValue(
  value: unknown,
): boolean {
  return (
    safeText(value) === null
  );
}

/**
 * Stronger final guard for content that should be visitor-facing.
 */
export function isVisitorSafe(
  value: unknown,
): boolean {
  const text =
    safeText(value);

  if (!text) {
    return false;
  }

  if (hasTemplateLeak(text)) {
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* SEO / METADATA PRESENTATION                                                 */
/* -------------------------------------------------------------------------- */

export function metaTitle(
  value: unknown,
): string | null {
  const text =
    safeText(value);

  if (!text) {
    return null;
  }

  return safeExcerpt(
    text,
    65,
  );
}

export function metaDescription(
  value: unknown,
): string | null {
  const text =
    safeParagraph(value);

  if (!text) {
    return null;
  }

  return safeExcerpt(
    text.replace(/\n+/g, " "),
    160,
  );
}

/* -------------------------------------------------------------------------- */
/* SAFE HTML-LIKE TEXT                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Removes obvious HTML tags from plain visitor copy.
 *
 * This is NOT an HTML sanitizer and should never replace a real HTML
 * sanitization library when arbitrary HTML is intentionally supported.
 */
export function stripMarkup(
  value: unknown,
): string | null {
  const text =
    safeText(value);

  if (!text) {
    return null;
  }

  return normalizeWhitespace(
    text
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        "",
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        "",
      )
      .replace(
        /<[^>]*>/g,
        " ",
      ),
  ) || null;
}

/* -------------------------------------------------------------------------- */
/* NORMALIZED CONTACT OBJECT                                                   */
/* -------------------------------------------------------------------------- */

export interface NormalizedContact {
  phone: string | null;
  phoneLink: string | null;
  email: string | null;
  emailLink: string | null;
  hasPhone: boolean;
  hasEmail: boolean;
  hasAnyRoute: boolean;
}

export function normalizeContact(
  input: {
    phone?: unknown;
    email?: unknown;
  },
): NormalizedContact {
  const phone =
    phoneDisplay(input.phone);

  const email =
    emailDisplay(input.email);

  return {
    phone,
    phoneLink: phone
      ? phoneLink(input.phone)
      : null,

    email,
    emailLink: email
      ? emailLink(input.email)
      : null,

    hasPhone:
      phone !== null,

    hasEmail:
      email !== null,

    hasAnyRoute:
      phone !== null ||
      email !== null,
  };
}

/* -------------------------------------------------------------------------- */
/* PRESENTATION READINESS                                                      */
/* -------------------------------------------------------------------------- */

export interface PresentationReadiness {
  ready: boolean;
  textReady: boolean;
  contactReady: boolean;
  locationReady: boolean;
  issues: string[];
}

/**
 * Lightweight deterministic readiness check.
 *
 * This intentionally does NOT judge whether business claims are truthful.
 * Truth must come from stored business facts.
 */
export function presentationReadiness(
  input: {
    text?: unknown;
    phone?: unknown;
    email?: unknown;
    address?: unknown;
    city?: unknown;
    state?: unknown;
  },
): PresentationReadiness {
  const issues: string[] = [];

  const text =
    safeText(input.text);

  const contact =
    normalizeContact({
      phone: input.phone,
      email: input.email,
    });

  const location =
    addressDisplay({
      address: input.address,
      city: input.city,
      state: input.state,
    });

  const textReady =
    text !== null &&
    !hasTemplateLeak(text);

  const contactReady =
    contact.hasAnyRoute;

  const locationReady =
    location !== null;

  if (!textReady) {
    issues.push(
      "Visitor-facing text is missing or contains template debris.",
    );
  }

  if (!contactReady) {
    issues.push(
      "No usable phone or email contact route is available.",
    );
  }

  if (
    input.address !== undefined ||
    input.city !== undefined ||
    input.state !== undefined
  ) {
    if (!locationReady) {
      issues.push(
        "Provided location data could not be normalized safely.",
      );
    }
  }

  return {
    ready:
      textReady &&
      (
        contactReady ||
        locationReady
      ),

    textReady,
    contactReady,
    locationReady,
    issues,
  };
}