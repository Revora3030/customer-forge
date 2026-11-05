/**
 * COMP-9 · Trade starter snapshots (pure core).
 *
 * A snapshot is a finished, QA-passed site in one trade with every business-specific fact removed, so the next build
 * in that trade can start from a proven layout instead of a blank page. Two pure jobs:
 *
 *  1. `buildTradeSnapshot(source)`: copies pages and sections, swaps the source business's own name, phone, email,
 *     address, city and hours for tokens, drops reviews, testimonials and team sections, removes every image, link
 *     and contact key, and rewrites any leftover phone, email, price, rating, review count, years, award or licence
 *     claim. It then scans its own output and THROWS `SnapshotLeakError` if anything of the source is still there, so
 *     a leaking snapshot can never be returned.
 *  2. `instantiateSnapshot(snapshot, intake)`: fills the tokens from the NEW owner's intake through `ownerFillPlan`.
 *     A fact the owner did not give becomes the visible "[Add your ...]" marker, never an invented value.
 *
 * No storage, network or environment here. Saving a snapshot and starting a build from one are wired separately.
 */
import {
  findInventedFacts,
  ownerFillPlan,
  type IntakeFacts,
  type TextPart,
} from "@/lib/builder/quality/facts-guard";

export const SNAPSHOT_TOKENS = {
  businessName: "{{business_name}}",
  phone: "{{phone}}",
  email: "{{email}}",
  address: "{{address}}",
  city: "{{city}}",
  hours: "{{hours}}",
} as const;

export type SnapshotSourcePage = {
  kind: string;
  slug: string;
  title: string;
  sort_order?: number;
  seo_title?: string | null;
  seo_description?: string | null;
  /** Anything else on the page row (og image, canonical, ids) is ignored. */
  [extra: string]: unknown;
};

export type SnapshotSourceSection = {
  pageSlug: string;
  kind: string;
  variant?: string;
  sort_order?: number;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  settings?: unknown;
  [extra: string]: unknown;
};

export type SnapshotSourceFacts = {
  businessName?: string | null;
  ownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  hours?: string | null;
};

export type SnapshotPage = {
  kind: string;
  slug: string;
  title: string;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
};
export type SnapshotSection = {
  pageSlug: string;
  kind: string;
  variant: string;
  sort_order: number;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  settings: unknown;
};

export type TradeSnapshot = {
  version: 1;
  trade: string;
  pages: SnapshotPage[];
  sections: SnapshotSection[];
  /** What was removed, for the admin to see. Counts only, never the removed text. */
  removed: { sections: number; keys: number; strings: number };
};

export class SnapshotLeakError extends Error {
  readonly leaks: string[];
  constructor(leaks: string[]) {
    super(`Snapshot still contains source-site facts: ${leaks.slice(0, 5).join("; ")}`);
    this.name = "SnapshotLeakError";
    this.leaks = leaks;
  }
}

/** Sections that show real people, real reviews or the owner's own credentials are not reusable. */
const DROPPED_SECTION_KIND =
  /review|testimonial|team|staff|owner|meet[-_ ]?the|credential|certif|award|badge/i;

/** Keys that hold images, links, contact details or other per-business data. */
const STRIPPED_KEY =
  /^(?:image|images|img|src|srcset|poster|video|videoUrl|photo|photos|logo|favicon|avatar|thumbnail|thumb|background|backgroundImage|bgImage|alt|caption|url|link|embed|map|mapUrl|placeId|lat|lng|latitude|longitude|phone|tel|telephone|email|mailto|address|hours|openingHours|reviewer|author|authorName|rating|ratingValue|reviewCount|license|licence|licenseNumber)$/i;

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s"'<>)]+/gi;
const EXTERNAL_HREF = /^(?:https?:|\/\/|tel:|mailto:|sms:)/i;

const PRICE_MARKER = "[Add your price]";
const DETAILS_MARKER = "[Add your details]";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const digits = (s: string) => s.replace(/\D/g, "");

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

type Replacer = { re: RegExp; token: string };

