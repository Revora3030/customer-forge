import { CITY_DISTRICTS, districtCounts, workIsActive, type CitySnapshot, type CityWork, type DistrictCounts, type DistrictId } from "@/lib/ai-city";
import { MARKER_LABEL, replayMarkers, rowTime, type MarkerKind } from "@/lib/city-replay";

/**
 * JC-17 fallback parity. When WebGL is missing or the device is low-power the
 * city shows the flat map and the Operations view. These are the pure rules the
 * Operations tables use, so they carry the same numbers the scene draws:
 * one list row per recorded in-flight run (what the scene draws as one avatar),
 * the same per-district counts, and the same replay events as the scrubber.
 */
const rowsOf = (snapshot: CitySnapshot | undefined) => Object.values(snapshot?.sources ?? {}).flatMap((source) => source.rows);

/** One entry per recorded running row with a recent heartbeat; zero rows means an empty list. */
export function activeRuns(snapshot: CitySnapshot | undefined, now: number): CityWork[] {
  const seen = new Set<string>();
  return rowsOf(snapshot)
    .filter((row) => workIsActive(row, now))
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export type DistrictCountRow = { id: DistrictId; name: string; counts: DistrictCounts | null };

export function districtCountRows(snapshot: CitySnapshot | undefined, now: number): DistrictCountRow[] {
  return CITY_DISTRICTS.map((d) => ({ id: d.id, name: d.name, counts: districtCounts(snapshot, d.id, now) }));
}

export type ReplayTableRow = { at: number; kind: MarkerKind; label: string; district: DistrictId; title: string; status: string; row: CityWork };

/** The scrubber's event ticks as table rows, newest first. */
export function replayTableRows(snapshot: CitySnapshot | undefined, now: number): ReplayTableRow[] {
  return replayMarkers(snapshot, now)
    .map((m) => ({ at: rowTime(m.row), kind: m.kind, label: MARKER_LABEL[m.kind], district: m.row.district, title: m.row.title, status: m.row.status, row: m.row }))
    .sort((a, b) => b.at - a.at);
}
