/**
 * Pure maths for the hands-on reveal ("clean this driveway"): the visitor drags across the before picture
 * and the after picture appears where they have been. Coverage is tracked on a coarse grid, so the
 * percentage shown and the moment the rest is revealed do not depend on reading pixels back from a canvas
 * (which a picture from another host would forbid).
 */
export const GRID_COLS = 24;
export const GRID_ROWS = 16;
/** Once this much has been revealed the rest is shown, so nobody hunts for the last corner. */
export const DONE_AT_PERCENT = 92;
export const MIN_BRUSH_PX = 24;
export const MAX_BRUSH_PX = 72;

export type RevealGrid = { cols: number; rows: number; cells: Uint8Array; revealed: number };

export function newGrid(cols = GRID_COLS, rows = GRID_ROWS): RevealGrid {
  return { cols, rows, cells: new Uint8Array(cols * rows), revealed: 0 };
}

/** About a ninth of the picture's width, kept between a thumb-sized and a hand-sized brush. */
export function brushRadius(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MIN_BRUSH_PX;
  return Math.min(MAX_BRUSH_PX, Math.max(MIN_BRUSH_PX, Math.round(width * 0.09)));
}

/** Marks every cell whose centre is within `radius` of the point. Returns how many cells are newly revealed. */
export function paintAt(grid: RevealGrid, x: number, y: number, radius: number, width: number, height: number): number {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const cellW = width / grid.cols;
  const cellH = height / grid.rows;
  const c0 = Math.max(0, Math.floor((x - radius) / cellW));
  const c1 = Math.min(grid.cols - 1, Math.floor((x + radius) / cellW));
  const r0 = Math.max(0, Math.floor((y - radius) / cellH));
  const r1 = Math.min(grid.rows - 1, Math.floor((y + radius) / cellH));
  let added = 0;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const i = r * grid.cols + c;
      if (grid.cells[i]) continue;
      const dx = (c + 0.5) * cellW - x;
      const dy = (r + 0.5) * cellH - y;
      if (dx * dx + dy * dy <= radius * radius) {
        grid.cells[i] = 1;
        added += 1;
      }
    }
  }
  grid.revealed += added;
  return added;
}

/** Points along a drag from a to b, at most half a brush apart, so a fast swipe leaves no gaps. */
export function strokePoints(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): { x: number; y: number }[] {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
  return Array.from({ length: steps }, (_, i) => ({ x: a.x + ((b.x - a.x) * (i + 1)) / steps, y: a.y + ((b.y - a.y) * (i + 1)) / steps }));
}

/** Whole-number percent revealed, 0 to 100. */
export function coveragePercent(grid: RevealGrid): number {
  return Math.min(100, Math.floor((grid.revealed / (grid.cols * grid.rows)) * 100));
}

export const isRevealDone = (percent: number) => percent >= DONE_AT_PERCENT;

/** Where an image drawn with object-fit: cover lands in a frame, for drawing it onto a canvas the same way. */
export function coverRect(imageW: number, imageH: number, frameW: number, frameH: number): { x: number; y: number; w: number; h: number } {
  if (!(imageW > 0) || !(imageH > 0) || !(frameW > 0) || !(frameH > 0)) return { x: 0, y: 0, w: frameW, h: frameH };
  const scale = Math.max(frameW / imageW, frameH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/** A hands-on reveal offers at most this many tools (e.g. a wide surface cleaner, a 25° tip, a 40° tip). */
export const MAX_BRUSH_TOOLS = 3;

/**
 * Brush radius for the chosen tool. Tools are authored widest first, so the
 * first one paints at the normal radius and each later one is narrower — a
 * detail tip, never a bigger brush than the picture allows.
 */
export function toolRadius(width: number, tool: number, count: number): number {
  const base = brushRadius(width);
  if (!(count > 1) || !Number.isFinite(tool) || tool <= 0) return base;
  const index = Math.min(count - 1, Math.floor(tool));
  const scale = 1 - (index / (count - 1)) * 0.55;
  return Math.max(Math.round(MIN_BRUSH_PX * 0.6), Math.round(base * scale));
}

/** Elapsed time as m:ss for the reveal's stopwatch. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