function buildReplacers(facts: SnapshotSourceFacts): Replacer[] {
  const out: Replacer[] = [];
  const addText = (value: string | null | undefined, token: string, minLen = 3) => {
    const v = norm(value);
    if (v.length < minLen) return;
    out.push({ re: new RegExp(escapeRe(v).replace(/\\? /g, "\\s+"), "gi"), token });
  };
  // Longest facts first so "Joe's Plumbing LLC" is replaced before "Joe's".
  addText(facts.address, SNAPSHOT_TOKENS.address);
  addText(facts.hours, SNAPSHOT_TOKENS.hours);
  addText(facts.businessName, SNAPSHOT_TOKENS.businessName);
  addText(facts.ownerName, SNAPSHOT_TOKENS.businessName);
  addText(facts.email, SNAPSHOT_TOKENS.email, 5);
  const phone = digits(facts.phone ?? "").slice(-10);
  if (phone.length === 10) {
    const [a, b, c] = [phone.slice(0, 3), phone.slice(3, 6), phone.slice(6)];
    out.push({
      re: new RegExp(`(?:\\+?1[\\s.-]?)?\\(?${a}\\)?[\\s.-]?${b}[\\s.-]?${c}`, "g"),
      token: SNAPSHOT_TOKENS.phone,
    });
  }
  addText(facts.city, SNAPSHOT_TOKENS.city);
  return out.sort((x, y) => y.re.source.length - x.re.source.length);
}

type Counters = { keys: number; strings: number };

function scrubString(raw: string, replacers: readonly Replacer[], counters: Counters): string {
  let s = raw;
  for (const r of replacers) s = s.replace(r.re, r.token);
  s = s.replace(URL_PATTERN, () => {
    counters.strings += 1;
    return "";
  });

  // Anything the generic fact scan still sees is rewritten. Phones, emails and prices inline; claims drop the string.
  const violations = findInventedFacts([{ id: "s", text: s }], {});
  for (const v of violations) {
    if (v.kind === "phone" || v.kind === "fake_phone")
      s = s.split(v.match).join(SNAPSHOT_TOKENS.phone);
    else if (v.kind === "email" || v.kind === "example_email")
      s = s.split(v.match).join(SNAPSHOT_TOKENS.email);
    else if (v.kind === "price") s = s.split(v.match).join(PRICE_MARKER);
    else {
      counters.strings += 1;
      return DETAILS_MARKER;
    }
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

function scrubValue(
  value: unknown,
  replacers: readonly Replacer[],
  counters: Counters,
  key?: string,
): unknown {
  if (typeof value === "string") {
    if (key && /^(?:href|to|target)$/i.test(key))
      return EXTERNAL_HREF.test(value.trim()) ? undefined : value;
    return scrubString(value, replacers, counters);
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, replacers, counters)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRIPPED_KEY.test(k)) {
        counters.keys += 1;
        continue;
      }
      const cleaned = scrubValue(v, replacers, counters, k);
      if (cleaned === undefined) {
        counters.keys += 1;
        continue;
      }
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}

function sectionText(parts: TextPart[], id: string, value: unknown): void {
  if (typeof value === "string") parts.push({ id, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => sectionText(parts, `${id}[${i}]`, v));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) sectionText(parts, `${id}.${k}`, v);
}

function collectKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => collectKeys(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (STRIPPED_KEY.test(k)) out.push(`${path}.${k}`);
      collectKeys(v, `${path}.${k}`, out);
    }
  }
}

/** Every way the source business can still be recognised in a snapshot. Empty means clean. */
export function findSnapshotLeaks(snapshot: TradeSnapshot, facts: SnapshotSourceFacts): string[] {
  const leaks: string[] = [];
  const parts: TextPart[] = [];
  snapshot.pages.forEach((p, i) => {
    sectionText(parts, `page[${i}].title`, p.title);
    sectionText(parts, `page[${i}].seo_title`, p.seo_title);
    sectionText(parts, `page[${i}].seo_description`, p.seo_description);
  });
  snapshot.sections.forEach((s, i) => {
    for (const f of ["heading", "subheading", "body", "settings"] as const)
      sectionText(parts, `section[${i}].${f}`, s[f]);
    collectKeys(s.settings, `section[${i}].settings`, leaks);
  });
  for (const v of findInventedFacts(parts, {})) leaks.push(`${v.kind} in ${v.partId}: ${v.match}`);

  const haystack = parts.map((p) => p.text).join("\n");
  const lowerHay = haystack.toLowerCase();
  for (const [label, value] of [
    ["business name", facts.businessName],
    ["owner name", facts.ownerName],
    ["address", facts.address],
    ["hours", facts.hours],
    ["city", facts.city],
    ["email", facts.email],
  ] as const) {
    const v = norm(value).toLowerCase();
    if (v.length >= 3 && lowerHay.includes(v)) leaks.push(`${label} still present`);
  }
  const phone = digits(facts.phone ?? "").slice(-10);
  if (phone.length === 10 && digits(haystack).includes(phone)) leaks.push("phone still present");
  if (URL_PATTERN.test(haystack)) leaks.push("url still present");
  URL_PATTERN.lastIndex = 0;
  return leaks;
}

