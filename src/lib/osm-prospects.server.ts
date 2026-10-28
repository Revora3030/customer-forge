import { osmElementToProspect, overpassQuery } from "./osm-prospects";

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const UA = "RevoraProspectLookup/1.0 (+https://revoragrowthsystems.com)";

/**
 * Free OpenStreetMap search: Nominatim finds the city's bounding box, then
 * Overpass lists matching businesses. One request each, per their usage
 * policies. Failures are unavailable searches, never successful empty results.
 */
export async function searchOsmProspects(niche: string, city: string, state: string | null) {
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
    // Public Overpass servers are often busy; try mirrors in turn.
    let res: Response | null = null;
    for (const server of OVERPASS_SERVERS) {
      try {
        const attempt = await fetch(server, {
          method: "POST",
          headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: overpassQuery(niche, bbox) }),
          signal: AbortSignal.timeout(45_000),
        });
        if (attempt.ok) {
          res = attempt;
          break;
        }
        console.warn(`OpenStreetMap server ${new URL(server).host} failed [${attempt.status}]`);
      } catch (error) {
        console.warn(`OpenStreetMap server ${new URL(server).host} failed:`, error instanceof Error ? error.message : error);
      }
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
