/**
 * Small clean-up helpers (spacing, casing) for business intake fields.
 *
 * The owner types quickly on a phone; these helpers tidy the obvious mistakes
 * (spacing, casing, phone punctuation, stray commas) so nothing has to be
 * re-typed and every downstream system receives consistent facts.
 */

const SMALL_WORDS = new Set(["and", "of", "the", "for", "to", "at", "in", "on", "by", "a", "an"]);

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      if (/^[A-Z0-9&.'-]+$/.test(word) && word.length <= 4) return word; // keep acronyms (LLC, ABC)
      return lower.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join(" ");
}

/** US-style formatting when we clearly have 10 digits; otherwise light tidy. */
export function smartPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.trim().replace(/\s{2,}/g, " ");
}

export function smartEmail(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export function smartName(value: string) {
  const trimmed = value.trim().replace(/\s{2,}/g, " ");
  if (!trimmed) return trimmed;
  // Leave intentional casing alone; only fix all-lower or all-upper input.
  if (trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase())
    return titleCase(trimmed);
  return trimmed;
}

export function smartList(value: string) {
  const parts = value
    .split(/[,\n;]+/)
    .map((part) => smartName(part))
    .filter(Boolean);
  return Array.from(new Set(parts)).join(", ");
}

export function smartParagraph(value: string) {
  const cleaned = value
    .trim()
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  if (!cleaned) return cleaned;
  return cleaned.replace(
    /(^|[.!?]\s+)([a-z])/g,
    (_m, lead: string, char: string) => lead + char.toUpperCase(),
  );
}

/** Apply the right tidy-up for an intake field key. */
export function smartIntakeValue(key: string, value: string) {
  switch (key) {
    case "phone":
      return smartPhone(value);
    case "email":
      return smartEmail(value);
    case "name":
    case "city":
      return smartName(value);
    case "service_area":
      return smartList(value);
    case "description":
      return smartParagraph(value);
    default:
      return value.trim();
  }
}
