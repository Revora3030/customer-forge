/**
 * Google data adapters (Search Console, Maps Platform). Server-only.
 *
 * Every call goes through the workspace connector gateway, so the Google
 * credentials never exist in the browser and are never logged. Nothing here
 * invents a number: a failed or empty response is returned as an honest
 * "no data" result carrying the exact fetch time, and the caller labels the
 * source. Google Analytics is deliberately absent — no Analytics property is
 * authorized for this workspace, so Revora must not claim that data.
 */

import type { ConsoleRow } from "@/lib/seo-console";

const GATEWAY = "https://connector-gateway.lovable.dev";

type Credentials = { lovableApiKey: string; connectionApiKey: string };

function credentials(name: "GOOGLE_SEARCH_CONSOLE_API_KEY" | "GOOGLE_MAPS_API_KEY"): Credentials {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env[name];
  if (!lovableApiKey || !connectionApiKey)
    throw new GoogleDataError(
      "This Google account isn't connected to Revora yet, so there's no real data to read.",
      "needs_connection",
    );
  return { lovableApiKey, connectionApiKey };
}

export type GoogleFailure = "needs_connection" | "no_access" | "rate_limited" | "provider_error";

/** A failure Revora can explain in plain language, with no invented data. */
export class GoogleDataError extends Error {
  readonly failure: GoogleFailure;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, failure: GoogleFailure, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "GoogleDataError";
    this.failure = failure;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function callGateway(
  connector: "google_search_console" | "google_maps",
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const { lovableApiKey, connectionApiKey } = credentials(
    connector === "google_search_console" ? "GOOGLE_SEARCH_CONSOLE_API_KEY" : "GOOGLE_MAPS_API_KEY",
  );
  const response = await fetch(`${GATEWAY}/${connector}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": connectionApiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (response.status === 403)
    throw new GoogleDataError(
      "The connected Google account doesn't have access to this. Check the account's permissions in Google, then try again.",
      "no_access",
    );
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after") ?? "");
    throw new GoogleDataError(
      "Google is rate-limiting this account right now. Revora will read the data again shortly.",
      "rate_limited",
      Number.isFinite(retry) ? retry : null,
    );
  }
  if (!response.ok) {
    // The body can name the exact Google failure, so it is surfaced, trimmed.
    const detail = (await response.text()).slice(0, 200);
    throw new GoogleDataError(
      `Google couldn't answer this request (${response.status}). ${detail}`.trim(),
      "provider_error",
    );
  }
  return response.json() as Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Search Console
 * ------------------------------------------------------------------ */

type SiteEntry = { siteUrl?: unknown; permissionLevel?: unknown };

/** Does this verified property actually cover the address being analysed? */
function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

/** Every verified property on the connected account. Unverified ones are dropped. */
export async function verifiedProperties(): Promise<string[]> {
  const payload = (await callGateway("google_search_console", "/webmasters/v3/sites")) as {
    siteEntry?: SiteEntry[];
  } | null;
  const entries = Array.isArray(payload?.siteEntry) ? payload!.siteEntry! : [];
  return entries
    .filter(
      (entry) =>
        typeof entry.siteUrl === "string" && entry.permissionLevel !== "siteUnverifiedUser",
    )
    .map((entry) => String(entry.siteUrl));
}

export type PropertyResolution =
  | { status: "selected"; siteUrl: string }
  | { status: "selection_required"; candidates: string[] };

/**
 * Picks the verified property for a site. With more than one match Revora asks
 * instead of guessing, and a chosen property is re-checked against Google's own
 * live list before any per-site call.
 */
export async function resolveProperty(
  targetUrl: string,
  selected?: string | null,
): Promise<PropertyResolution> {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    throw new GoogleDataError("That website address isn't valid, so Google can't be asked about it.", "provider_error");
  }
  const matches = (await verifiedProperties()).filter((siteUrl) => coversTarget(siteUrl, target));
  if (selected) {
    if (!matches.includes(selected))
      throw new GoogleDataError(
        "That Search Console property isn't verified for this website on the connected account.",
        "no_access",
      );
    return { status: "selected", siteUrl: selected };
  }
  if (matches.length === 0)
    throw new GoogleDataError(
      "No verified Search Console property covers this website yet, so there is no search data to read.",
      "no_access",
    );
  if (matches.length === 1) return { status: "selected", siteUrl: matches[0]! };
  return { status: "selection_required", candidates: matches };
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

type AnalyticsRow = { keys?: unknown[]; clicks?: unknown; impressions?: unknown; position?: unknown };

async function analyticsRows(siteUrl: string, startDate: string, endDate: string) {
  const payload = (await callGateway(
    "google_search_console",
    `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      body: { startDate, endDate, dimensions: ["page", "query"], rowLimit: 500 },
    },
  )) as { rows?: AnalyticsRow[] } | null;
  return Array.isArray(payload?.rows) ? payload!.rows! : [];
}

export type SearchPerformance = {
  siteUrl: string;
  /** Rows the optimisation engine scores. Empty means Google reported nothing. */
  rows: ConsoleRow[];
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  fetchedAt: string;
};

/**
 * Real search performance for one verified property: the last 28 complete days
 * with the previous 28 attached for comparison, so trend recommendations come
 * from Google's own numbers rather than an assumption.
 */
export async function searchPerformance(siteUrl: string): Promise<SearchPerformance> {
  const period = { start: isoDaysAgo(31), end: isoDaysAgo(3) };
  const previousPeriod = { start: isoDaysAgo(59), end: isoDaysAgo(32) };
  const [current, previous] = await Promise.all([
    analyticsRows(siteUrl, period.start, period.end),
    analyticsRows(siteUrl, previousPeriod.start, previousPeriod.end).catch(() => [] as AnalyticsRow[]),
  ]);

  const keyOf = (row: AnalyticsRow) => (row.keys ?? []).map((key) => String(key)).join("\u0000");
  const before = new Map<string, { clicks: number; impressions: number }>();
  for (const row of previous)
    before.set(keyOf(row), {
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
    });

  const rows: ConsoleRow[] = [];
  for (const row of current) {
    const keys = (row.keys ?? []).map((key) => String(key));
    const page = keys[0];
    if (!page) continue;
    const previousRow = before.get(keyOf(row));
    rows.push({
      page,
      ...(keys[1] ? { query: keys[1] } : {}),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      position: Number(row.position ?? 0),
      ...(previousRow ? { previous: previousRow } : {}),
    });
  }

  return { siteUrl, rows, period, previousPeriod, fetchedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ *
 * Maps Platform — local listing facts
 * ------------------------------------------------------------------ */

export type LocalListing = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
  fetchedAt: string;
};

const listingCache = new Map<string, { at: number; listings: LocalListing[] }>();
const LISTING_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Looks up a business's public Google listing. Results are cached for six hours
 * because every Maps request is billed by Google, and only fields Google
 * actually returned are kept — a missing field stays null rather than being
 * filled in with a guess.
 */
export async function localListings(query: string): Promise<LocalListing[]> {
  const text = query.trim();
  if (text.length < 3)
    throw new GoogleDataError("Type at least a business name and town to search Google.", "provider_error");
  const key = text.toLowerCase();
  const cached = listingCache.get(key);
  if (cached && Date.now() - cached.at < LISTING_TTL_MS) return cached.listings;

  const payload = (await callGateway("google_maps", "/places/v1/places:searchText", {
    method: "POST",
    body: { textQuery: text, maxResultCount: 5 },
    headers: {
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri",
    },
  })) as { places?: Record<string, unknown>[] } | null;

  const fetchedAt = new Date().toISOString();
  const listings: LocalListing[] = (Array.isArray(payload?.places) ? payload!.places! : []).map(
    (place) => ({
      name: String((place["displayName"] as { text?: unknown } | undefined)?.text ?? "").trim(),
      address: (place["formattedAddress"] as string | undefined) ?? null,
      phone: (place["nationalPhoneNumber"] as string | undefined) ?? null,
      website: (place["websiteUri"] as string | undefined) ?? null,
      rating: typeof place["rating"] === "number" ? place["rating"] : null,
      reviewCount: typeof place["userRatingCount"] === "number" ? place["userRatingCount"] : null,
      mapsUri: (place["googleMapsUri"] as string | undefined) ?? null,
      fetchedAt,
    }),
  );
  listingCache.set(key, { at: Date.now(), listings });
  return listings;
}

/** Test seam: clears the six-hour Maps cache. */
export function resetLocalListingCache() {
  listingCache.clear();
}
