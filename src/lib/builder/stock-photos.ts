/**
 * FREE STOCK PHOTO SOURCING — pure model
 * ======================================
 *
 * The builder can offer real photography for a site that has none, sourced from
 * openly licensed libraries (Openverse, which indexes Flickr, Wikimedia and
 * others). No API key, no paid provider.
 *
 * Rules this module enforces, so a site can never be shipped with a picture the
 * business is not allowed to use:
 *  - only licences that allow commercial use are ever returned;
 *  - "no derivatives" licences are dropped, because the builder crops and
 *    resizes pictures;
 *  - the licence, its link, the creator and the exact credit line are carried
 *    with every picture and recorded when it is saved;
 *  - nothing is invented — if the library does not state a licence, the picture
 *    is discarded rather than guessed at.
 */

export type StockPhoto = {
  id: string;
  title: string;
  /** Full-size image address. */
  url: string;
  /** Small preview address (may equal `url`). */
  thumbnail: string;
  provider: string;
  creator: string | null;
  /** Licence code as published by the library, e.g. "cc0", "by", "by-sa". */
  licenseCode: string;
  licenseUrl: string | null;
  /** Exact credit line required by the licence. */
  attribution: string;
  /** Page the picture lives on, for checking the source. */
  sourcePage: string | null;
  width: number | null;
  height: number | null;
};

/** Licences that forbid commercial use or forbid cropping/resizing. */
const BLOCKED_LICENCE_PARTS = ["nc", "nd"];

/** Licences that need no credit line, though we still record one. */
const NO_CREDIT_REQUIRED = new Set(["cc0", "pdm", "publicdomain"]);

export function licenceAllowsBusinessUse(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const clean = code.trim().toLowerCase();
  if (!clean) return false;
  const parts = clean.split(/[-\s]+/);
  return !parts.some((part) => BLOCKED_LICENCE_PARTS.includes(part));
}

export function requiresCredit(code: string): boolean {
  return !NO_CREDIT_REQUIRED.has(code.trim().toLowerCase());
}

/** Plain-language licence line an owner can read. */
export function licenceLine(photo: Pick<StockPhoto, "creator" | "licenseCode" | "provider">): string {
  const who = photo.creator?.trim() || "an unnamed photographer";
  const code = photo.licenseCode.trim().toUpperCase();
  const label = NO_CREDIT_REQUIRED.has(photo.licenseCode.trim().toLowerCase())
    ? `public domain (${code})`
    : `Creative Commons ${code} — the credit line must stay on your site`;
  return `By ${who} on ${photo.provider}, ${label}.`;
}

/** Builds a search phrase from what the owner typed plus their trade. */
export function buildStockQuery(topic: string, industry?: string | null): string {
  const clean = topic.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const trade = (industry ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const phrase = clean || trade;
  if (!phrase) return "";
  if (clean && trade && !clean.toLowerCase().includes(trade.toLowerCase())) {
    return `${clean} ${trade}`.slice(0, 120);
  }
  return phrase.slice(0, 120);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function size(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function isHttps(value: string | null): value is string {
  return !!value && /^https:\/\//i.test(value);
}

/**
 * Turns a library response into pictures we are allowed to use. Anything with a
 * missing licence, a missing address or a non-https address is dropped.
 */
export function normaliseStockResults(raw: unknown): StockPhoto[] {
  const results = (raw && typeof raw === "object" ? (raw as { results?: unknown }).results : null);
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: StockPhoto[] = [];

  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const url = text(row["url"]);
    const licenseCode = text(row["license"])?.toLowerCase() ?? null;
    if (!isHttps(url) || !licenseCode) continue;
    if (!licenceAllowsBusinessUse(licenseCode)) continue;

    const id = text(row["id"]) ?? url;
    if (seen.has(url) || seen.has(id)) continue;
    seen.add(url);
    seen.add(id);

    const provider = text(row["provider"]) ?? text(row["source"]) ?? "openverse";
    const creator = text(row["creator"]);
    const licenseUrl = text(row["license_url"]);
    const thumbnail = text(row["thumbnail"]);
    const version = text(row["license_version"]);
    const title = text(row["title"]) ?? "Untitled photograph";

    out.push({
      id,
      title: title.slice(0, 160),
      url,
      thumbnail: isHttps(thumbnail) ? thumbnail : url,
      provider,
      creator,
      licenseCode,
      licenseUrl,
      attribution:
        text(row["attribution"]) ??
        `"${title}" by ${creator ?? "unknown"} is licensed under CC ${licenseCode.toUpperCase()}${version ? ` ${version}` : ""}.`,
      sourcePage: text(row["foreign_landing_url"]),
      width: size(row["width"]),
      height: size(row["height"]),
    });
  }

  return out;
}

export type StockMediaRow = {
  url: string;
  alt_text: string;
  category: string;
  file_name: string;
  source: string;
  source_page: string | null;
  license: string;
  license_url: string | null;
  attribution: string;
  creator: string | null;
};

/** The photo-library row for a chosen picture, licence and credit included. */
export function stockMediaRow(photo: StockPhoto, altText?: string | null): StockMediaRow {
  const alt = (altText ?? photo.title).trim().slice(0, 200) || "Photograph";
  return {
    url: photo.url,
    alt_text: alt,
    category: "work",
    file_name: `${photo.provider}-${photo.id}`.slice(0, 120),
    source: `stock:${photo.provider}`,
    source_page: photo.sourcePage,
    license: photo.licenseCode,
    license_url: photo.licenseUrl,
    attribution: photo.attribution,
    creator: photo.creator,
  };
}

/** Credit lines that must appear on a published site, in a stable order. */
export function creditLines(
  rows: Array<{ license?: string | null; attribution?: string | null }>,
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const code = (row.license ?? "").trim().toLowerCase();
    const line = (row.attribution ?? "").trim();
    if (!code || !line) continue;
    if (!requiresCredit(code)) continue;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}
