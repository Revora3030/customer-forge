/**
 * JC-9 / JC-10 — AI City sky and weather from measured load and health only.
 * Unknown inputs stay neutral / off. Nothing is invented.
 *
 * Pure mapping: sky/weather are functions of load/health *signals*, never of
 * wall-clock time. CityScene and CitySvgMap only consume skyMode/weather props.
 * JC-7/8 CityReplay.onReplayFrame supplies scrubbed `at`; AiCity re-derives
 * load/health at that time and feeds `atmosphereFromSignals`. CityScene only
 * consumes skyMode/weather props.
 */
import {
  ATTENTION_WINDOW_MS,
  CITY_DISTRICTS,
  WAITING_STATUSES,
  districtCounts,
  failureGroups,
  type CitySnapshot,
  type CityWork,
} from "@/lib/ai-city";

const isWaiting = (status: string) => (WAITING_STATUSES as readonly string[]).includes(status);

/** Hours in the 7-day load baseline. */
export const LOAD_BASELINE_HOURS = 7 * 24;

export type SkyMode = "neutral" | "dusk" | "bright" | "amber";

export type SkyState = {
  mode: SkyMode;
  /** Owner-facing key line. */
  label: string;
  /** currentLoad / median, or null when either side is unknown. */
  ratio: number | null;
  currentLoad: number | null;
  medianLoad: number | null;
};

export type WeatherKind = "unknown" | "clear" | "rain";

export type WeatherState = {
  kind: WeatherKind;
  /** 0 = clear / unknown, up to 1 = heavy rain from measured failure rate. */
  density: number;
  label: string;
  openFailures: number | null;
  recentWork: number | null;
};

/** Median of a numeric list; null when empty. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return null;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  if (b === undefined) return a;
  return (b + a) / 2;
}

/**
 * Running + queued across every district right now.
 * Null when the city snapshot was not loaded (do not treat as zero).
 */
export function cityLoadNow(snapshot: CitySnapshot | undefined, now: number): number | null {
  if (!snapshot) return null;
  let total = 0;
  for (const d of CITY_DISTRICTS) {
    const counts = districtCounts(snapshot, d.id, now);
    if (!counts) return null;
    total += counts.running + counts.queued;
  }
  return total;
}

/**
 * Per-hour count of fetched rows that are still marked running or waiting,
 * bucketed by their recorded `at` (oldest first). Only measured timestamps.
 */
export function hourlyRunningQueued(rows: readonly CityWork[], now: number, hours = LOAD_BASELINE_HOURS): number[] {
  const buckets = new Array<number>(hours).fill(0);
  for (const row of rows) {
    const running = row.status === "running";
    const queued = isWaiting(row.status);
    if (!running && !queued) continue;
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at > now) continue;
    const back = Math.floor((now - at) / 3_600_000);
    if (back < 0 || back >= hours) continue;
    const index = hours - 1 - back;
    buckets[index] = (buckets[index] ?? 0) + 1;
  }
  return buckets;
}

/**
 * JC-9: map measured load (+ open failures) to sky mode.
 * quiet ≤ median → dusk; busy > median → bright; any open failure → amber;
 * missing measurements → neutral.
 */
export function skyFromLoad(input: {
  currentLoad: number | null;
  hourlyLoads: readonly number[] | null;
  openFailures: number | null;
}): SkyState {
  const { currentLoad, hourlyLoads, openFailures } = input;
  if (currentLoad == null || hourlyLoads == null || openFailures == null) {
    return {
      mode: "neutral",
      label: "Sky: no load data yet",
      ratio: null,
      currentLoad,
      medianLoad: hourlyLoads == null ? null : median(hourlyLoads),
    };
  }
  const medianLoad = median(hourlyLoads);
  if (medianLoad == null) {
    return { mode: "neutral", label: "Sky: no load data yet", ratio: null, currentLoad, medianLoad: null };
  }
  if (openFailures > 0) {
    const ratio = medianLoad === 0 ? (currentLoad > 0 ? null : 0) : currentLoad / medianLoad;
    return {
      mode: "amber",
      label: `Sky: amber haze · ${openFailures} open failure${openFailures === 1 ? "" : "s"} in the last 48h`,
      ratio,
      currentLoad,
      medianLoad,
    };
  }
  const ratio = medianLoad === 0 ? (currentLoad === 0 ? 1 : Number.POSITIVE_INFINITY) : currentLoad / medianLoad;
  if (currentLoad <= medianLoad) {
    return {
      mode: "dusk",
      label: `Sky: dusk · load ${currentLoad} ≤ 7-day median ${formatMedian(medianLoad)}`,
      ratio: medianLoad === 0 ? (currentLoad === 0 ? 1 : null) : ratio,
      currentLoad,
      medianLoad,
    };
  }
  return {
    mode: "bright",
    label: `Sky: bright · load ${currentLoad} > 7-day median ${formatMedian(medianLoad)}`,
    ratio: Number.isFinite(ratio) ? ratio : null,
    currentLoad,
    medianLoad,
  };
}

