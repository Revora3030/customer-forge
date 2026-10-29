/**
 * Lead import contract (pure). A CSV of leads someone else collected (the Grok
 * bots' Google Sheet, exported) becomes review-queue rows. Nothing here
 * contacts anyone, and nothing in a row is ever used as an instruction: the
 * notes and source columns are stored and shown as plain text only.
 *
 * A row is kept only when it names a business in a city and gives a way to
 * reach it that the platform can check: a public email or a website.
 */
import { nameCityKey, phoneKey, usPhoneE164 } from "./prospect-autopilot";
import { webPresence } from "./prospect-finder";

export const MAX_IMPORT_CHARS = 400_000;
export const MAX_IMPORT_ROWS = 300;
export const MAX_PENDING_LEADS = 1_000;

export type LeadField =
  | "contactName" | "businessName" | "location" | "city" | "state" | "category"
  | "phone" | "email" | "website" | "source" | "score" | "notes";

/** The columns a sheet may use, in the order the bots write them. Header order never matters. */
export const LEAD_COLUMNS_HELP =
  "Business / Title, Location (City, ST), Email, Website, Category, Phone, Name, Source, Qualification Score (1-10), Notes";

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);

export type LeadRejectReason =
  | "missing_business"
  | "missing_city"
  | "missing_category"
  | "no_email_or_website"
  | "duplicate_in_file"
  | "already_queued"
  | "already_demoed"
  | "already_contacted"
  | "do_not_contact";

export const LEAD_REASON_LABELS: Record<LeadRejectReason, string> = {
  missing_business: "No business name",
  missing_city: "No city (use \"City, ST\" in Location)",
  missing_category: "No trade or category (add a Category column or fill in the batch trade)",
  no_email_or_website: "No public email or website to check",
  duplicate_in_file: "Listed twice in this file",
  already_queued: "Already in the review queue",
  already_demoed: "A demo for this business already exists",
  already_contacted: "Already contacted",
  do_not_contact: "On the do-not-contact list",
};

export type ImportedLead = {
  businessName: string;
  contactName: string | null;
  category: string | null;
  city: string;
  state: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  nameKey: string;
  phoneKey: string | null;
  /** Host of a real website (never a social or directory page), for duplicate checks. */
  siteHost: string | null;
};

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** RFC 4180 style: quoted fields, doubled quotes, CRLF, embedded newlines, a leading byte-order mark. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") endCell();
    else if (char === "\n") endRow();
    else if (char === "\r") { if (text[i + 1] === "\n") i += 1; endRow(); }
    else cell += char;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

const HEADER_RULES: [LeadField, (key: string) => boolean][] = [
  ["businessName", (k) => ["businesstitle", "business", "businessname", "company", "companyname"].includes(k)],
  ["contactName", (k) => ["name", "contact", "contactname", "owner", "ownername"].includes(k)],
  ["city", (k) => k === "city"],
  ["state", (k) => k === "state"],
  ["location", (k) => k === "location" || k === "address"],
  ["category", (k) => ["category", "industry", "trade", "niche", "businesstype", "type"].includes(k)],
  ["phone", (k) => ["phone", "phonenumber", "telephone", "tel", "mobile"].includes(k)],
  ["email", (k) => ["email", "emailaddress", "publicemail"].includes(k)],
  ["website", (k) => ["website", "websiteurl", "url", "site", "web"].includes(k)],
  ["source", (k) => k === "source" || k === "sourceurl"],
  ["score", (k) => k.includes("score")],
  ["notes", (k) => k.includes("notes") || k.includes("whyqualified")],
];

/** Column index -> field, from the header row. Unknown columns (a timestamp) are ignored. */
export function mapHeaders(header: readonly string[]): Map<number, LeadField> {
  const fields = new Map<number, LeadField>();
  const taken = new Set<LeadField>();
  header.forEach((title, index) => {
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const rule = HEADER_RULES.find(([field, matches]) => !taken.has(field) && matches(key));
    if (rule) { fields.set(index, rule[0]); taken.add(rule[0]); }
  });
  return fields;
}

/** Plain single-line text: control characters dropped, whitespace collapsed, length capped. */
export function cleanText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex -- strips control characters from untrusted input
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** City, state and any street address from "123 Main St, Raleigh, NC 27601", "Raleigh, NC" or "Raleigh NC". */
export function parseLocation(value: string): { city: string | null; state: string | null; address: string | null } {
  const text = cleanText(value, 200);
  if (!text) return { city: null, state: null, address: null };
  const comma = /^(?:(.*?),\s*)?([^,]+?),\s*([A-Za-z]{2})\.?(?:\s+\d{5}(?:-\d{4})?)?$/.exec(text);
  const space = /^(.+?)\s+([A-Za-z]{2})\.?(?:\s+\d{5}(?:-\d{4})?)?$/.exec(text);
  const match = comma ?? (space ? [space[0], undefined, space[1], space[2]] : null);
  if (match && US_STATE_CODES.has(String(match[3]).toUpperCase())) {
    const city = cleanText(match[2], 80);
    if (city.length >= 2 && !/^\d/.test(city)) return { city, state: String(match[3]).toUpperCase(), address: match[1] ? cleanText(match[1], 160) || null : null };
  }
  const first = cleanText(text.split(",")[0], 80);
  return { city: first.length >= 2 && !/\d/.test(first) ? first : null, state: null, address: null };
}

/** An http(s) address with a real host, trimmed to its origin and path; null for anything else. */
export function normalizeWebsite(value: string): string | null {
  const raw = cleanText(value, 300);
  if (!raw || /\s/.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host)) return null; // a host needs a dot and a letters-only ending, which also refuses single-label and IP hosts
    return `${url.protocol}//${host}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`.slice(0, 200);
  } catch {
    return null;
  }
}

