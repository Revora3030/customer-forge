import { osmElementToProspect, overpassQuery } from "./osm-prospects";

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Whole Overpass phase stays inside this budget, across every mirror. */
const OVERPASS_BUDGET_MS = 90_000;
const OVERPASS_ATTEMPT_MS = 45_000;
/** Pause before the next mirror after a busy (429/5xx) answer. */
export const OVERPASS_BACKOFF_MS = [1_000, 2_000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const UA = "RevoraProspectLookup/1.0 (+https://revoragrowthsystems.com)";

/**
 * Free OpenStreetMap search: Nominatim finds the city's bounding box, then
 * Overpass lists matching businesses. One request each, per their usage
 * policies. Failures are unavailable searches, never successful empty results.
 */
export async function searchOsmProspects(
  niche: string,
  city: string,
  state: string | null,
  sleep: (ms: number) => Promise<void> = defaultSleep,
) {
  try {
    const q = new URLSearchParams({ q: [city, state, "USA"].filter(Boolean).join(", "), format: "json", limit: "1" });
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!geo.ok) throw new Error(`City lookup unavailable (${geo.status}).`);
    const [hit] = (await geo.json()) as { boundingbox?: string[] }[];
    const [south, north, west, east] = (hit?.boundingbox ?? []).map(Number);
    if (south === undefined || north === undefined || west === undefined || east === undefined ||
      ![south, north, west, east].every(Number.isFinite)) throw new Error("City lookup returned no usable boundary.");
    // Nominatim gives [south, north, west, east]; widen tiny city boxes a little.
    const pad = 0.05;
    const bbox: [number, number, number, number] = [south - pad, west - pad, north + pad, east + pad];
    // Public Overpass servers are often busy; try mirrors in turn, with a short
    // backoff after a busy answer, all inside one bounded budget.
    let res: Response | null = null;
    const deadline = Date.now() + OVERPASS_BUDGET_MS;
    for (const [index, server] of OVERPASS_SERVERS.entries()) {
      const left = deadline - Date.now();
      if (left < 5_000) break;
      let busy = false;
      try {
        const attempt = await fetch(server, {
          method: "POST",
          headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: overpassQuery(niche, bbox) }),
          signal: AbortSignal.timeout(Math.min(OVERPASS_ATTEMPT_MS, left)),
        });
        if (attempt.ok) {
          res = attempt;
          break;
        }
        busy = attempt.status === 429 || attempt.status >= 500;
        console.warn(`OpenStreetMap server ${new URL(server).host} failed [${attempt.status}]`);
      } catch (error) {
        console.warn(`OpenStreetMap server ${new URL(server).host} failed:`, error instanceof Error ? error.message : error);
      }
      const pause = OVERPASS_BACKOFF_MS[index];
      if (busy && pause !== undefined && index < OVERPASS_SERVERS.length - 1) await sleep(pause);
    }
    if (!res) throw new Error("Business directory unavailable after bounded attempts.");
    const json = (await res.json()) as { elements?: { type?: unknown; id?: unknown; tags?: unknown }[] };
    if (!Array.isArray(json.elements)) throw new Error("Business directory returned an incomplete response.");
    return json.elements.map((el) => osmElementToProspect(el, city, state)).filter((p) => p !== null);
  } catch (error) {
    console.warn("OpenStreetMap search failed:", error instanceof Error ? error.message : error);
    throw new Error("OpenStreetMap discovery is unavailable; no successful empty search was recorded.");
  }
}
