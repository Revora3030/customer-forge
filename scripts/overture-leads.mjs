#!/usr/bin/env node
/**
 * Overture Maps places -> a CSV the Jarvis "Import leads" card accepts.
 *
 * Overture publishes about 70 million places as open data (Parquet files in a
 * public S3 bucket). Their rows are sorted by location and carry bounding-box
 * statistics, so one city touches a handful of row groups out of thousands: this
 * reads only those (a few MB), not the 12 GB release. No account and no key.
 *
 * Run by .github/workflows/overture-leads.yml, or by hand:
 *   npm install hyparquet@1.31.5 hyparquet-compressors@1.1.2   (in a scratch folder)
 *   node overture-leads.mjs --city Raleigh --state NC --trade plumbing,roofing --out leads.csv
 *   node overture-leads.mjs --city Raleigh --state NC --list-categories   (what the area holds)
 *
 * Only public listing facts are written. A row needs a website or an email, since
 * the platform checks those at approval (and the review queue never contacts
 * anyone). The score is Overture's own confidence, not a judgement of fit.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com";
const USER_AGENT = "RevoraLeadTool/1.0 (+https://revoragrowthsystems.com)";

/** The bots' sheet columns plus Website and Category, which the importer reads by name. */
export const CSV_HEADER = [
  "Timestamp", "Name", "Business / Title", "Location", "Phone", "Email", "Website", "Category", "Source",
  "Qualification Score (1-10)", "Notes / Why Qualified",
];

/** One import takes at most 300 rows. */
export const MAX_LIMIT = 300;

const PLACE_COLUMNS = ["id", "bbox", "names", "confidence", "addresses", "phones", "websites", "emails", "operating_status", "basic_category"];