function normalizeEmail(value: string): string | null {
  const email = cleanText(value, 160).toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/.test(email) ? email : null;
}

function cellOf(cells: readonly string[], fields: Map<number, LeadField>, field: LeadField): string {
  for (const [index, name] of fields) if (name === field) return cells[index] ?? "";
  return "";
}

export type RowResult = { lead: ImportedLead } | { reason: LeadRejectReason; name: string };

/** One CSV row as a lead, or the reason it cannot be one. `defaults.category` fills a missing Category. */
export function normalizeLeadRow(cells: readonly string[], fields: Map<number, LeadField>, defaults: { category: string | null }): RowResult {
  const get = (field: LeadField) => cellOf(cells, fields, field);
  const businessName = cleanText(get("businessName"), 120);
  if (businessName.length < 2) return { reason: "missing_business", name: businessName || "(no name)" };

  const located = parseLocation(get("location"));
  const city = cleanText(get("city"), 80) || located.city;
  const stateColumn = cleanText(get("state"), 2).toUpperCase();
  const state = (US_STATE_CODES.has(stateColumn) ? stateColumn : null) ?? located.state;
  if (!city || city.length < 2) return { reason: "missing_city", name: businessName };

  const category = cleanText(get("category"), 80) || defaults.category;
  if (!category || category.length < 3) return { reason: "missing_category", name: businessName };

  const email = normalizeEmail(get("email"));
  const website = normalizeWebsite(get("website"));
  if (!email && !website) return { reason: "no_email_or_website", name: businessName };

  const phone = cleanText(get("phone"), 40) || null;
  const rawScore = Number.parseFloat(cleanText(get("score"), 12));
  return {
    lead: {
      businessName,
      contactName: cleanText(get("contactName"), 80) || null,
      category,
      city,
      state,
      address: located.address,
      phone: phone && phone.replace(/\D/g, "").length >= 7 ? phone : null,
      email,
      website,
      source: cleanText(get("source"), 200) || null,
      score: Number.isFinite(rawScore) ? Math.min(10, Math.max(1, Math.round(rawScore))) : null,
      notes: cleanText(get("notes"), 500) || null,
      nameKey: nameCityKey(businessName, city),
      phoneKey: phoneKey(phone) || null,
      siteHost: website && webPresence(website) === "has_website" ? new URL(website).hostname.replace(/^www\./, "") : null,
    },
  };
}

/** The contacts a lead can be blocked or deduplicated by, in the form the do-not-contact list keys on. */
export function leadContacts(lead: Pick<ImportedLead, "email" | "phone">): string[] {
  const phone = usPhoneE164(lead.phone);
  return [lead.email, phone].filter((value): value is string => Boolean(value));
}

/** "http(s)://" link from the Source column, or null when it is just a label like "Google Maps". */
export function sourceLink(source: string | null | undefined): string | null {
  return source && /^https?:\/\/\S+$/i.test(source) ? source.slice(0, 300) : null;
}

export type ParsedImport =
  | { ok: false; message: string }
  | { ok: true; rows: string[][]; fields: Map<number, LeadField>; truncated: boolean };

/** Header + data rows from CSV text, with the limits a single import accepts. */
export function readImport(csv: string): ParsedImport {
  if (!csv.trim()) return { ok: false, message: "Choose a CSV file or paste its rows first." };
  if (csv.length > MAX_IMPORT_CHARS) return { ok: false, message: "That file is too large. Import up to 300 leads at a time." };
  const table = parseCsv(csv);
  const header = table[0] ?? [];
  const fields = mapHeaders(header);
  if (![...fields.values()].includes("businessName"))
    return { ok: false, message: `The first row must name its columns. Needed: a Business column. Accepted: ${LEAD_COLUMNS_HELP}.` };
  const rows = table.slice(1);
  if (!rows.length) return { ok: false, message: "The file has a header row but no leads." };
  return { ok: true, rows: rows.slice(0, MAX_IMPORT_ROWS), fields, truncated: rows.length > MAX_IMPORT_ROWS };
}

/** What the owner sees for a lead waiting in the queue. */
export type QueueLead = {
  id: string;
  businessName: string;
  contactName: string | null;
  category: string | null;
  city: string;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  status: "pending" | "releasing" | "blocked";
  /** Why the last attempt to release it stopped, as a short code (see blockLabel). */
  problem: string | null;
  createdAt: string;
};

export type ImportSummary = {
  batchId: string;
  read: number;
  added: number;
  truncated: boolean;
  skipped: { row: number; name: string; label: string }[];
  skippedCount: number;
};

export type ReviewResult = {
  released: number;
  rejected: number;
  blocked: { id: string; name: string; label: string }[];
  /** Leads left in the queue because today's limit was reached. */
  waiting: number;
  message: string;
};

/** Plain words for the short codes release stops with. Unknown codes are shown as written, never hidden. */
export function blockLabel(code: string | null | undefined): string {
  const text = (code ?? "").trim();
  if (!text) return "";
  const [head, ...rest] = text.split(":");
  const detail = rest.join(":").trim();
  switch (head) {
    case "do_not_contact": return "On the do-not-contact list";
    case "already_demoed": return "A demo for this business already exists";
    case "website_has_no_verified_gaps": return "Its website has no verified problems worth pitching";
    case "website_unchecked": return "Its website could not be checked, so it was not pitched";
    case "no_public_email": return "No public email that passes the checks";
    case "email_rejected": return `Email not usable${detail ? ` (${detail.replace(/_/g, " ")})` : ""}`;
    case "invalid_facts": return `Details missing${detail ? `: ${detail}` : ""}`;
    case "build_failed": return `Could not create the demo${detail ? `: ${detail}` : ""}. It is still in the queue to try again.`;
    default: return text;
  }
}
