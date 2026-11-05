/**
 * LOV-4: the pure rules for the visitor-side error feed on published sites.
 *
 * What is collected: the KIND of problem (js error, failed form submit, broken
 * image), a scrubbed one-line message and the page path. What never is: IP
 * address, cookies, visitor id, form field values, query strings, emails,
 * phone numbers or long digit runs. Rows are counted per site per day.
 */
export const VISITOR_ERROR_KINDS = ["js", "form", "image"] as const;
export type VisitorErrorKind = (typeof VISITOR_ERROR_KINDS)[number];

export const VISITOR_ERROR_RETENTION_DAYS = 30;
export const MAX_VISITOR_ERROR_BYTES = 1_024;
/** Per site + edge IP, per minute. Reuses the shape of client-error-rate-limit.ts. */
export const VISITOR_ERROR_RATE_LIMIT = 20;
/** Distinct messages stored per site per day (mirrored in record_visitor_error). */
export const MAX_DISTINCT_PER_DAY = 200;

export type VisitorErrorReport = { organizationId: string; kind: VisitorErrorKind; message: string; path: string };

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips anything personal and bounds the length. */
export function scrubVisitorMessage(raw: string): string {
  return raw
    .replace(/https?:\/\/[^\s"')]+/gi, (url) => url.split(/[?#]/)[0] ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Path only: no query, no hash, no personal-looking segments. */
export function scrubVisitorPath(raw: string): string {
  const path = (raw.split(/[?#]/)[0] ?? "").trim();
  if (!path.startsWith("/")) return "/";
  return scrubVisitorMessage(path).slice(0, 200) || "/";
}

/** Short stable hash (two 32-bit FNV-style rounds) used to group the same message. */
export function visitorErrorHash(kind: string, message: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const text = `${kind}|${message.toLowerCase()}`;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Validates one report body. Null for anything malformed. */
export function parseVisitorError(raw: unknown): VisitorErrorReport | null {
  let value = raw;
  if (typeof value === "string") {
    if (value.length > MAX_VISITOR_ERROR_BYTES) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const org = typeof row["o"] === "string" ? row["o"] : "";
  if (!ORG_ID.test(org)) return null;
  const kind = typeof row["k"] === "string" ? row["k"] : "";
  if (!(VISITOR_ERROR_KINDS as readonly string[]).includes(kind)) return null;
  const message = typeof row["m"] === "string" ? scrubVisitorMessage(row["m"]) : "";
  if (!message) return null;
  const path = scrubVisitorPath(typeof row["p"] === "string" ? row["p"] : "/");
  return { organizationId: org.toLowerCase(), kind: kind as VisitorErrorKind, message, path };
}

export type VisitorErrorRow = {
  day: string;
  kind: VisitorErrorKind;
  message_hash: string;
  message: string;
  page_path: string;
  occurrences: number;
  last_seen: string;
};
export type VisitorErrorGroup = { hash: string; kind: VisitorErrorKind; message: string; pagePath: string; total: number; today: number; lastSeen: string };

/** Groups daily rows by message, newest and busiest first. */
export function groupVisitorErrors(rows: readonly VisitorErrorRow[], today: string, limit = 10): VisitorErrorGroup[] {
  const byKey = new Map<string, VisitorErrorGroup>();
  for (const row of rows) {
    const key = `${row.kind}|${row.message_hash}`;
    const group = byKey.get(key) ?? { hash: row.message_hash, kind: row.kind, message: row.message, pagePath: row.page_path, total: 0, today: 0, lastSeen: row.last_seen };
    group.total += row.occurrences;
    if (row.day === today) group.today += row.occurrences;
    if (row.last_seen > group.lastSeen) group.lastSeen = row.last_seen;
    byKey.set(key, group);
  }
  return [...byKey.values()].sort((a, b) => b.today - a.today || b.total - a.total || (a.lastSeen < b.lastSeen ? 1 : -1)).slice(0, limit);
}

/**
 * A spike LOV-3 can turn into a finding: a message today well above its own
 * recent daily average. A brand-new message needs at least `minNew` hits.
 */
export function visitorErrorSpikes(rows: readonly VisitorErrorRow[], today: string, opts: { minNew?: number; factor?: number } = {}): VisitorErrorGroup[] {
  const minNew = opts.minNew ?? 5;
  const factor = opts.factor ?? 3;
  return groupVisitorErrors(rows, today, 50).filter((g) => {
    const earlier = g.total - g.today;
    if (g.today < minNew) return false;
    if (earlier === 0) return true;
    const days = new Set(rows.filter((r) => r.message_hash === g.hash && r.kind === g.kind && r.day !== today).map((r) => r.day)).size || 1;
    return g.today >= factor * (earlier / days);
  });
}

export const VISITOR_ERROR_KIND_LABEL: Record<VisitorErrorKind, string> = {
  js: "Page error",
  form: "Form didn't send",
  image: "Picture didn't load",
};
