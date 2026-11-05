/** Render budget for the AI City (Lovable round 10, item 5). */

/** Below this width the city is a flat SVG map: no three.js download, WebGL context or render loop on phones. */
export const CITY_2D_QUERY = "(max-width: 767px)";

/** Device pixel ratio range for the city canvas. */
export const CITY_DPR_MIN = 1;
export const CITY_DPR_MAX = 1.5;
/** Frames per second while a district is animating; idle scenes render only when something changes. */
export const CITY_ANIMATION_FPS = 30;

export function cityDprCeiling(devicePixelRatio: number | undefined): number {
  const ratio = Number.isFinite(devicePixelRatio) && (devicePixelRatio ?? 0) > 0 ? (devicePixelRatio as number) : 1;
  return Math.min(Math.max(ratio, CITY_DPR_MIN), CITY_DPR_MAX);
}

/** JC-18: the whole scene, shadows included, stays at or under this many draw calls. */
export const CITY_DRAW_CALL_BUDGET = 150;
/** Most rain streaks ever drawn; they are one instanced mesh, so they cost one draw call whatever the count. */
export const CITY_RAIN_MAX = 120;

/**
 * Worst-case draw calls for the 3D city, counted from what the scene mounts.
 * Per district: base, tower, cap, selection ring and beacon, plus two pulse rings while it is working.
 * One conduit per outer district, one ground plane, one instanced rain mesh, and up to two meshes per approval beacon.
 * The shadow pass draws the tower and cap of every district again.
 */
export function estimateSceneDrawCalls(input: { districts: number; workingDistricts: number; approvalBeacons: number; rain: boolean; shadows: boolean }): number {
  const districts = Math.max(0, input.districts);
  const working = Math.min(Math.max(0, input.workingDistricts), districts);
  const beacons = Math.min(Math.max(0, input.approvalBeacons), districts);
  const colour = 1 + Math.max(0, districts - 1) + districts * 5 + working * 2 + beacons * 2 + (input.rain ? 1 : 0);
  const shadow = input.shadows ? districts * 2 : 0;
  return colour + shadow;
}

/** Why the city should start on the Operations view and the flat map instead of WebGL, or null when 3D is fine. */
export type CityFallbackReason = "no-webgl" | "low-power";

type NavigatorHints = { deviceMemory?: number; connection?: { saveData?: boolean } };

/** Pure so it can be tested: 2 GB of memory or less, or the browser's data-saver flag, counts as low power. */
export function cityLowPower(nav: NavigatorHints | undefined): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData === true) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 2) return true;
  return false;
}

/** True when a WebGL context can be created. The probe context is released straight away. */
export function webglAvailable(doc: Pick<Document, "createElement"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  if (!doc) return false;
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function cityFallbackReason(env: { nav?: NavigatorHints | undefined; webgl: boolean }): CityFallbackReason | null {
  if (!env.webgl) return "no-webgl";
  return cityLowPower(env.nav) ? "low-power" : null;
}

export const CITY_FALLBACK_NOTE: Record<CityFallbackReason, string> = {
  "no-webgl": "3D is not available on this device, so the city is shown as a flat map. Every count, run and replay event is listed below.",
  "low-power": "This device looks low-power, so the 3D city is skipped. The flat map and the tables below show the same counts, runs and replay events.",
};
