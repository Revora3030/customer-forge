import { ATTENTION_WINDOW_MS, FAILED_STATUSES, windowCapped, type CitySnapshot, type CityWork } from "@/lib/ai-city";

/**
 * JC-7 / JC-8 timeline replay. Everything here works on rows the City already
 * fetched; nothing is invented, and nothing new is requested.
 */
export const REPLAY_WINDOW_MS = ATTENTION_WINDOW_MS;
/** 48h in 15-minute slots; the last slot ends at "now". */
export const REPLAY_SLOT_MS = 15 * 60_000;
export const REPLAY_SLOTS = REPLAY_WINDOW_MS / REPLAY_SLOT_MS;
export const REPLAY_SPEEDS = [1, 5, 15, 60] as const;
export type ReplaySpeed = typeof REPLAY_SPEEDS[number];

/** When a row happened: `startedAt` if recorded, else `at`. */
export function rowTime(row: CityWork): number {
  const started = row.startedAt ? Date.parse(row.startedAt) : NaN;
  return Number.isFinite(started) ? started : Date.parse(row.at);
}

const rowsOf = (snapshot: CitySnapshot | undefined) => Object.values(snapshot?.sources ?? {}).flatMap((s) => s.rows);

/** Slot index (0 = oldest, REPLAY_SLOTS-1 = now) for a timestamp, or null outside the window. */
export function slotOf(time: number, now: number): number | null {
  if (!Number.isFinite(time) || time > now || now - time > REPLAY_WINDOW_MS) return null;
  const back = Math.floor((now - time) / REPLAY_SLOT_MS);
  return Math.max(0, REPLAY_SLOTS - 1 - Math.min(back, REPLAY_SLOTS - 1));
}

/** The end time of a slot; the last slot ends exactly at now. */
export function slotEnd(slot: number, now: number): number {
  return now - (REPLAY_SLOTS - 1 - slot) * REPLAY_SLOT_MS;
}

/** Rows whose time falls inside the given slot. */
export function frameRows(snapshot: CitySnapshot | undefined, slot: number, now: number): CityWork[] {
  return rowsOf(snapshot).filter((row) => slotOf(rowTime(row), now) === slot);
}

export type ReplayFrame = { slot: number; at: number; isNow: boolean; rows: CityWork[]; load: number; health: number | null };

/**
 * One replayed moment for other scene parts (JC-9/10 sky and weather) to follow.
 * load = records in this slot; health = share not failed (null when the slot is empty).
 */
export function replayFrame(snapshot: CitySnapshot | undefined, slot: number, now: number): ReplayFrame {
  const rows = frameRows(snapshot, slot, now);
  const failed = rows.filter((row) => (FAILED_STATUSES as readonly string[]).includes(row.status)).length;
  return { slot, at: slotEnd(slot, now), isNow: slot === REPLAY_SLOTS - 1, rows, load: rows.length, health: rows.length ? (rows.length - failed) / rows.length : null };
}

/** Truncation copy, only when a feed hit its row limit inside the window (#562 windowCapped). */
export function replayTruncationNote(snapshot: CitySnapshot | undefined, now: number): string | null {
  const sources = Object.values(snapshot?.sources ?? {});
  if (!sources.some((source) => windowCapped(source, now))) return null;
  const n = sources.reduce((sum, source) => sum + source.rows.length, 0);
  return `History limited to what was fetched (${n} rows).`;
}

export type MarkerKind = "failure" | "approval" | "publish" | "ci";
export const MARKER_LABEL: Record<MarkerKind, string> = { failure: "Failure", approval: "Approval", publish: "Publish", ci: "CI" };

/** Classifies a real row as a replay event marker, or null when it is not one. */
export function markerKind(row: CityWork): MarkerKind | null {
  if ((FAILED_STATUSES as readonly string[]).includes(row.status)) return "failure";
  if (row.source === "approval_queue") return "approval";
  const text = `${row.kind ?? ""} ${row.title}`.toLowerCase();
  if (/\b(publish(ed|ing)?|deploy(ed|ment)?|release[ds]?)\b/.test(text)) return "publish";
  if (/\b(ci|github actions?|workflow run|check run)\b/.test(text)) return "ci";
  return null;
}

export type ReplayMarker = { slot: number; kind: MarkerKind; row: CityWork };

/** Event ticks, oldest first; one per row so tapping opens that row's detail. */
export function replayMarkers(snapshot: CitySnapshot | undefined, now: number): ReplayMarker[] {
  const out: ReplayMarker[] = [];
  for (const row of rowsOf(snapshot)) {
    const kind = markerKind(row);
    const slot = slotOf(rowTime(row), now);
    if (kind && slot !== null) out.push({ slot, kind, row });
  }
  return out.sort((a, b) => a.slot - b.slot || rowTime(a.row) - rowTime(b.row));
}

/** Next slot while playing; speed is slots per tick. Stops at now. */
export function nextSlot(slot: number, speed: number): number {
  return Math.min(REPLAY_SLOTS - 1, slot + Math.max(1, Math.floor(speed)));
}