function formatMedian(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Open failures (grouped count) and how many fetched rows fall in the 48h window.
 * Nulls mean the snapshot was not loaded.
 */
export function cityHealthWindow(
  snapshot: CitySnapshot | undefined,
  now: number,
): { openFailures: number | null; recentWork: number | null } {
  if (!snapshot) return { openFailures: null, recentWork: null };
  const rows = Object.values(snapshot.sources).flatMap((source) => source.rows);
  const openFailures = failureGroups(rows, now).reduce((sum, group) => sum + group.count, 0);
  const recentWork = rows.filter((row) => {
    const at = Date.parse(row.at);
    return Number.isFinite(at) && at <= now && now - at <= ATTENTION_WINDOW_MS;
  }).length;
  return { openFailures, recentWork };
}

/**
 * JC-10: rain density from measured failure rate in the last 48h.
 * clear when openFailures === 0; unknown when inputs missing.
 */
export function weatherFromHealth(input: {
  openFailures: number | null;
  recentWork: number | null;
}): WeatherState {
  const { openFailures, recentWork } = input;
  if (openFailures == null || recentWork == null) {
    return { kind: "unknown", density: 0, label: "Weather: not measured", openFailures, recentWork };
  }
  if (openFailures === 0) {
    return { kind: "clear", density: 0, label: "Weather: clear · 0 open failures in the last 48h", openFailures, recentWork };
  }
  const denom = Math.max(recentWork, openFailures);
  const density = Math.min(1, openFailures / denom);
  const ratePct = Math.round(density * 100);
  return {
    kind: "rain",
    density,
    label: `Weather: rain · ${openFailures} open failure${openFailures === 1 ? "" : "s"} / ${recentWork} records (${ratePct}% of window)`,
    openFailures,
    recentWork,
  };
}

/** Replay-friendly entry: pure sky + weather from measured (or scrubbed) signals. */
export function atmosphereFromSignals(input: {
  currentLoad: number | null;
  hourlyLoads: readonly number[] | null;
  openFailures: number | null;
  recentWork: number | null;
}): { sky: SkyState; weather: WeatherState } {
  return {
    sky: skyFromLoad({
      currentLoad: input.currentLoad,
      hourlyLoads: input.hourlyLoads,
      openFailures: input.openFailures,
    }),
    weather: weatherFromHealth({
      openFailures: input.openFailures,
      recentWork: input.recentWork,
    }),
  };
}

/** Lighting / fog colours for the 3D scene. Neutral keeps the default palette ground. */
export function skyLighting(
  mode: SkyMode,
  ground: string,
): { background: string; fog: string; ambient: number; ambientColor: string; haze: string | null } {
  switch (mode) {
    case "dusk":
      return { background: "#1a2230", fog: "#1a2230", ambient: 0.55, ambientColor: "#6b7c8f", haze: "rgba(40,55,80,0.35)" };
    case "bright":
      return { background: "#2a3a4e", fog: ground, ambient: 1.25, ambientColor: "#c5d4e4", haze: "rgba(180,210,255,0.12)" };
    case "amber":
      return { background: "#2a2418", fog: "#3a3018", ambient: 0.7, ambientColor: "#c4a35a", haze: "rgba(212,150,40,0.28)" };
    default:
      return { background: ground, fog: ground, ambient: 0.95, ambientColor: "#9fb4c4", haze: null };
  }
}
