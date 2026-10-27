/**
 * Owner-side estimate and work-order documents for one lead.
 *
 * Every figure on the page is something the owner typed (quantities, prices, the tax rate, the
 * terms) or a record the workspace already holds (the customer's contact details). Nothing is
 * defaulted to an invented price, tax rate or legal wording. Money is added up in whole cents so
 * the printed lines, tax and total always agree to the cent.
 */

export type DocumentKind = "estimate" | "work_order";

/** One row as the owner typed it. Prices are dollars, quantities and the tax rate are plain numbers. */
export type LineDraft = { description: string; quantity: string; unitPrice: string; taxable: boolean };

export type DocumentLine = {
  description: string;
  quantity: number;
  /** null on a crew work order where the owner left the price blank. */
  unitCents: number | null;
  amountCents: number | null;
  taxable: boolean;
};

export type DocumentBusiness = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
};

export type DocumentCustomer = { name: string; email?: string | null; phone?: string | null };

export type DocumentFormState = {
  kind: DocumentKind;
  lines: readonly LineDraft[];
  /** Percent as typed ("8.25"); blank means no tax line. */
  taxRate: string;
  /** Days the estimate stays valid, as typed; blank means no expiry is printed. */
  validDays: string;
  /** Work orders default to a crew copy without prices. */
  showPrices: boolean;
  jobSite: string;
  scheduledFor: string;
  assignedTo: string;
  notes: string;
  terms: string;
};

export type DocumentModel = {
  kind: DocumentKind;
  title: "Estimate" | "Work order";
  number: string;
  preparedOn: string;
  validUntil: string | null;
  business: DocumentBusiness;
  customer: DocumentCustomer;
  jobSite: string;
  scheduledFor: string;
  assignedTo: string;
  lines: DocumentLine[];
  /** Whether amounts are printed. Estimates always show them. */
  showPrices: boolean;
  subtotalCents: number;
  taxRateLabel: string | null;
  taxCents: number;
  totalCents: number;
  notes: string;
  terms: string;
  /** Anything that would make the printout wrong or empty; the page blocks printing until it is empty. */
  problems: string[];
};

export const MAX_LINES = 40;
export const MAX_TAX_RATE_PCT = 30;
export const MAX_VALID_DAYS = 365;
/** A single line may not exceed $10,000,000, which also keeps every sum below exact-integer limits. */
const MAX_LINE_CENTS = 1_000_000_000;
const MAX_QUANTITY = 100_000;
const LIMITS = { description: 160, short: 120, address: 200, notes: 2000, terms: 2000 } as const;

const clip = (text: string, max: number) => text.replace(/\r\n?/g, "\n").trim().slice(0, max);

const NUMBER = /^(\d+\.?\d*|\.\d+)$/;

/** "$1,234.5" → 123450. Blank or non-numeric → null. Rounds half up on a third decimal. */
export function parseMoneyToCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  const negative = cleaned.startsWith("-");
  const digits = negative ? cleaned.slice(1) : cleaned;
  if (!NUMBER.test(digits)) return null;
  const [whole = "", fraction = ""] = digits.split(".");
  if (whole.length > 10) return null;
  let cents = Number(whole || "0") * 100 + Number(`${fraction}00`.slice(0, 2));
  if (fraction.length > 2 && Number(fraction[2]) >= 5) cents += 1;
  if (cents > MAX_LINE_CENTS) return null;
  return negative && cents > 0 ? -cents : cents;
}

/** A quantity above zero, to three decimals ("2.5" hours). Anything else → null. */
export function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!NUMBER.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * 1000) / 1000;
  return value > 0 && value <= MAX_QUANTITY ? value : null;
}

/** "8.25" or "8.25%" → 8.25. Blank → 0 (no tax). Outside 0–30 or not a number → null. */
export function parseTaxRate(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, "");
  if (cleaned === "") return 0;
  if (!NUMBER.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * 1000) / 1000;
  return value <= MAX_TAX_RATE_PCT ? value : null;
}

