/**
 * AI-authored composition trees.
 *
 * The AI composes these primitives into any structure it invents. The
 * primitives are building blocks only — nothing here chooses a layout, order,
 * wording or style. The validator is a safety gate: it returns "valid" or a
 * list of issues for the AI to repair. It NEVER returns a substitute design.
 */
import { contrastRatio } from "@/lib/readable-color";

export const COMPOSITION_PRIMITIVES = [
  "stack", "grid", "row", "text", "heading", "media", "button", "link",
  "card", "list", "divider", "spacer", "icon",
  "tabs", "toggle", "accordion", "compare", "marquee", "gallery", "quote",
] as const;

/** How the interactive building blocks are used. Describes mechanics only — never a layout. */
export const PRIMITIVE_GUIDE =
  "Interactive blocks: tabs (each child is one panel; the child's text is its tab label), " +
  "toggle (exactly two children, e.g. monthly/one-time price views; each child's text is its switch label — only real supplied prices), " +
  "accordion (each child is one expandable item; the child's text is its question/title, its children are the answer), " +
  "compare (exactly two media children: before then after — renders a drag slider), " +
  "marquee (children scroll sideways in a loop; stops for reduced motion), " +
  "gallery (media children in a grid; tap opens full size), " +
  "quote (text is the quoted words; items[0] optional attribution — only real, supplied quotes). " +
  "Layering: style.position (relative|sticky|absolute), style.top/left/right/bottom (px), style.zIndex (0-50), style.overlap (px a block pulls up over the one before it), style.blur (frosted-glass backdrop px), style.rotate (deg), style.gridAreas + style.area for named grid regions. " +
  "Motion: motion.kind fade|rise|scale|float|slide-left|slide-right|blur|reveal, motion.delayMs, motion.durationMs; all motion is skipped for reduced-motion visitors.";
export const MOTION_KINDS = ["none", "fade", "rise", "scale", "float", "slide-left", "slide-right", "blur", "reveal"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];
export type CompositionPrimitive = (typeof COMPOSITION_PRIMITIVES)[number];
export type Breakpoint = "mobile" | "tablet" | "desktop";

export type NodeStyle = {
  columns?: number;
  gap?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  justify?: "start" | "center" | "end" | "between";
  items?: "start" | "center" | "end" | "stretch";
  span?: number;
  size?: number;
  weight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  uppercase?: boolean;
  font?: string;
  color?: string;
  background?: string;
  gradientTo?: string;
  gradientAngle?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: "none" | "subtle" | "medium" | "strong";
  opacity?: number;
  aspect?: string;
  objectFit?: "cover" | "contain" | "fill";
  minHeight?: number;
  hidden?: boolean;
  position?: "relative" | "sticky" | "absolute";
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  zIndex?: number;
  overlap?: number;
  blur?: number;
  rotate?: number;
  gridAreas?: string;
  area?: string;
};

export type CompositionNode = {
  type: CompositionPrimitive;
  text?: string;
  href?: string;
  src?: string;
  mediaRef?: string;
  alt?: string;
  level?: 1 | 2 | 3 | 4;
  items?: string[];
  style?: NodeStyle;
  responsive?: Partial<Record<Breakpoint, NodeStyle>>;
  motion?: { kind: MotionKind; delayMs?: number; durationMs?: number };
  children?: CompositionNode[];
};

export type CompositionTree = { version: 1; label?: string; root: CompositionNode };

export type CompositionIssue = { path: string; problem: string };
export type CompositionResult =
  | { ok: true; tree: CompositionTree }
  | { ok: false; issues: CompositionIssue[] };

/** Performance/rendering-safety limits only — not creative limits. */
export const COMPOSITION_LIMITS = { maxDepth: 12, maxNodes: 600, maxText: 4000 } as const;

