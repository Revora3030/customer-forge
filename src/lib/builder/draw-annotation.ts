/**
 * Draw-on-preview annotation (G-A10, the "draw" half; click-to-tag is CU-3).
 *
 * The owner circles, underlines, points at or scribbles over part of the live
 * preview and adds a few words. This file turns those strokes into one plain
 * message for the builder chat: what each mark did, which blocks and elements
 * it landed on (the same row ids and element paths CU-3's click-to-tag uses, so
 * the change stays scoped), and where on the screen it was.
 *
 * Pure and dependency-free so it is easy to test; the pointer handling and the
 * canvas live in `PreviewAnnotateLayer.tsx`.
 */

export type Pt = { x: number; y: number };

/** What a stroke looks like, in the owner's terms. */
export type MarkShape = "circle" | "underline" | "line" | "point" | "scribble" | "mark";

/** A block or element a mark landed on, as CU-3's preview bridge names them. */
export type MarkTarget = {
  /** The section or component row id (data-rvb). */
  id: string;
  label: string | null;
  kind: string | null;
  /** Exact element inside an AI layout (data-rvp), when the mark hit one. */
  path?: string | null;
  /** That element's type ("heading", "button", "media", …). */
  element?: string | null;
  /** A short snippet of the element's own words. */
  text?: string | null;
};

export type Mark = {
  shape: MarkShape;
  /** Where the stroke sits on the visible preview, 0..1 from the top-left. */
  centre: { x: number; y: number };
  targets: MarkTarget[];
};

export const MAX_MARKS = 8;
export const MAX_STROKE_POINTS = 160;
export const MAX_NOTE_CHARS = 600;
const MAX_TARGETS_PER_MARK = 3;
const MIN_SPACING = 3;

function finite(point: Pt): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Drops bad points and near-duplicates, and caps the length (first and last always kept). */
export function thinStroke(points: readonly Pt[]): Pt[] {
  const clean = points.filter(finite);
  const kept: Pt[] = [];
  for (const point of clean) {
    const last = kept[kept.length - 1];
    if (!last || dist(last, point) >= MIN_SPACING) kept.push(point);
  }
  const end = clean[clean.length - 1];
  if (end && kept.length > 0 && kept[kept.length - 1] !== end) kept.push(end);
  if (kept.length <= MAX_STROKE_POINTS) return kept;
  const step = (kept.length - 1) / (MAX_STROKE_POINTS - 1);
  const out: Pt[] = [];
  for (let i = 0; i < MAX_STROKE_POINTS; i += 1) out.push(kept[Math.round(i * step)] as Pt);
  return out;
}

export function strokeBounds(points: readonly Pt[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Sum of segment lengths. */
function pathLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += dist(points[i - 1] as Pt, points[i] as Pt);
  return total;
}

/** Signed and absolute turning, in radians, along the stroke. */
function turning(points: readonly Pt[]): { net: number; total: number } {
  let net = 0;
  let total = 0;
  for (let i = 2; i < points.length; i += 1) {
    const a = points[i - 2] as Pt;
    const b = points[i - 1] as Pt;
    const c = points[i] as Pt;
    const before = Math.atan2(b.y - a.y, b.x - a.x);
    const after = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = after - before;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    net += turn;
    total += Math.abs(turn);
  }
  return { net, total };
}

/** Names the stroke: a loop is a circle, a flat run an underline, a tangle a scribble. */
export function classifyStroke(input: readonly Pt[]): MarkShape {
  const points = thinStroke(input);
  if (points.length === 0) return "point";
  const box = strokeBounds(points);
  const diagonal = Math.hypot(box.w, box.h);
  if (diagonal < 14) return "point";
  const length = pathLength(points);
  const first = points[0] as Pt;
  const last = points[points.length - 1] as Pt;
  const chord = dist(first, last);
  const { net, total } = turning(points);

  if (Math.abs(net) > 4.6 && chord < 0.5 * diagonal && length > 1.6 * diagonal) return "circle";
  if (total > 9 && Math.abs(net) < 4.6) return "scribble";
  if (length > 3.4 * diagonal) return "scribble";
  if (length > 0 && chord / length > 0.8) {
    return box.w >= 40 && box.w > 2.5 * box.h ? "underline" : "line";
  }
  return "mark";
}

/**
 * Where to look under a stroke to find what it means. A circle or scribble
 * means what is inside it, an arrow means its tip, an underline the thing just
 * above it.
 */
export function probePoints(input: readonly Pt[], shape: MarkShape = classifyStroke(input)): Pt[] {
  const points = thinStroke(input);
  if (points.length === 0) return [];
  const box = strokeBounds(points);
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const first = points[0] as Pt;
  const last = points[points.length - 1] as Pt;
  switch (shape) {
    case "point":
      return [centre];
    case "line":
      return [last];
    case "underline":
      return [
        { x: centre.x, y: box.y - 10 },
        { x: box.x + box.w * 0.25, y: box.y - 10 },
        { x: box.x + box.w * 0.75, y: box.y - 10 },
        { x: centre.x, y: box.y },
      ];
    default: {
      const out: Pt[] = [centre];
      for (const fx of [0.3, 0.7])
        for (const fy of [0.3, 0.7]) out.push({ x: box.x + box.w * fx, y: box.y + box.h * fy });
      if (shape === "mark") out.push(first, last);
      return out;
    }
  }
}

/** What is under a point of the preview, or null. Supplied by the layer (it reads the frame). */
export type ResolveAt = (x: number, y: number) => MarkTarget | null;

function targetKey(target: MarkTarget): string {
  return `${target.id}|${target.path ?? ""}`;
}

/** Looks under a stroke and returns the most-hit blocks/elements, best first. */
export function resolveTargets(
  points: readonly Pt[],
  resolve: ResolveAt,
  shape?: MarkShape,
): MarkTarget[] {
  const kind = shape ?? classifyStroke(points);
  const hits = new Map<string, { target: MarkTarget; count: number; order: number }>();
  let order = 0;
  for (const probe of probePoints(points, kind)) {
    let target: MarkTarget | null = null;
    try {
      target = resolve(probe.x, probe.y);
    } catch {
      target = null;
    }
    if (!target || !target.id) continue;
    const key = targetKey(target);
    const seen = hits.get(key);
    if (seen) seen.count += 1;
    else hits.set(key, { target, count: 1, order: order++ });
  }
  return [...hits.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, MAX_TARGETS_PER_MARK)
    .map((hit) => hit.target);
}

/** Turns one finished stroke into a mark. `viewport` is the frame's visible size, for the "where". */
export function makeMark(
  input: readonly Pt[],
  resolve: ResolveAt,
  viewport: { width: number; height: number },
): Mark | null {
  const points = thinStroke(input);
  if (points.length === 0) return null;
  const shape = classifyStroke(points);
  const box = strokeBounds(points);
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    shape,
    centre: {
      x: clamp((box.x + box.w / 2) / Math.max(1, viewport.width)),
      y: clamp((box.y + box.h / 2) / Math.max(1, viewport.height)),
    },
    targets: resolveTargets(points, resolve, shape),
  };
}