/** Splits "--key value" and "--flag" arguments; throws a plain sentence for anything it cannot use. */
export function parseArgs(argv) {
  const raw = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const [key, inline] = [arg.slice(2).split("=")[0], arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : undefined];
    if (["any-city", "list-categories"].includes(key)) raw[key] = true;
    else if (inline !== undefined) raw[key] = inline;
    else {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value.`);
      raw[key] = value;
      i += 1;
    }
  }
  const clean = (value, max) => String(value ?? "").replace(/[^\p{L}\p{N} .,'&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
  const bbox = raw["bbox"] ? String(raw["bbox"]).split(",").map(Number) : null;
  if (bbox && (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3])) throw new Error("--bbox is west,south,east,north in degrees.");
  const state = clean(raw["state"], 2).toUpperCase();
  const city = clean(raw["city"], 80);
  if (!bbox && (!city || !/^[A-Z]{2}$/.test(state))) throw new Error("Give --city and a two-letter --state (or a --bbox).");
  const trade = String(raw["trade"] ?? "").split(",").map((word) => word.toLowerCase().replace(/[^a-z0-9_ ]/g, "").trim()).filter((word) => word.length >= 3).slice(0, 12);
  if (!raw["list-categories"] && !trade.length) throw new Error("Give --trade with one or more words, such as plumbing,roofing. Use --list-categories to see what the area holds.");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(String(raw["limit"] ?? "100"), 10) || 100));
  const minConfidence = Math.min(1, Math.max(0, Number.parseFloat(String(raw["min-confidence"] ?? "0.6")) || 0.6));
  return {
    city, state, trade, limit, minConfidence, bbox,
    release: raw["release"] ? String(raw["release"]) : null,
    anyCity: raw["any-city"] === true,
    listCategories: raw["list-categories"] === true,
    out: raw["out"] ? String(raw["out"]) : "overture-leads.csv",
  };
}

/** The newest release folder in an S3 listing of "release/" (2026-10-21.0 sorts after 2026-09-23.1). */
export function latestRelease(listingXml) {
  const releases = [...listingXml.matchAll(/<Prefix>release\/(\d{4}-\d{2}-\d{2})\.(\d+)\/<\/Prefix>/g)].map((m) => ({ name: `${m[1]}.${m[2]}`, date: m[1], n: Number(m[2]) }));
  if (!releases.length) throw new Error("Couldn't find an Overture release.");
  releases.sort((a, b) => (a.date === b.date ? a.n - b.n : a.date < b.date ? -1 : 1));
  return releases.at(-1).name;
}

export function placeFileNames(listingXml) {
  return [...listingXml.matchAll(/<Key>([^<]+\.parquet)<\/Key>/g)].map((m) => m[1].split("/").pop());
}

/** Whether a row group can hold points inside the box, from its bbox column statistics alone. */
export function rowGroupMayOverlap(rowGroup, box) {
  const stat = (name) => rowGroup.columns.find((column) => column.meta_data.path_in_schema.join(".") === name)?.meta_data.statistics;
  const xmin = stat("bbox.xmin"), xmax = stat("bbox.xmax"), ymin = stat("bbox.ymin"), ymax = stat("bbox.ymax");
  if (!xmin || !xmax || !ymin || !ymax) return true; // no statistics: read it rather than miss places
  return !(xmax.max < box.west || xmin.min > box.east || ymax.max < box.south || ymin.min > box.north);
}

export const humanize = (category) => {
  const words = String(category ?? "").replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
};

/** The place's own category (taxonomy in current releases, categories in older ones). */
export function categoryOf(place) {
  const taxonomy = place.taxonomy ?? place.categories;
  return { primary: String(taxonomy?.primary ?? ""), path: [taxonomy?.primary, ...(taxonomy?.hierarchy ?? [])].filter(Boolean).map(String) };
}

export function matchesTrade(place, keywords) {
  const haystack = categoryOf(place).path.join(" ").toLowerCase();
  return keywords.some((word) => haystack.includes(word.replace(/ /g, "_")) || haystack.includes(word));
}

const first = (list) => (Array.isArray(list) && typeof list[0] === "string" ? list[0].trim() : "");

/** One import row, or null when the place is closed, nameless, low-confidence or has no way to be checked. */
export function leadRow(place, context) {
  const name = String(place.names?.primary ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (place.operating_status && place.operating_status !== "open") return null;
  const confidence = Number(place.confidence);
  if (!Number.isFinite(confidence) || confidence < context.minConfidence) return null;
  const website = first(place.websites);
  const email = first(place.emails).toLowerCase();
  if (!website && !email) return null;
  const address = place.addresses?.[0] ?? {};
  const locality = String(address.locality ?? "").trim();
  if (!context.anyCity && context.city && locality.toLowerCase() !== context.city.toLowerCase()) return null;
  const regionLine = [locality, [address.region, address.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const location = [address.freeform, regionLine].filter(Boolean).join(", ");
  return {
    key: `${name.toLowerCase()}|${locality.toLowerCase()}`,
    confidence,
    cells: [
      context.today, "", name, location, first(place.phones), email, website, humanize(categoryOf(place).primary),
      `Overture Maps ${context.release}`, String(Math.min(10, Math.max(1, Math.round(confidence * 10)))),
      `From Overture Maps places (confidence ${confidence.toFixed(2)}). Website and email not checked yet.`,
    ],
  };
}

/** Quoted when it holds a comma, quote or newline; a leading formula character is defused for spreadsheets. */
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=@]/.test(text) || /^[+-][^\d\s().+-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows) => [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}.`);
  return response.text();
}

/** The city's bounding box from OpenStreetMap's Nominatim (one request, as its usage policy asks). */
export async function cityBox(city, state) {
  const query = new URLSearchParams({ q: `${city}, ${state}, USA`, format: "json", limit: "1" });
  const hits = JSON.parse(await fetchText(`https://nominatim.openstreetmap.org/search?${query}`).catch((error) => {
    throw new Error(`Couldn't look up ${city}, ${state} on OpenStreetMap (${error instanceof Error ? error.message : "failed"}). Use --bbox west,south,east,north instead.`);
  }));
  const [south, north, west, east] = (hits[0]?.boundingbox ?? []).map(Number);
  if (![south, north, west, east].every(Number.isFinite)) throw new Error(`Couldn't find ${city}, ${state}. Use --bbox west,south,east,north instead.`);
  return { west, south, east, north };
}

