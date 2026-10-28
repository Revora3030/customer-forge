/**
 * Customer CSV import: reads a spreadsheet the owner exports from their old tool, maps its columns to the
 * customer fields, and says exactly what would be added and what would be skipped and why. Nothing here
 * guesses a missing fact, claims anyone has agreed to be contacted, or sends anything.
 */
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 1_000_000;

export type ImportField = "name" | "firstName" | "lastName" | "email" | "phone" | "lastVisit" | "address";
export const IMPORT_FIELDS: { field: ImportField; label: string }[] = [
  { field: "name", label: "Full name" },
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "lastVisit", label: "Last visit or job date" },
  { field: "address", label: "Address" },
];

/** Column index per field; -1 means "not in this file". */
export type ColumnMapping = Record<ImportField, number>;

/** RFC 4180-style parser: quoted fields, doubled quotes, commas and newlines inside quotes, BOM, comma/semicolon/tab. */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // byte-order mark
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADER_HINTS: Record<ImportField, string[]> = {
  name: ["name", "fullname", "customername", "customer", "clientname", "client", "contactname", "contact"],
  firstName: ["firstname", "first", "givenname", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  email: ["email", "emailaddress", "mail", "primaryemail", "customeremail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "telephone", "tel", "primaryphone"],
  lastVisit: ["lastvisit", "lastjob", "lastservice", "lastserviced", "lastappointment", "lastjobdate", "lastservicedate", "lastactivity", "lastcontact", "servicedate", "jobdate", "date"],
  address: ["address", "streetaddress", "street", "address1", "serviceaddress", "location"],
};

/** Picks a column for each field from its header, each column used once. Unmatched fields stay -1 for the owner to set. */
export function detectMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = { name: -1, firstName: -1, lastName: -1, email: -1, phone: -1, lastVisit: -1, address: -1 };
  const used = new Set<number>();
  const normalised = headers.map(norm);
  for (const { field } of IMPORT_FIELDS) {
    for (const hint of HEADER_HINTS[field]) {
      const index = normalised.findIndex((header, i) => !used.has(i) && header === hint);
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const phoneDigits = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};
export const validPhone = (value: string) => phoneDigits(value).length === 10;

/** ISO yyyy-mm-dd or US m/d/yyyy. Future, impossible or unreadable dates give null. */
export function parseVisitDate(value: string, now: Date): string | null {
  const text = value.trim();
  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number];
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text))) {
    [month, day] = [Number(match[1]), Number(match[2])] as [number, number];
    const y = Number(match[3]);
    year = match[3]!.length === 2 ? 2000 + y : y;
  } else return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1990 || date.getTime() > now.getTime()) return null;
  return date.toISOString();
}

export type ImportRow = { name: string; email: string | null; phone: string | null; address: string | null; last_appointment_at: string | null };
export type SkipReason = "no_name" | "no_contact" | "duplicate_in_file" | "already_customer";
export const SKIP_LABELS: Record<SkipReason, string> = {
  no_name: "no name",
  no_contact: "no valid email or phone",
  duplicate_in_file: "repeated in this file",
  already_customer: "already in your customers",
};

export type ImportPlan = {
  ready: ImportRow[];
  skipped: { line: number; reason: SkipReason }[];
  /** Rows past the limit, never read. */
  overLimit: number;
  /** Dates that were present but unreadable; those rows are still imported without a date. */
  unreadableDates: number;
};

const clip = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

export function buildImport(input: {
  rows: readonly (readonly string[])[];
  mapping: ColumnMapping;
  existing: readonly { email: string | null; phone: string | null }[];
  now?: Date;
}): ImportPlan {
  const now = input.now ?? new Date();
  const emails = new Set(input.existing.map((c) => (c.email ? normalizeEmail(c.email) : "")).filter(Boolean));
  const phones = new Set(input.existing.map((c) => (c.phone ? phoneDigits(c.phone) : "")).filter((p) => p.length === 10));
  const cell = (row: readonly string[], field: ImportField) => (input.mapping[field] >= 0 ? (row[input.mapping[field]] ?? "") : "");
  const body = input.rows.slice(0, MAX_IMPORT_ROWS);
  const plan: ImportPlan = { ready: [], skipped: [], overLimit: Math.max(0, input.rows.length - MAX_IMPORT_ROWS), unreadableDates: 0 };

  body.forEach((row, index) => {
    const line = index + 2; // header is line 1
    const full = clip(cell(row, "name"), 120);
    const name = full || clip(`${cell(row, "firstName")} ${cell(row, "lastName")}`, 120);
    const rawEmail = normalizeEmail(cell(row, "email"));
    const email = EMAIL.test(rawEmail) ? rawEmail.slice(0, 200) : null;
    const rawPhone = clip(cell(row, "phone"), 40);
    const phone = validPhone(rawPhone) ? rawPhone : null;
    if (!name) return void plan.skipped.push({ line, reason: "no_name" });
    if (!email && !phone) return void plan.skipped.push({ line, reason: "no_contact" });
    if ((email && emails.has(email)) || (phone && phones.has(phoneDigits(phone)))) {
      const inFile = plan.ready.some((r) => (email && r.email === email) || (phone && r.phone && phoneDigits(r.phone) === phoneDigits(phone)));
      return void plan.skipped.push({ line, reason: inFile ? "duplicate_in_file" : "already_customer" });
    }
    const rawDate = cell(row, "lastVisit").trim();
    const last = rawDate ? parseVisitDate(rawDate, now) : null;
    if (rawDate && !last) plan.unreadableDates += 1;
    if (email) emails.add(email);
    if (phone) phones.add(phoneDigits(phone));
    plan.ready.push({ name, email, phone, address: clip(cell(row, "address"), 200) || null, last_appointment_at: last });
  });
  return plan;
}

export const importTags = (now: Date) => ["Imported", `import:${now.toISOString().slice(0, 10)}`];