/** Whole days 1–365, or no expiry when blank. */
export function parseValidDays(text: string): { days: number | null; valid: boolean } {
  const cleaned = text.trim();
  if (cleaned === "") return { days: null, valid: true };
  if (!/^\d{1,3}$/.test(cleaned)) return { days: null, valid: false };
  const days = Number(cleaned);
  return days >= 1 && days <= MAX_VALID_DAYS ? { days, valid: true } : { days: null, valid: false };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Exact cents with a real minus sign: 123456 → "$1,234.56", -5000 → "−$50.00". */
export const formatCents = (cents: number) => usd.format(cents / 100).replace("-", "−");

const dateLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const percentLabel = (rate: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(rate)}%`;

/** EST-261027-1A2B / WO-261027-1A2B: the local date plus the last four characters of the lead id. */
export function documentNumber(kind: DocumentKind, leadId: string, date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const tail = leadId.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase().padStart(4, "0");
  return `${kind === "estimate" ? "EST" : "WO"}-${yy}${mm}${dd}-${tail}`;
}

/** "Tue, Oct 28 · 9:00 AM" for an appointment start, or "" when the timestamp is unreadable. */
export function formatSchedule(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  // Newer ICU builds put a narrow no-break space before AM/PM; plain spaces print and compare the same everywhere.
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/[\u202f\u00a0]/g, " ");
  return `${day} · ${time}`;
}

export const blankLine = (): LineDraft => ({ description: "", quantity: "1", unitPrice: "", taxable: true });

type ParsedLines = { lines: DocumentLine[]; problems: string[] };

function parseLines(drafts: readonly LineDraft[], priced: boolean): ParsedLines {
  const lines: DocumentLine[] = [];
  const problems: string[] = [];
  drafts.slice(0, MAX_LINES).forEach((draft, index) => {
    const row = index + 1;
    const description = clip(draft.description, LIMITS.description);
    const priceText = draft.unitPrice.trim();
    // An untouched row is simply left out.
    if (!description && !priceText) return;
    if (!description) {
      problems.push(`Line ${row} has a price but no description.`);
      return;
    }
    const quantity = parseQuantity(draft.quantity);
    if (quantity === null) {
      problems.push(`Line ${row} needs a quantity above zero.`);
      return;
    }
    let unitCents: number | null = null;
    if (priceText) {
      unitCents = parseMoneyToCents(priceText);
      if (unitCents === null) {
        problems.push(`Line ${row} has a price that isn't a dollar amount.`);
        return;
      }
    } else if (priced) {
      problems.push(`Line ${row} needs a price. Enter 0 if it is included.`);
      return;
    }
    const amountCents = unitCents === null ? null : Math.round(unitCents * quantity);
    if (amountCents !== null && Math.abs(amountCents) > MAX_LINE_CENTS) {
      problems.push(`Line ${row} is too large to print. Check the quantity and price.`);
      return;
    }
    lines.push({ description, quantity, unitCents, amountCents, taxable: draft.taxable });
  });
  return { lines, problems };
}

export function buildDocument(input: {
  form: DocumentFormState;
  leadId: string;
  now: Date;
  business: DocumentBusiness;
  customer: DocumentCustomer;
}): DocumentModel {
  const { form, now } = input;
  const kind = form.kind;
  const showPrices = kind === "estimate" || form.showPrices;
  const { lines, problems } = parseLines(form.lines, showPrices);

  const rate = parseTaxRate(form.taxRate);
  // A crew copy prints no prices, so a mistyped tax rate can't make it wrong.
  if (showPrices && rate === null) problems.push(`The tax rate must be a number from 0 to ${MAX_TAX_RATE_PCT}.`);
  const valid = kind === "estimate" ? parseValidDays(form.validDays) : { days: null, valid: true };
  if (!valid.valid) problems.push(`"Valid for" must be a whole number of days from 1 to ${MAX_VALID_DAYS}.`);
  if (lines.length === 0 && problems.length === 0) problems.push("Add at least one line to the document.");

  let subtotalCents = 0;
  let taxableCents = 0;
  if (showPrices) {
    for (const line of lines) {
      subtotalCents += line.amountCents ?? 0;
      if (line.taxable) taxableCents += line.amountCents ?? 0;
    }
  }
  // Tax is on the taxable lines only, after any discount lines, rounded to the nearest cent.
  const rateMilli = Math.round((rate ?? 0) * 1000);
  const taxCents = showPrices ? Math.round((Math.max(0, taxableCents) * rateMilli) / 100_000) : 0;
  const totalCents = subtotalCents + taxCents;
  if (showPrices && lines.length > 0 && totalCents < 0) {
    problems.push("The discounts are larger than the work. The total can't go below zero.");
  }

  const validUntil =
    valid.days === null ? null : dateLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate() + valid.days));

  return {
    kind,
    title: kind === "estimate" ? "Estimate" : "Work order",
    number: documentNumber(kind, input.leadId, now),
    preparedOn: dateLabel(now),
    validUntil,
    business: input.business,
    customer: input.customer,
    jobSite: clip(form.jobSite, LIMITS.address),
    scheduledFor: kind === "work_order" ? clip(form.scheduledFor, LIMITS.short) : "",
    assignedTo: kind === "work_order" ? clip(form.assignedTo, LIMITS.short) : "",
    lines,
    showPrices,
    subtotalCents,
    taxRateLabel: showPrices && rate ? percentLabel(rate) : null,
    taxCents,
    totalCents,
    notes: clip(form.notes, LIMITS.notes),
    terms: kind === "estimate" ? clip(form.terms, LIMITS.terms) : "",
    problems,
  };
}

/** The line written to the lead's activity feed when the owner prints the document. */
export function documentLogBody(doc: DocumentModel): string {
  const count = doc.lines.length;
  const noun = doc.kind === "estimate" ? (count === 1 ? "line" : "lines") : count === 1 ? "task" : "tasks";
  const total = doc.showPrices ? `, total ${formatCents(doc.totalCents)}` : "";
  return `${doc.title} ${doc.number} prepared${total} (${count} ${noun}).`;
}

