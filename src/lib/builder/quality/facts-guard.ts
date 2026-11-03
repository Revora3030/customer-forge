/**
 * QP-2 · Real facts only.
 *
 * Two jobs, both pure:
 *
 *  1. `ownerFillPlan(intake)`: turns the owner's intake into the values a build may use, and for every field the owner
 *     did not give returns a visible placeholder marker (for example "[Add your phone]") plus a flag in the data, so a
 *     draft never shows an invented phone, price, review or number and the owner can see exactly what to add.
 *  2. `findInventedFacts(parts, intake)`: scans generated text for phones, emails, prices, ratings, review counts,
 *     years-in-business claims, awards and licence claims that are not in the intake. Placeholder markers are ignored.
 *
 * Nothing here ever writes a fact. A value that is not in the intake is never produced, only flagged.
 */
import { looksLikeFakePhone, withholdUnrealContacts } from "@/lib/builder/content-integrity";

export type IntakeService = { name: string; description?: string | null; price?: string | number | null };

/** What the owner gave us. Every field is optional; a missing one becomes an owner-fill placeholder. */
export type IntakeFacts = {
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  serviceArea?: string | null;
  hours?: string | null;
  description?: string | null;
  services?: readonly IntakeService[] | null;
  /** Photo URLs or references the owner supplied. */
  photos?: readonly string[] | null;
  /** The owner's own Google Business Profile or website, when given. */
  googleProfileUrl?: string | null;
  websiteUrl?: string | null;
  /** Real figures the owner supplied. Nothing is inferred from these being absent. */
  rating?: number | null;
  reviewCount?: number | null;
  yearsInBusiness?: number | null;
  foundedYear?: number | null;
  awards?: readonly string[] | null;
  credentials?: readonly string[] | null;
  /** Free text the owner wrote (about, notes, pasted profile). Prices and figures quoted there count as theirs. */
  ownerText?: string | null;
};

export type OwnerFillField = "businessName" | "phone" | "email" | "address" | "serviceArea" | "hours" | "services" | "photos" | "description";

export type OwnerFillFlag = {
  field: OwnerFillField;
  /** The visible text that stands in for the missing value. */
  marker: string;
  reason: "missing" | "placeholder_value";
  /** A missing required field stops a draft from being shown to the customer as ready. */
  required: boolean;
};

const MARKERS: Readonly<Record<OwnerFillField, { marker: string; required: boolean }>> = {
  businessName: { marker: "[Add your business name]", required: true },
  phone: { marker: "[Add your phone]", required: false },
  email: { marker: "[Add your email]", required: false },
  address: { marker: "[Add your address]", required: false },
  serviceArea: { marker: "[Add your service area]", required: false },
  hours: { marker: "[Add your hours]", required: false },
  services: { marker: "[Add your services]", required: true },
  photos: { marker: "[Add your photos]", required: false },
  description: { marker: "[Add a short description of your business]", required: false },
};

/** Every marker the guard produces. Scanners ignore these so a placeholder is never mistaken for copy. */
export const OWNER_FILL_MARKERS: readonly string[] = Object.values(MARKERS).map((m) => m.marker);

const MARKER_PATTERN = /\[Add your [^\]]{1,60}\]|\[Add a short description[^\]]{0,60}\]/gi;

export function ownerFillMarker(field: OwnerFillField): string {
  return MARKERS[field].marker;
}

