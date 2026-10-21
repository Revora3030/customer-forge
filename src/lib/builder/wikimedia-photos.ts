/**
 * WIKIMEDIA COMMONS PHOTO SEARCH — pure model
 * ===========================================
 *
 * Keyless search of Wikimedia Commons for openly licensed photographs, mapped
 * into the same `StockPhoto` shape as Openverse results so the same licence
 * rules apply (see `stock-photos.ts`).
 *
 * Fail closed: the licence comes only from the file's own metadata. A licence
 * we do not recognise is dropped rather than guessed at, non-commercial and
 * no-derivatives licences are dropped, and a picture that needs a credit line
 * but names no author is dropped because it could not be credited properly.
 */
import { licenceAllowsBusinessUse, type StockPhoto } from "./stock-photos";

/** Wikimedia asks API clients to identify themselves with a contact address. */
export const WIKIMEDIA_USER_AGENT = "RevoraGrowthSystems/1.0 (+https://revoragrowthsystems.com)";

export const WIKIMEDIA_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": WIKIMEDIA_USER_AGENT,
  "Api-User-Agent": WIKIMEDIA_USER_AGENT,
};

export function wikimediaSearchUrl(query: string): URL {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata|size");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("format", "json");
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Turns a metadata HTML fragment (Artist, ObjectName) into plain text. */
export function htmlToText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const plain = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 32);
      if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10) || 32);
      return ENTITIES[lower] ?? match;
    })
    // eslint-disable-next-line no-control-regex -- control characters are stripped from library metadata
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain ? plain.slice(0, 160) : null;
}

/**
 * Licence code from Commons' `LicenseShortName`. Only plain Creative Commons
 * attribution licences, CC0 and public domain are recognised; anything else
 * (ported variants, GFDL-only, free-text) returns null and the file is dropped.
 */
export function wikimediaLicenceCode(shortName: unknown): string | null {
  if (typeof shortName !== "string") return null;
  const name = shortName.replace(/\s+/g, " ").trim().toLowerCase();
  if (/^cc0(?: 1\.0)?$/.test(name)) return "cc0";
  if (name === "public domain") return "pdm";
  const cc = /^cc (by(?:-(?:sa|nc|nd))*)(?: \d(?:\.\d)?)?$/.exec(name);
  return cc ? cc[1]! : null;
}

const meta = (extmetadata: unknown, key: string): unknown => {
  if (!extmetadata || typeof extmetadata !== "object") return undefined;
  const entry = (extmetadata as Record<string, unknown>)[key];
  return entry && typeof entry === "object" ? (entry as { value?: unknown }).value : undefined;
};

const https = (value: unknown): string | null =>
  typeof value === "string" && /^https:\/\//i.test(value.trim()) ? value.trim() : null;

const size = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;

function fileTitle(title: unknown): string | null {
  if (typeof title !== "string") return null;
  const bare = title.replace(/^file:/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ");
  return htmlToText(bare);
}

/** Turns a Commons API response into pictures a business may use. */
export function normaliseWikimediaResults(raw: unknown): StockPhoto[] {
  const pages = raw && typeof raw === "object" ? (raw as { query?: { pages?: unknown } }).query?.pages : undefined;
  const list = Array.isArray(pages) ? pages : pages && typeof pages === "object" ? Object.values(pages) : [];
  const rows = list
    .filter((page): page is Record<string, unknown> => !!page && typeof page === "object")
    .sort((a, b) => (Number(a["index"]) || 0) - (Number(b["index"]) || 0));

  const seen = new Set<string>();
  const out: StockPhoto[] = [];
  for (const page of rows) {
    const info = Array.isArray(page["imageinfo"]) ? (page["imageinfo"][0] as Record<string, unknown> | undefined) : undefined;
    if (!info || typeof info !== "object") continue;
    const ext = info["extmetadata"];

    const shortName = meta(ext, "LicenseShortName");
    const licenseCode = wikimediaLicenceCode(shortName);
    if (!licenseCode || !licenceAllowsBusinessUse(licenseCode)) continue;

    // The 1600px rendering is always a browser-safe JPEG/PNG; originals may be TIFF.
    const thumb = https(info["thumburl"]);
    const url = thumb ?? https(info["url"]);
    if (!url || seen.has(url)) continue;

    const creator = htmlToText(meta(ext, "Artist"));
    const needsCredit = licenseCode !== "cc0" && licenseCode !== "pdm";
    if (needsCredit && !creator) continue;
    seen.add(url);

    const title = htmlToText(meta(ext, "ObjectName")) ?? fileTitle(page["title"]) ?? "Untitled photograph";
    const licenceLabel = String(shortName).replace(/\s+/g, " ").trim();
    out.push({
      id: String(page["pageid"] ?? url),
      title: title.slice(0, 160),
      url,
      thumbnail: url,
      provider: "wikimedia",
      creator,
      licenseCode,
      licenseUrl: https(meta(ext, "LicenseUrl")),
      attribution: `"${title}" by ${creator ?? "an unknown author"}, ${licenceLabel} via Wikimedia Commons`,
      sourcePage: https(info["descriptionurl"]),
      width: thumb ? size(info["thumbwidth"]) : size(info["width"]),
      height: thumb ? size(info["thumbheight"]) : size(info["height"]),
    });
  }
  return out;
}