/** What the visitor chose on the public quote calculator, read safely out of the stored JSON. */
export function quoteChoices(answers: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(answers)) return [];
  const out: { question: string; answer: string }[] = [];
  for (const item of answers) {
    if (!item || typeof item !== "object") continue;
    const { question, answer } = item as { question?: unknown; answer?: unknown };
    if (typeof question !== "string" || typeof answer !== "string") continue;
    if (!question.trim() || !answer.trim()) continue;
    out.push({ question: clip(question, LIMITS.short), answer: clip(answer, LIMITS.short) });
  }
  return out.slice(0, 20);
}

/** "Heater type: Tankless" lines the owner can drop into the scope notes. */
export const quoteChoicesText = (choices: readonly { question: string; answer: string }[]) =>
  choices.map((choice) => `${choice.question}: ${choice.answer}`).join("\n");

/** "123 Main St, Austin, TX 78701" from whichever parts the business profile holds. */
export function businessAddress(
  profile: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null | undefined,
): string {
  if (!profile) return "";
  const region = [profile.state?.trim(), profile.zip?.trim()].filter(Boolean).join(" ");
  const place = [profile.city?.trim(), region].filter(Boolean).join(", ");
  return [profile.address?.trim(), place].filter(Boolean).join(", ");
}

/** The lead's next pending or confirmed appointment, in plain words, or "" when there isn't one. */
export function nextAppointmentLabel(
  leadId: string,
  appointments: readonly { lead_id: string | null; status: string; starts_at: string }[],
  now: Date = new Date(),
): string {
  const upcoming = appointments
    .filter((a) => a.lead_id === leadId && (a.status === "pending" || a.status === "confirmed"))
    .map((a) => ({ iso: a.starts_at, at: Date.parse(a.starts_at) }))
    .filter((a) => Number.isFinite(a.at) && a.at >= now.getTime())
    .sort((x, y) => x.at - y.at);
  return upcoming[0] ? formatSchedule(upcoming[0].iso) : "";
}

export type QuoteReference = { min: number; max: number; choices: { question: string; answer: string }[] };

/** The visitor's most recent calculator request for this lead: shown for reference, never copied into prices. */
export function latestQuoteFor(
  leadId: string,
  requests: readonly { lead_id: string | null; answers: unknown; estimate_min: number | string; estimate_max: number | string; created_at: string }[],
): QuoteReference | null {
  const newest = requests
    .filter((request) => request.lead_id === leadId)
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0];
  if (!newest) return null;
  return {
    min: Number(newest.estimate_min) || 0,
    max: Number(newest.estimate_max) || 0,
    choices: quoteChoices(newest.answers),
  };
}

/* ------------------------- remembered owner defaults ------------------------- */

/** The terms an owner reuses on every document. Remembered on this device only. */
export type DocumentDefaults = { taxRate: string; validDays: string; terms: string };
export const EMPTY_DEFAULTS: DocumentDefaults = { taxRate: "", validDays: "", terms: "" };

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const storageKey = (organizationId: string) => `revora.document-defaults.${organizationId}`;

function deviceStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadDefaults(organizationId: string | undefined, storage: StorageLike | null = deviceStorage()): DocumentDefaults {
  if (!organizationId || !storage) return EMPTY_DEFAULTS;
  try {
    const raw = storage.getItem(storageKey(organizationId));
    if (!raw) return EMPTY_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof DocumentDefaults, unknown>>;
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
    return {
      taxRate: text(parsed.taxRate, 12),
      validDays: text(parsed.validDays, 4),
      terms: text(parsed.terms, LIMITS.terms),
    };
  } catch {
    return EMPTY_DEFAULTS;
  }
}

export function saveDefaults(
  organizationId: string | undefined,
  defaults: DocumentDefaults,
  storage: StorageLike | null = deviceStorage(),
): void {
  if (!organizationId || !storage) return;
  try {
    storage.setItem(storageKey(organizationId), JSON.stringify(defaults));
  } catch {
    // Private windows and full storage just mean the next document starts blank.
  }
}

/** A new document: the service as the first line, the owner's remembered terms, nothing priced for them. */
export function initialFormState(input: {
  serviceName: string | null;
  scheduledFor: string;
  assignedTo: string;
  defaults: DocumentDefaults;
}): DocumentFormState {
  return {
    kind: "estimate",
    lines: [{ ...blankLine(), description: clip(input.serviceName ?? "", LIMITS.description) }],
    taxRate: input.defaults.taxRate,
    validDays: input.defaults.validDays,
    showPrices: false,
    jobSite: "",
    scheduledFor: input.scheduledFor,
    assignedTo: input.assignedTo,
    notes: "",
    terms: input.defaults.terms,
  };
}