/** Every place inside the box, reading only the row groups whose statistics could hold one. */
export async function readPlaces({ release, box, onProgress = () => {} }) {
  const { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } = await import("hyparquet").catch(() => {
    throw new Error("Install the readers first: npm install hyparquet@1.31.5 hyparquet-compressors@1.1.2");
  });
  const { compressors } = await import("hyparquet-compressors");
  const prefix = `release/${release}/theme=places/type=place/`;
  const names = placeFileNames(await fetchText(`${BUCKET}/?prefix=${prefix}`));
  if (!names.length) throw new Error(`Release ${release} has no places files.`);
  const places = [];
  let groups = 0;
  let read = 0;
  await Promise.all(names.map(async (name) => {
    const file = await asyncBufferFromUrl({ url: `${BUCKET}/${prefix}${name}` });
    const metadata = await parquetMetadataAsync(file);
    const top = new Set(metadata.row_groups[0]?.columns.map((column) => column.meta_data.path_in_schema[0]));
    const columns = [...PLACE_COLUMNS, top.has("taxonomy") ? "taxonomy" : "categories"].filter((column) => top.has(column));
    let start = 0;
    for (const group of metadata.row_groups) {
      const rows = Number(group.num_rows);
      groups += 1;
      if (rowGroupMayOverlap(group, box)) {
        read += 1;
        const objects = await parquetReadObjects({ file, metadata, compressors, columns, rowStart: start, rowEnd: start + rows });
        for (const place of objects) {
          const { xmin, ymin } = place.bbox ?? {};
          if (xmin >= box.west && xmin <= box.east && ymin >= box.south && ymin <= box.north) places.push(place);
        }
      }
      start += rows;
    }
  }));
  onProgress({ files: names.length, rowGroups: groups, rowGroupsRead: read });
  return places;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const release = options.release ?? latestRelease(await fetchText(`${BUCKET}/?prefix=release/&delimiter=/`));
  const box = options.bbox ? { west: options.bbox[0], south: options.bbox[1], east: options.bbox[2], north: options.bbox[3] } : await cityBox(options.city, options.state);
  console.error(`Overture release ${release}; box ${[box.west, box.south, box.east, box.north].map((n) => n.toFixed(3)).join(", ")}`);
  const places = await readPlaces({ release, box, onProgress: (p) => console.error(`Read ${p.rowGroupsRead} of ${p.rowGroups} row groups in ${p.files} files.`) });
  console.error(`${places.length} places in the box.`);

  if (options.listCategories) {
    const tally = new Map();
    for (const place of places) {
      const category = categoryOf(place).primary || "(none)";
      tally.set(category, (tally.get(category) ?? 0) + 1);
    }
    for (const [category, count] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${String(count).padStart(6)}  ${category}`);
    return;
  }

  const context = { release, city: options.city, anyCity: options.anyCity || !options.city, minConfidence: options.minConfidence, today: new Date().toISOString().slice(0, 10) };
  const wanted = places.filter((place) => matchesTrade(place, options.trade));
  const seen = new Set();
  const rows = [];
  let noContact = 0;
  for (const place of wanted) {
    const row = leadRow(place, context);
    if (!row) {
      if (!first(place.websites) && !first(place.emails)) noContact += 1;
      continue;
    }
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    rows.push(row);
  }
  rows.sort((a, b) => b.confidence - a.confidence);
  const kept = rows.slice(0, options.limit);
  writeFileSync(options.out, toCsv(kept.map((row) => row.cells)));
  console.error(`${wanted.length} matched ${options.trade.join("/")}; ${noContact} had no website or email and were left out; wrote ${kept.length} leads to ${options.out}.`);
  if (!kept.length) console.error("Nothing to import. Try --list-categories to see the area's trades, or --any-city for the whole metro.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