export type OwnerFillPlan = {
  /** Values the build may use. Null means "show the placeholder, flag it". */
  values: {
    businessName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    serviceArea: string | null;
    hours: string | null;
    description: string | null;
    services: IntakeService[];
    photos: string[];
  };
  /** The text to render for each field: the real value, or its marker. */
  display: Record<"businessName" | "phone" | "email" | "address" | "serviceArea" | "hours" | "description", string>;
  flags: OwnerFillFlag[];
  /** True when no required field is missing. */
  readyToShow: boolean;
};

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ownerFillPlan(intake: IntakeFacts): OwnerFillPlan {
  const flags: OwnerFillFlag[] = [];
  const flag = (field: OwnerFillField, reason: OwnerFillFlag["reason"]) =>
    flags.push({ field, marker: MARKERS[field].marker, reason, required: MARKERS[field].required });

  // A placeholder or fixture phone or email is withheld, never shown and never replaced.
  const contacts = withholdUnrealContacts({ phone: text(intake.phone), email: text(intake.email) });
  const services = (intake.services ?? [])
    .map((s) => ({ ...s, name: text(s.name) ?? "" }))
    .filter((s) => s.name.length > 0);
  const photos = (intake.photos ?? []).map((p) => p.trim()).filter((p) => p.length > 0);

  const values = {
    businessName: text(intake.businessName),
    phone: contacts.phone,
    email: contacts.email,
    address: text(intake.address),
    serviceArea: text(intake.serviceArea) ?? text(intake.city),
    hours: text(intake.hours),
    description: text(intake.description),
    services,
    photos,
  };

  if (!values.businessName) flag("businessName", "missing");
  if (!values.phone) flag("phone", contacts.withheld.includes("phone") ? "placeholder_value" : "missing");
  if (!values.email) flag("email", contacts.withheld.includes("email") ? "placeholder_value" : "missing");
  if (!values.address) flag("address", "missing");
  if (!values.serviceArea) flag("serviceArea", "missing");
  if (!values.hours) flag("hours", "missing");
  if (!values.description) flag("description", "missing");
  if (services.length === 0) flag("services", "missing");
  if (photos.length === 0) flag("photos", "missing");

  const display = {
    businessName: values.businessName ?? MARKERS.businessName.marker,
    phone: values.phone ?? MARKERS.phone.marker,
    email: values.email ?? MARKERS.email.marker,
    address: values.address ?? MARKERS.address.marker,
    serviceArea: values.serviceArea ?? MARKERS.serviceArea.marker,
    hours: values.hours ?? MARKERS.hours.marker,
    description: values.description ?? MARKERS.description.marker,
  };

  return { values, display, flags, readyToShow: !flags.some((f) => f.required) };
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* No-invented-facts scan                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

export type FactViolationKind =
  | "phone"
  | "fake_phone"
  | "email"
  | "example_email"
  | "price"
  | "rating"
  | "review_count"
  | "years_in_business"
  | "award"
  | "credential";

export type FactViolation = {
  kind: FactViolationKind;
  /** Id of the part the text came from (a section id, a page slug), so only that part is regenerated. */
  partId: string;
  /** The offending snippet. */
  match: string;
  detail: string;
};

export type TextPart = { id: string; text: string };

const digitsOf = (value: string) => value.replace(/\D/g, "");
const lower = (value: string | null | undefined) => (value ?? "").toLowerCase();

const PHONE_PATTERN = /(?<![\w$.])(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b(?![\w.])/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EXAMPLE_EMAIL_DOMAIN = /@(?:[\w-]+\.)*(?:example|test|invalid|localhost)(?:\.[a-z]+)?$|@example\.[a-z]+$|\.(?:example|test|invalid)$/i; // DevSkim: ignore DS162092 -- Matches reserved placeholder domains so they are flagged; no host is accessed.
const PRICE_PATTERN = /\$\s?\d[\d,]*(?:\.\d{1,2})?(?:\s?(?:k|K))?/g;
const RATING_PATTERN = /\b([0-5](?:\.\d)?)\s?(?:\/\s?5\b|[-\s]?stars?\b|★)|★\s?([0-5](?:\.\d)?)|\b(?:rated|rating(?: of)?)\s+([0-5](?:\.\d)?)\b|\b([1-5])[-\s]star\b/gi;
const REVIEW_COUNT_PATTERN = /\b(\d[\d,]*)\+?\s+(?:five[- ]star\s+|5[- ]star\s+|verified\s+|google\s+)?(?:reviews?|ratings?|testimonials?)\b/gi;
const YEARS_PATTERN = /\b(\d{1,3})\+?\s+years?(?:\s+of\s+experience|\s+in\s+business|\s+serving)?\b|\b(?:since|established(?: in)?|founded(?: in)?|serving [\w\s]{0,30} since)\s+((?:19|20)\d{2})\b/gi;
const AWARD_PATTERN = /\b(award[- ]winning|best of [A-Za-z ]{2,30}|voted (?:best|#1|number one)|#1[- ]rated|number one (?:rated|in)|top[- ]rated|five[- ]star rated|bbb (?:a\+|accredited))\b/gi;
const CREDENTIAL_PATTERN = /\b(licensed(?: and| &)? insured|fully (?:licensed|insured)|licensed|insured|bonded|certified|accredited)\b/gi;

function stripMarkers(value: string): string {
  return value.replace(MARKER_PATTERN, " ");
}

function priceNumbers(intake: IntakeFacts): Set<string> {
  const sources = [
    ...(intake.services ?? []).flatMap((s) => [String(s.price ?? ""), s.description ?? "", s.name]),
    intake.description ?? "",
    intake.ownerText ?? "",
  ].join(" ");
  const found = new Set<string>();
  for (const m of sources.match(PRICE_PATTERN) ?? []) found.add(normalizePrice(m));
  // A bare price field such as 150 or "150.00" counts too.
  for (const s of intake.services ?? []) {
    const raw = s.price;
    if (raw !== null && raw !== undefined && String(raw).trim() !== "") found.add(normalizePrice(String(raw)));
  }
  return found;
}

function normalizePrice(value: string): string {
  const cleaned = value.replace(/[$,\s]/g, "").toLowerCase();
  const withK = cleaned.endsWith("k") ? String(Number(cleaned.slice(0, -1)) * 1000) : cleaned;
  const n = Number(withK);
  return Number.isFinite(n) ? String(n) : cleaned;
}

function intakeCorpus(intake: IntakeFacts): string {
  return lower(
    [
      intake.description,
      intake.ownerText,
      ...(intake.services ?? []).flatMap((s) => [s.name, s.description]),
      ...(intake.awards ?? []),
      ...(intake.credentials ?? []),
    ].join(" "),
  );
}

/**
 * Scans generated copy for facts that are not in the intake. Returns every violation, in part order. An empty list
 * means every phone, email, price, rating, count, years claim, award and licence claim in the text is the owner's.
 */
export function findInventedFacts(parts: readonly TextPart[], intake: IntakeFacts): FactViolation[] {
  const out: FactViolation[] = [];
  const ownPhone = digitsOf(intake.phone ?? "");
  const ownPhoneTail = ownPhone.slice(-10);
  const ownEmail = lower(intake.email);
  const prices = priceNumbers(intake);
  const corpus = intakeCorpus(intake);
  const add = (kind: FactViolationKind, partId: string, match: string, detail: string) => out.push({ kind, partId, match: match.trim(), detail });

  for (const part of parts) {
    const raw = stripMarkers(part.text);

    for (const m of raw.match(PHONE_PATTERN) ?? []) {
      const digits = digitsOf(m);
      if (digits.length < 10) continue;
      if (looksLikeFakePhone(m)) add("fake_phone", part.id, m, "A placeholder or fixture phone number (such as a 555 number) is shown.");
      else if (!ownPhoneTail || digits.slice(-10) !== ownPhoneTail) add("phone", part.id, m, "A phone number that is not the owner's is shown.");
    }

    for (const m of raw.match(EMAIL_PATTERN) ?? []) {
      if (EXAMPLE_EMAIL_DOMAIN.test(m)) add("example_email", part.id, m, "An example or test email address is shown.");
      else if (lower(m) !== ownEmail) add("email", part.id, m, "An email address that is not the owner's is shown.");
    }

    // Phone numbers and emails are handled above; prices must not be mistaken for them.
    for (const m of raw.match(PRICE_PATTERN) ?? []) {
      if (!prices.has(normalizePrice(m))) add("price", part.id, m, "A price that the owner did not give is shown.");
    }

    for (const m of raw.matchAll(RATING_PATTERN)) {
      const value = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
      const ownRating = intake.rating ?? null;
      if (ownRating === null || Math.abs(ownRating - value) > 0.05) add("rating", part.id, m[0], "A rating that the owner did not give is shown.");
    }

    for (const m of raw.matchAll(REVIEW_COUNT_PATTERN)) {
      const count = Number((m[1] ?? "").replace(/,/g, ""));
      if (intake.reviewCount === null || intake.reviewCount === undefined || count !== intake.reviewCount)
        add("review_count", part.id, m[0], "A review or testimonial count that the owner did not give is shown.");
    }

    for (const m of raw.matchAll(YEARS_PATTERN)) {
      const years = m[1] ? Number(m[1]) : null;
      const since = m[2] ? Number(m[2]) : null;
      // "3 years" in a warranty or a service description is not a business-age claim unless it says so.
      if (years !== null && !/in business|of experience|serving/i.test(m[0])) continue;
      const okYears = years !== null && intake.yearsInBusiness !== null && intake.yearsInBusiness !== undefined && years === intake.yearsInBusiness;
      const okSince = since !== null && intake.foundedYear !== null && intake.foundedYear !== undefined && since === intake.foundedYear;
      if (!okYears && !okSince) add("years_in_business", part.id, m[0], "A years-in-business figure that the owner did not give is shown.");
    }

    for (const m of raw.matchAll(AWARD_PATTERN)) {
      if (!corpus.includes(lower(m[1]))) add("award", part.id, m[0], "An award or ranking that the owner did not give is shown.");
    }

    for (const m of raw.matchAll(CREDENTIAL_PATTERN)) {
      const word = lower(m[1]);
      const supplied = (intake.credentials ?? []).some((c) => lower(c).includes(word.split(/ and | & /)[0]!)) || corpus.includes(word);
      if (!supplied) add("credential", part.id, m[0], "A licence, insurance or certification claim that the owner did not give is shown.");
    }
  }
  return out;
}

/** One line per violation, for the owner or the retry prompt. */
export function describeFactViolations(violations: readonly FactViolation[]): string[] {
  return violations.map((v) => `${v.partId}: "${v.match}" — ${v.detail}`);
}