const NUMERIC: Record<string, [number, number]> = {
  columns: [1, 12], gap: [0, 240], padding: [0, 320], paddingX: [0, 320], paddingY: [0, 320],
  maxWidth: [200, 2400], span: [1, 12], size: [8, 200], weight: [100, 900], lineHeight: [0.7, 3],
  letterSpacing: [-0.05, 0.5], gradientAngle: [0, 360], radius: [0, 999], borderWidth: [0, 16],
  opacity: [0, 100], minHeight: [0, 1600],
  top: [-400, 1600], left: [-400, 1600], right: [-400, 1600], bottom: [-400, 1600],
  zIndex: [0, 50], overlap: [0, 400], blur: [0, 40], rotate: [-45, 45],
};
const ENUMS: Record<string, readonly string[]> = {
  align: ["left", "center", "right"],
  justify: ["start", "center", "end", "between"],
  items: ["start", "center", "end", "stretch"],
  shadow: ["none", "subtle", "medium", "strong"],
  objectFit: ["cover", "contain", "fill"],
  position: ["relative", "sticky", "absolute"],
};
const ENUM_ALIASES: Record<string, string> = {
  "space-between": "between", "flex-start": "start", "flex-end": "end",
};
const COLOR_KEYS = ["color", "background", "gradientTo", "borderColor"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SAFE_FONT = /^[a-z0-9 \-']{1,60}$/i;
const SAFE_AREA = /^[a-z][a-z0-9-]{0,30}$/i;
const SAFE_GRID_AREAS = /^(?:"[a-z0-9.\- ]{1,120}"\s*){1,12}$/i;
const SAFE_ASPECT = /^\d{1,2}:\d{1,2}$/;
const SAFE_MEDIA_REF = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|temp_[a-z0-9_]{1,30})$/i;
const UNSAFE_TEXT = /<\s*\/?\s*(script|iframe|object|embed|style)|javascript:|on\w+\s*=/i;

export function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (/^\/(?!\/)[\w\-./#?=&%]*$/.test(value)) return true;
  if (/^#[\w-]*$/.test(value)) return true;
  if (/^(tel:\+?[\d\s\-()]{3,30}|mailto:[^\s<>"]{3,200})$/i.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function checkStyle(style: unknown, path: string, issues: CompositionIssue[]): NodeStyle {
  if (style == null) return {};
  if (typeof style !== "object" || Array.isArray(style)) {
    issues.push({ path, problem: "style must be an object" });
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    const at = `${path}.${key}`;
    if (key in NUMERIC) {
      const [min, max] = NUMERIC[key]!;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push({ path: at, problem: `must be a number between ${min} and ${max}` });
      } else out[key] = Math.min(max, Math.max(min, value)); // clamped into the safe range
    } else if (key in ENUMS) {
      // Standard CSS spellings of the same choice are accepted as-is.
      const alias = typeof value === "string" ? ENUM_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase() : value;
      if (ENUMS[key]!.includes(alias as string)) out[key] = alias;
      else if (!ENUMS[key]!.includes(value as string)) issues.push({ path: at, problem: `must be one of ${ENUMS[key]!.join(", ")}` });
      else out[key] = value;
    } else if (COLOR_KEYS.includes(key)) {
      if (typeof value !== "string" || !HEX.test(value)) issues.push({ path: at, problem: "must be a #RRGGBB colour" });
      else out[key] = value;
    } else if (key === "font") {
      if (typeof value !== "string" || !SAFE_FONT.test(value)) issues.push({ path: at, problem: "font name contains unsafe characters" });
      else out[key] = value;
    } else if (key === "aspect") {
      if (typeof value !== "string" || !SAFE_ASPECT.test(value)) issues.push({ path: at, problem: "aspect must look like 16:9" });
      else out[key] = value;
    } else if (key === "area") {
      if (typeof value !== "string" || !SAFE_AREA.test(value)) issues.push({ path: at, problem: "area must be a simple name like media" });
      else out[key] = value;
    } else if (key === "gridAreas") {
      if (typeof value !== "string" || !SAFE_GRID_AREAS.test(value.trim())) issues.push({ path: at, problem: 'gridAreas must look like "media copy" "media cta"' });
      else out[key] = value.trim();
    } else if (key === "italic" || key === "uppercase" || key === "hidden") {
      if (typeof value !== "boolean") issues.push({ path: at, problem: "must be true or false" });
      else out[key] = value;
    } else {
      issues.push({ path: at, problem: "unknown style property" });
    }
  }
  const fg = out["color"] as string | undefined;
  const bg = out["background"] as string | undefined;
  if (fg && bg) {
    const ratio = contrastRatio(fg, bg);
    if (ratio != null && ratio < 4.5) issues.push({ path, problem: `text/background contrast ${ratio.toFixed(2)} is below 4.5` });
  }
  return out as NodeStyle;
}

function checkText(value: unknown, path: string, issues: CompositionIssue[], screen?: (text: string) => string | null): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    issues.push({ path, problem: "must be text" });
    return undefined;
  }
  if (value.length > COMPOSITION_LIMITS.maxText) issues.push({ path, problem: "text is too long" });
  if (UNSAFE_TEXT.test(value)) issues.push({ path, problem: "text contains markup or script" });
  const truth = screen?.(value);
  if (truth) issues.push({ path, problem: truth });
  return value;
}

export type ValidateOptions = {
  /** Truth screen: returns a problem description for an unsupported claim, else null. */
  screenText?: (text: string) => string | null;
  /** Picture references that can resolve inside this section. */
  allowedMediaRefs?: ReadonlySet<string>;
  /** Supplied pictures that must remain visible in the composition. */
  requiredMediaRefs?: ReadonlySet<string>;
};

export function validateComposition(input: unknown, options: ValidateOptions = {}): CompositionResult {
  const issues: CompositionIssue[] = [];
  let count = 0;
  const usedMediaRefs = new Set<string>();

  const walk = (raw: unknown, path: string, depth: number): CompositionNode | null => {
    count += 1;
    if (count > COMPOSITION_LIMITS.maxNodes) {
      if (count === COMPOSITION_LIMITS.maxNodes + 1) issues.push({ path, problem: `more than ${COMPOSITION_LIMITS.maxNodes} nodes` });
      return null;
    }
    if (depth > COMPOSITION_LIMITS.maxDepth) {
      issues.push({ path, problem: `nesting deeper than ${COMPOSITION_LIMITS.maxDepth}` });
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ path, problem: "node must be an object" });
      return null;
    }
    const row = raw as Record<string, unknown>;
    const type = row["type"];
    if (!COMPOSITION_PRIMITIVES.includes(type as CompositionPrimitive)) {
      issues.push({ path: `${path}.type`, problem: `unknown building block "${String(type)}"` });
      return null;
    }
    const node: CompositionNode = { type: type as CompositionPrimitive };
    const text = checkText(row["text"], `${path}.text`, issues, options.screenText);
    if (text !== undefined) node.text = text;
    const alt = checkText(row["alt"], `${path}.alt`, issues, options.screenText);
    if (alt !== undefined) node.alt = alt;
    for (const key of ["href", "src"] as const) {
      const value = row[key];
      if (value == null) continue;
      if (typeof value !== "string" || !isSafeHref(value)) issues.push({ path: `${path}.${key}`, problem: "unsafe or invalid address" });
      else node[key] = value;
    }
    if (row["mediaRef"] != null) {
      const mediaRef = row["mediaRef"];
      if (typeof mediaRef !== "string" || !SAFE_MEDIA_REF.test(mediaRef)) issues.push({ path: `${path}.mediaRef`, problem: "invalid website picture reference" });
      else if (options.allowedMediaRefs && !options.allowedMediaRefs.has(mediaRef))
        issues.push({ path: `${path}.mediaRef`, problem: "website picture reference does not belong to this section" });
      else {
        node.mediaRef = mediaRef;
        usedMediaRefs.add(mediaRef);
      }
    }
    if (node.type === "media" && !node.src && !node.mediaRef) issues.push({ path, problem: "images need a source or website picture reference" });
    if (node.type === "media" && (node.src || node.mediaRef) && !node.alt) issues.push({ path: `${path}.alt`, problem: "images need alt text" });
    if ((node.type === "button" || node.type === "link") && !node.href) issues.push({ path: `${path}.href`, problem: "buttons and links need a destination" });
    if (node.type === "quote" && !node.text) issues.push({ path: `${path}.text`, problem: "quote needs its words in text" });
    if (row["level"] != null) {
      if (![1, 2, 3, 4].includes(row["level"] as number)) issues.push({ path: `${path}.level`, problem: "level must be 1-4" });
      else node.level = row["level"] as 1 | 2 | 3 | 4;
    }
    if (row["items"] != null) {
      if (!Array.isArray(row["items"])) issues.push({ path: `${path}.items`, problem: "items must be a list of text" });
      else node.items = row["items"].map((item, i) => checkText(item, `${path}.items[${i}]`, issues, options.screenText) ?? "");
    }
    node.style = checkStyle(row["style"], `${path}.style`, issues);
    if (node.type === "button" && node.style.size != null && node.style.size < 14) {
      issues.push({ path: `${path}.style.size`, problem: "button text below 14px makes the tap target too small" });
    }
    if (row["responsive"] != null) {
      const responsive = row["responsive"];
      if (typeof responsive !== "object" || Array.isArray(responsive)) issues.push({ path: `${path}.responsive`, problem: "must be an object" });
      else {
        node.responsive = {};
        for (const [bp, style] of Object.entries(responsive as Record<string, unknown>)) {
          if (bp !== "mobile" && bp !== "tablet" && bp !== "desktop") issues.push({ path: `${path}.responsive.${bp}`, problem: "unknown breakpoint" });
          else {
            // Accept `{ mobile: { style: {...} } }` as the same thing as `{ mobile: {...} }`.
            const inner = style && typeof style === "object" && !Array.isArray(style) && Object.keys(style).length === 1 && "style" in style
              ? (style as { style: unknown }).style
              : style;
            node.responsive[bp] = checkStyle(inner, `${path}.responsive.${bp}`, issues);
          }
        }
      }
    }
    if (row["motion"] != null) {
      const motion = row["motion"] as Record<string, unknown>;
      const kind = motion?.["kind"];
      if (!MOTION_KINDS.includes(kind as MotionKind)) issues.push({ path: `${path}.motion.kind`, problem: "unknown motion" });
      else {
        const delay = motion["delayMs"];
        node.motion = { kind: kind as NonNullable<CompositionNode["motion"]>["kind"] };
        if (typeof delay === "number" && delay >= 0 && delay <= 3000) node.motion.delayMs = delay;
        const duration = motion["durationMs"];
        if (typeof duration === "number" && duration >= 150 && duration <= 4000) node.motion.durationMs = duration;
      }
    }
    if (row["children"] != null) {
      if (!Array.isArray(row["children"])) issues.push({ path: `${path}.children`, problem: "children must be a list" });
      else node.children = row["children"].map((child, i) => walk(child, `${path}.children[${i}]`, depth + 1)).filter((c): c is CompositionNode => c != null);
    }
    const kids = node.children ?? [];
    if ((node.type === "tabs" || node.type === "accordion") && (kids.length < 1 || kids.some((c) => !c.text))) {
      issues.push({ path: `${path}.children`, problem: `${node.type} needs at least one child and every child needs a text label` });
    }
    if (node.type === "compare" && (kids.length !== 2 || kids.some((c) => c.type !== "media" || (!c.src && !c.mediaRef)))) {
      issues.push({ path: `${path}.children`, problem: "compare needs exactly two media children with a picture source (before, after)" });
    }
    if (node.type === "gallery" && (kids.length < 1 || kids.some((c) => c.type !== "media" || (!c.src && !c.mediaRef)))) {
      issues.push({ path: `${path}.children`, problem: "gallery children must all be media with a picture source" });
    }
    if (node.type === "toggle" && (kids.length !== 2 || kids.some((c) => !c.text))) issues.push({ path: `${path}.children`, problem: "toggle needs exactly two children, each with a text label" });
    if (node.type === "marquee" && kids.length < 1) issues.push({ path: `${path}.children`, problem: "marquee needs children" });
    return node;
  };

  if (!input || typeof input !== "object") return { ok: false, issues: [{ path: "tree", problem: "tree must be an object" }] };
  const tree = input as Record<string, unknown>;
  const root = walk(tree["root"], "root", 0);
  const label = typeof tree["label"] === "string" ? tree["label"] : undefined;
  // Size limits fail loudly so the AI repairs the value — never a silent trim.
  if (label && label.length > 120) issues.push({ path: "label", problem: "label must be 120 characters or fewer" });
  for (const mediaRef of options.requiredMediaRefs ?? [])
    if (!usedMediaRefs.has(mediaRef))
      issues.push({ path: "root", problem: `supplied website picture ${mediaRef} is missing from the composition` });
  if (issues.length || !root) return { ok: false, issues: issues.length ? issues : [{ path: "root", problem: "missing root" }] };
  return { ok: true, tree: { version: 1, ...(label ? { label } : {}), root } };
}

/** Reads a stored tree for rendering. Invalid data renders nothing — never a substitute design. */
export function readComposition(settings: unknown): CompositionTree | null {
  const raw = (settings as Record<string, unknown> | null)?.["composition"];
  const result = validateComposition(raw);
  return result.ok ? result.tree : null;
}

export function writeComposition(settings: unknown, tree: CompositionTree): Record<string, unknown> {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {};
  base["composition"] = tree;
  return base;
}