const VERBS: Record<MarkShape, string> = {
  circle: "circled",
  underline: "underlined",
  line: "drew an arrow or line pointing at",
  point: "pointed at",
  scribble: "scribbled over",
  mark: "marked",
};

/** "top-left", "middle", "bottom-right" of what is showing in the preview. */
export function whereLabel(centre: { x: number; y: number }): string {
  const row = centre.y < 0.34 ? "top" : centre.y > 0.66 ? "bottom" : "middle";
  const col = centre.x < 0.34 ? "left" : centre.x > 0.66 ? "right" : "centre";
  if (row === "middle" && col === "centre") return "the middle";
  if (row === "middle") return `the middle ${col}`;
  if (col === "centre") return `the ${row} centre`;
  return `the ${row}-${col}`;
}

/** Keeps free text safe inside the bracketed trailer: one line, no brackets or quotes. */
function plain(value: string | null | undefined, max: number): string {
  return (value ?? "")
    .replace(/[\r\n\t[\]"“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function describeTarget(target: MarkTarget): string {
  const name = plain(target.label ?? target.kind, 60) || "block";
  const block = `the ${name} block (id ${plain(target.id, 64)})`;
  if (target.path && target.element) {
    const snippet = plain(target.text, 60);
    return `the ${plain(target.element, 24).replace(/_/g, " ")}${snippet ? ` “${snippet}”` : ""} (element ${plain(target.path, 80)}) inside ${block}`;
  }
  return block;
}

export function describeMark(mark: Mark, index: number): string {
  const where = whereLabel(mark.centre);
  const what =
    mark.targets.length > 0
      ? mark.targets.map(describeTarget).join("; or ")
      : `an open area (no block under it) in ${where}`;
  const place = mark.targets.length > 0 ? ` (in ${where} of the view)` : "";
  return `${index + 1}) ${VERBS[mark.shape]} ${what}${place}`;
}

/**
 * The chat message. The owner's own words come first (that is what their chat
 * bubble shows); the bracketed trailer carries the ids so the change lands on
 * the right blocks. `ownerWords()` hides the trailer from the bubble.
 */
export function buildAnnotationMessage(input: {
  marks: readonly Mark[];
  note: string;
  pageTitle?: string | null;
  /** Width of the preview the owner drew on, e.g. 390 for the phone view. */
  viewportWidth?: number;
}): string {
  const note = input.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
  const marks = input.marks.slice(0, MAX_MARKS);
  const words = note || (marks.length > 0 ? "Please look at what I marked on the preview." : "");
  if (marks.length === 0) return words;
  const page = plain(input.pageTitle, 60);
  const width =
    input.viewportWidth && input.viewportWidth > 0
      ? `, at ${Math.round(input.viewportWidth)}px wide`
      : "";
  const lead = `Marked on the preview${page ? ` of the “${page}” page` : ""}${width}. The owner ${marks.length === 1 ? "drew 1 mark" : `drew ${marks.length} marks`} — apply the request above to what they marked, and nothing else: `;
  return `${words}\n\n[${lead}${marks.map(describeMark).join("; ")}.]`;
}

/** Matches the trailer `buildAnnotationMessage` adds, for `ownerWords()`. */
export const ANNOTATION_TRAILER = /\n\n\[Marked on the preview[^\]]*\]\s*$/;
