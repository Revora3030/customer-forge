import { districtCounts, type CitySnapshot, type CitySource, type DistrictId } from "./ai-city";

/**
 * JC-6: floor-level detail. Each floor of a district's tower is one work
 * source the city already reads (`snapshot.sources`), so no floor is invented
 * and every number is a count of records the source returned.
 */
const FLOOR_SOURCES: Record<DistrictId, { key: string; label: string }[]> = {
  executive: [
    { key: "events", label: "Jarvis runs" },
    { key: "routines", label: "Routines" },
  ],
  factory: [{ key: "jobs", label: "Site builds" }],
  institute: [{ key: "traces", label: "AI team calls" }],
  creative: [{ key: "images", label: "Image review" }],
  growth: [
    { key: "approvals", label: "Approvals" },
    { key: "automations", label: "Automation runs" },
  ],
  security: [{ key: "errors", label: "Error events" }],
  knowledge: [{ key: "memories", label: "Saved memories" }],
};

export type FloorLight = "unavailable" | "failed" | "working" | "waiting" | "idle";
export type Floor = {
  key: string;
  label: string;
  /** The recorded table name, when the source returned any record. */
  table: string | null;
  light: FloorLight;
  /** Null when the read failed: shown as "unavailable", never as 0. */
  running: number | null;
  queued: number | null;
  failed: number | null;
  records: number | null;
  /** True when the source returned its row limit, so counts may be higher. */
  truncated: boolean;
};

function floorFor(
  snapshot: CitySnapshot,
  district: DistrictId,
  key: string,
  label: string,
  now: number,
): Floor {
  const source: CitySource | undefined = snapshot.sources[key];
  if (!source || !source.available)
    return {
      key,
      label,
      table: null,
      light: "unavailable",
      running: null,
      queued: null,
      failed: null,
      records: null,
      truncated: false,
    };
  // Reuse the city's own counting on just this floor's rows, so floors add up to the district card.
  const counts = districtCounts({ ...snapshot, sources: { [key]: source } }, district, now)!;
  const light: FloorLight =
    counts.errors > 0
      ? "failed"
      : counts.running > 0
        ? "working"
        : counts.queued > 0
          ? "waiting"
          : "idle";
  const table = source.rows.find((row) => row.district === district)?.source ?? null;
  return {
    key,
    label,
    table,
    light,
    running: counts.running,
    queued: counts.queued,
    failed: counts.errors,
    records: counts.total,
    truncated: source.truncated,
  };
}

/** Floors of one district, top floor first. `null` when the city has no snapshot at all. */
export function districtFloors(
  snapshot: CitySnapshot | undefined,
  district: DistrictId,
  now: number,
): Floor[] | null {
  if (!snapshot) return null;
  return FLOOR_SOURCES[district].map(({ key, label }) =>
    floorFor(snapshot, district, key, label, now),
  );
}

export const FLOOR_LIGHT_LABEL: Record<FloorLight, string> = {
  unavailable: "Unavailable",
  failed: "Failed",
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
};
