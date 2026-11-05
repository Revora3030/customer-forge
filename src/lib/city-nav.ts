/**
 * AI City navigation maths (JC-15 mini-map, JC-60 mobile city).
 * Pure functions only, so the gestures can be unit-tested without a browser.
 */
import { CITY_DISTRICTS, type DistrictId } from "./ai-city";

/* ------------------------------- mini-map (JC-15) ------------------------------- */

/** District grid positions run −7…7; the mini-map keeps a margin so a dot is never clipped by the frame. */
const GRID_SPAN = 7;
const MINI_MARGIN = 14;

export type MiniMapDot = { id: DistrictId; name: string; /** 0–100, percent from the left edge. */ left: number; /** 0–100, percent from the top edge. */ top: number };

/** One dot per district, laid out in the same arrangement as the city (north up). */
export function miniMapDots(): MiniMapDot[] {
  const place = (value: number) => MINI_MARGIN + ((value + GRID_SPAN) / (GRID_SPAN * 2)) * (100 - MINI_MARGIN * 2);
  return CITY_DISTRICTS.map((d) => ({ id: d.id, name: d.name, left: place(d.position[0]), top: place(d.position[1]) }));
}

/* ---------------------------- flat map camera (JC-60) ---------------------------- */

/** The flat map is drawn in a 0–100 square. */
export const MAP_SIZE = 100;
/** Breathing room around it, so labels at the edge (Creative District, Reliability Center) are never cut off. */
export const MAP_PAD = 8;
/** The side of the whole framed window. */
export const MAP_SPAN = MAP_SIZE + MAP_PAD * 2;
export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 3;
/** A finger must travel this many pixels before a touch counts as a pan, not a tap. */
export const MAP_TAP_SLOP_PX = 8;

export type MapView = { zoom: number; /** Centre of the visible window, 0–100. */ cx: number; cy: number };

/** Where the camera starts: the whole city in frame. */
export const FRAMED_VIEW: MapView = { zoom: MAP_MIN_ZOOM, cx: MAP_SIZE / 2, cy: MAP_SIZE / 2 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Keeps the zoom in range and the window inside the map, so the city can never be dragged out of view. */
export function clampView(view: MapView): MapView {
  const zoom = Number.isFinite(view.zoom) ? clamp(view.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM) : MAP_MIN_ZOOM;
  const half = MAP_SPAN / 2 / zoom;
  const safe = (v: number) => (Number.isFinite(v) ? v : MAP_SIZE / 2);
  const lo = half - MAP_PAD, hi = MAP_SIZE + MAP_PAD - half;
  return { zoom, cx: clamp(safe(view.cx), lo, hi), cy: clamp(safe(view.cy), lo, hi) };
}

/** The SVG viewBox for a camera. */
export function viewBoxOf(view: MapView): string {
  const v = clampView(view);
  const size = MAP_SPAN / v.zoom;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `${r(v.cx - size / 2)} ${r(v.cy - size / 2)} ${r(size)} ${r(size)}`;
}

/** Zoom to `zoom` while the map point under `anchor` (e.g. between two fingers) stays where it is on screen. */
export function zoomAbout(view: MapView, zoom: number, anchor: { x: number; y: number }): MapView {
  const next = clamp(zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const ratio = view.zoom / next;
  return clampView({ zoom: next, cx: anchor.x - (anchor.x - view.cx) * ratio, cy: anchor.y - (anchor.y - view.cy) * ratio });
}

/** Zoom for a pinch: the start zoom scaled by how far the fingers moved apart. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return startZoom;
  return clamp(startZoom * (distance / startDistance), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
}

/** One-finger drag: the map follows the finger, so the window moves the opposite way. `dx`/`dy` are in map units. */
export function panBy(view: MapView, dx: number, dy: number): MapView {
  return clampView({ ...view, cx: view.cx - dx, cy: view.cy - dy });
}

/** Centre the window on a map point (flying to a district); the zoom is kept. */
export function centerOn(view: MapView, point: { x: number; y: number }): MapView {
  return clampView({ ...view, cx: point.x, cy: point.y });
}

/* ----------------------------- bottom sheet (JC-60) ----------------------------- */

/** The district inspector opens at 80% of the viewport height on phones. */
export const SHEET_HEIGHT_DVH = 80;
/** Dragging the handle up grows the sheet to this height. */
export const SHEET_TALL_DVH = 92;
/** Drag farther than this, or flick faster than the speed below, and the sheet closes. */
export const SHEET_DISMISS_PX = 96;
export const SHEET_DISMISS_SPEED = 0.6; // px per millisecond
export const SHEET_GROW_PX = 40;

export type SheetDragResult = "dismiss" | "grow" | "settle";

/** What a finished handle drag should do. `dy` is positive downwards. */
export function sheetDragResult(dy: number, elapsedMs: number, tall: boolean): SheetDragResult {
  const speed = elapsedMs > 0 ? dy / elapsedMs : 0;
  if (dy >= SHEET_DISMISS_PX || (dy > 24 && speed >= SHEET_DISMISS_SPEED)) return "dismiss";
  if (dy <= -SHEET_GROW_PX && !tall) return "grow";
  return "settle";
}

/** While dragging the sheet follows the finger downwards only; it never lifts off the bottom edge. */
export function sheetOffset(dy: number): number {
  return Number.isFinite(dy) ? Math.max(0, dy) : 0;
}
