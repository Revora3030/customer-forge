/**
 * JC-1 building state animation language.
 *
 * Maps `districtState()` (+ failure vs wait counts) to four visible tower
 * states: working, waiting, failed, idle (plus unavailable). Tokens drive
 * colours, icons and motion; reduced-motion keeps static colours + icon only.
 * Nothing here invents work — every state comes from recorded rows.
 */
import {
  districtCounts,
  districtState,
  type CitySnapshot,
  type DistrictId,
} from "./ai-city";

export type BuildingAnimState = "working" | "waiting" | "failed" | "idle" | "unavailable";

/** Palette key on the city CSS tokens / CityScene palette. */
export type BuildingColorKey = "ok" | "gold" | "danger" | "muted" | "tone";

export type BuildingIcon = "pulse" | "ring" | "alert" | "dim" | "offline";

/**
 * Style token for one tower. Motion fields are zeroed when `motion` is false
 * (pause button or prefers-reduced-motion) so the scene stays static.
 */
export type BuildingStyleToken = {
  state: BuildingAnimState;
  /** CSS/palette colour role for the tower body and beacon. */
  colorKey: BuildingColorKey;
  /** Roof beacon pulse rate in Hz. 0 = hold still. Working is calm; failed caps at 2. */
  beaconHz: number;
  /** Rising window-light scroll when working with motion on. */
  risingWindows: boolean;
  /** Slow gold ground ring when waiting with motion on. */
  goldRing: boolean;
  /** Hard red strobe (square wave) when failed with motion on; always ≤ FAILED_STROBE_HZ. */
  strobe: boolean;
  /** Dim tower when idle. */
  dim: boolean;
  /** Static icon shown under reduced motion (and as the aria/data mark). */
  icon: BuildingIcon;
};

/** Failed strobe hard cap from JC-1 acceptance (2 Hz). */
export const FAILED_STROBE_HZ = 2;
/** Calm working beacon pulse. */
export const WORKING_BEACON_HZ = 1.2;
/** Slow waiting ring / beacon. */
export const WAITING_BEACON_HZ = 0.45;

/**
 * Refine `districtState` attention into waiting vs failed using recorded counts.
 * Acknowledged failures are already relabelled by `applyAcknowledged`, so they
 * no longer count as errors and the strobe stops.
 */
export function buildingAnimState(
  id: DistrictId,
  snapshot: CitySnapshot | undefined,
  now: number,
): BuildingAnimState {
  const state = districtState(id, snapshot, now);
  if (state === "working") return "working";
  if (state === "unavailable") return "unavailable";
  if (state === "idle") return "idle";
  const counts = districtCounts(snapshot, id, now);
  if ((counts?.errors ?? 0) > 0) return "failed";
  return "waiting";
}

/** Map each animation state to its style token. Motion off → static colours + icon only. */
export function buildingStyleToken(state: BuildingAnimState, motion: boolean): BuildingStyleToken {
  const base: Record<BuildingAnimState, Omit<BuildingStyleToken, "beaconHz" | "risingWindows" | "goldRing" | "strobe"> & {
    beaconHz: number;
    risingWindows: boolean;
    goldRing: boolean;
    strobe: boolean;
  }> = {
    working: {
      state: "working",
      colorKey: "ok",
      beaconHz: WORKING_BEACON_HZ,
      risingWindows: true,
      goldRing: false,
      strobe: false,
      dim: false,
      icon: "pulse",
    },
    waiting: {
      state: "waiting",
      colorKey: "gold",
      beaconHz: WAITING_BEACON_HZ,
      risingWindows: false,
      goldRing: true,
      strobe: false,
      dim: false,
      icon: "ring",
    },
    failed: {
      state: "failed",
      colorKey: "danger",
      beaconHz: FAILED_STROBE_HZ,
      risingWindows: false,
      goldRing: false,
      strobe: true,
      dim: false,
      icon: "alert",
    },
    idle: {
      state: "idle",
      colorKey: "tone",
      beaconHz: 0,
      risingWindows: false,
      goldRing: false,
      strobe: false,
      dim: true,
      icon: "dim",
    },
    unavailable: {
      state: "unavailable",
      colorKey: "muted",
      beaconHz: 0,
      risingWindows: false,
      goldRing: false,
      strobe: false,
      dim: true,
      icon: "offline",
    },
  };
  const token = base[state];
  if (motion) return token;
  return {
    ...token,
    beaconHz: 0,
    risingWindows: false,
    goldRing: false,
    strobe: false,
  };
}

/** Convenience: anim state + style token for one district. */
export function buildingStyleFor(
  id: DistrictId,
  snapshot: CitySnapshot | undefined,
  now: number,
  motion: boolean,
): BuildingStyleToken {
  return buildingStyleToken(buildingAnimState(id, snapshot, now), motion);
}

/**
 * JC-5 keyboard: Enter opens drill-down when not drilled; Esc returns.
 * Other keys are ignored here (1–7 / arrows stay on districtForKey).
 */
export function cityDrillKey(key: string, drilled: boolean): "open" | "close" | null {
  if (key === "Enter" && !drilled) return "open";
  if (key === "Escape" && drilled) return "close";
  return null;
}

/** Orthographic zoom targets for overview vs per-building drill-down. */
export function cityCameraZoom(width: number, drilled: boolean): number {
  const overview = Math.max(10, Math.min(24, width / 42));
  return drilled ? Math.min(65, overview * 2.35) : overview;
}