export function buildTradeSnapshot(source: {
  trade: string;
  pages: readonly SnapshotSourcePage[];
  sections: readonly SnapshotSourceSection[];
  facts: SnapshotSourceFacts;
}): TradeSnapshot {
  const replacers = buildReplacers(source.facts);
  const counters: Counters = { keys: 0, strings: 0 };
  const clean = (v: string | null | undefined): string | null => {
    const t = norm(v);
    return t ? scrubString(t, replacers, counters) : null;
  };

  const pages: SnapshotPage[] = source.pages.map((p, i) => ({
    kind: p.kind,
    slug: p.slug,
    title: clean(p.title) ?? p.slug,
    sort_order: p.sort_order ?? i,
    seo_title: clean(p.seo_title),
    seo_description: clean(p.seo_description),
  }));

  let droppedSections = 0;
  const sections: SnapshotSection[] = [];
  source.sections.forEach((s, i) => {
    if (DROPPED_SECTION_KIND.test(s.kind)) {
      droppedSections += 1;
      return;
    }
    sections.push({
      pageSlug: s.pageSlug,
      kind: s.kind,
      variant: s.variant ?? "default",
      sort_order: s.sort_order ?? i,
      heading: clean(s.heading),
      subheading: clean(s.subheading),
      body: clean(s.body),
      settings: scrubValue(s.settings ?? {}, replacers, counters) ?? {},
    });
  });

  const snapshot: TradeSnapshot = {
    version: 1,
    trade: norm(source.trade).toLowerCase(),
    pages,
    sections,
    removed: { sections: droppedSections, keys: counters.keys, strings: counters.strings },
  };
  const leaks = findSnapshotLeaks(snapshot, source.facts);
  if (leaks.length > 0) throw new SnapshotLeakError(leaks);
  return snapshot;
}

function fillString(value: string, map: Record<string, string>): string {
  let s = value;
  for (const [token, replacement] of Object.entries(map)) s = s.split(token).join(replacement);
  return s;
}

function fillValue(value: unknown, map: Record<string, string>): unknown {
  if (typeof value === "string") return fillString(value, map);
  if (Array.isArray(value)) return value.map((v) => fillValue(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fillValue(v, map)]),
    );
  }
  return value;
}

/**
 * Fills a snapshot for a new owner. Real values only from the owner's intake; a missing fact becomes its
 * "[Add your ...]" marker. The result is what a new build may start from; facts-guard still scans the finished build.
 */
export function instantiateSnapshot(
  snapshot: TradeSnapshot,
  intake: IntakeFacts,
): { pages: SnapshotPage[]; sections: SnapshotSection[]; missing: string[] } {
  const plan = ownerFillPlan(intake);
  const map: Record<string, string> = {
    [SNAPSHOT_TOKENS.businessName]: plan.display.businessName,
    [SNAPSHOT_TOKENS.phone]: plan.display.phone,
    [SNAPSHOT_TOKENS.email]: plan.display.email,
    [SNAPSHOT_TOKENS.address]: plan.display.address,
    [SNAPSHOT_TOKENS.city]: norm(intake.city) || plan.display.serviceArea,
    [SNAPSHOT_TOKENS.hours]: plan.display.hours,
  };
  const fillText = (v: string | null) => (v === null ? null : fillString(v, map));
  return {
    pages: snapshot.pages.map((p) => ({
      ...p,
      title: fillString(p.title, map),
      seo_title: fillText(p.seo_title),
      seo_description: fillText(p.seo_description),
    })),
    sections: snapshot.sections.map((s) => ({
      ...s,
      heading: fillText(s.heading),
      subheading: fillText(s.subheading),
      body: fillText(s.body),
      settings: fillValue(s.settings, map),
    })),
    missing: plan.flags.map((f) => f.field),
  };
}
