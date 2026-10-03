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
  "tabs", "toggle", "accordion", "compare", "marquee", "gallery", "quote", "widget",
  "before_after_slider", "faq_accordion", "tab_group", "mobile_sticky_bar",
] as const;

/** Working features an AI layout may place anywhere. Their data (prices, phone, email, hours) always comes from verified business facts. */
export const COMPOSITION_WIDGETS = ["booking_form", "quote_calculator", "contact_details", "direct_contact"] as const;
export type CompositionWidget = (typeof COMPOSITION_WIDGETS)[number];

export const COMPOSITION_WIDGET_FIELDS = [
  "service", "name", "phone", "email", "location", "date", "time", "details",
] as const;
export type CompositionWidgetField = (typeof COMPOSITION_WIDGET_FIELDS)[number];

/** AI-authored presentation for a working widget. Data and mechanics remain application-owned. */
export type WidgetPresentation = {
  eyebrow?: string;
  title?: string;
  description?: string;
  optionPrompt?: string;
  estimateLabel?: string;
  extraLabel?: string;
  actionLabel?: string;
  backLabel?: string;
  successTitle?: string;
  successBody?: string;
  contactLabel?: string;
  fieldLabels?: Partial<Record<CompositionWidgetField, string>>;
  theme?: {
    surface?: string;
    text?: string;
    muted?: string;
    border?: string;
    action?: string;
    actionText?: string;
    selected?: string;
    selectedText?: string;
  };
};
/** How the interactive building blocks are used. Describes mechanics only — never a layout. */
export const PRIMITIVE_GUIDE =
  "Interactive blocks: tabs (each child is one panel; the child's text is its tab label), " +
  "toggle (exactly two children, e.g. monthly/one-time price views; each child's text is its switch label — only real supplied prices), " +
  "accordion (each child is one expandable item; the child's text is its question/title, its children are the answer), " +
  "compare (exactly two media children: before then after — renders a drag slider), " +
  "marquee (children scroll sideways in a loop; stops for reduced motion), " +
  "gallery (media children in a grid; tap opens full size), " +
  "quote (text is the quoted words; items[0] optional attribution — only real, supplied quotes). " +
  "before_after_slider (beforeImage + afterImage with a 0-100 split; use for genuine transformation work such as renovation, roofing or detailing). " +
  "faq_accordion (items are question/answer pairs; defaultOpen is optional and at most the supplied FAQ content may be used). " +
  "tab_group (tabs are labelled panels; each tab owns child nodes and only the active panel is rendered). " +
  "mobile_sticky_bar (primaryCta and optional secondaryCta; conversion actions only, hidden above the mobile breakpoint). " +
  "widget (text is one of booking_form|quote_calculator|contact_details|direct_contact — drops the site's real working form or verified phone/email/hours/area into your layout; style its wrapper freely, never retype those facts yourself). For working widgets, widgetPresentation may author visible labels, helper/success copy and a bounded local theme (surface, text, muted, border, action, actionText, selected, selectedText); never put business data or pricing into widgetPresentation — the application supplies those facts. " +
  "Real company logos: a media src of https://img.logo.dev/<domain> (e.g. img.logo.dev/stripe.com) renders that company's real logo — use ONLY for companies the customer actually named as partners, clients or platforms they use; never invent an affiliation. " +
  "Layering: style.position (relative|sticky|absolute), style.top/left/right/bottom (px), style.zIndex (0-50), style.overlap (px a block pulls up over the one before it), style.blur (frosted-glass backdrop px), style.rotate (deg), style.gridAreas + style.area for named grid regions. " +
  "Motion: motion.kind fade|rise|scale|float|slide-left|slide-right|blur|reveal, motion.delayMs, motion.durationMs, motion.easing (ease|ease-in|ease-out|ease-in-out|linear|spring|snap); presets are optional shortcuts. " +
  "Or design your own: motion.kind custom with motion.from { opacity 0-100, x/y px -240..240, scale 0.5-1.5, rotate deg -45..45, blur px 0-24 } (the block animates from those values to its designed state), " +
  "motion.repeat (1-3 plays, or loop for a gentle back-and-forth), motion.trigger (load|view). " +
  "Pointer/touch response: hover { scale 0.9-1.15, x/y px -24..24, rotate deg -10..10, opacity 40-100, shadow none|subtle|medium|strong, durationMs 100-800 } — applies on hover, keyboard focus and touch press. All motion is skipped for reduced-motion visitors.";
export const MOTION_KINDS = ["none", "fade", "rise", "scale", "float", "slide-left", "slide-right", "blur", "reveal", "custom"] as const;
export const MOTION_EASINGS = ["ease", "ease-in", "ease-out", "ease-in-out", "linear", "spring", "snap"] as const;
export type MotionEasing = (typeof MOTION_EASINGS)[number];
export type MotionFrom = { opacity?: number; x?: number; y?: number; scale?: number; rotate?: number; blur?: number };
/** Rendering-safety bounds for AI-described motion — not creative choices. */
export const MOTION_FROM_LIMITS: Record<keyof MotionFrom, [number, number]> = {
  opacity: [0, 100], x: [-240, 240], y: [-240, 240], scale: [0.5, 1.5], rotate: [-45, 45], blur: [0, 24],
};
export type NodeHover = { scale?: number; x?: number; y?: number; rotate?: number; opacity?: number; shadow?: "none" | "subtle" | "medium" | "strong"; durationMs?: number };
export const HOVER_LIMITS: Record<"scale" | "x" | "y" | "rotate" | "opacity" | "durationMs", [number, number]> = {
  scale: [0.9, 1.15], x: [-24, 24], y: [-24, 24], rotate: [-10, 10], opacity: [40, 100], durationMs: [100, 800],
};
export type NodeMotion = {
  kind: MotionKind; delayMs?: number; durationMs?: number; easing?: MotionEasing;
  from?: MotionFrom; repeat?: 1 | 2 | 3 | "loop"; trigger?: "load" | "view";
};
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

export type CompositionImage = {
  src: string;
  alt: string;
  label: string;
};

export type CompositionFaqItem = {
  question: string;
  answer: string;
  defaultOpen?: boolean;
};

export type CompositionTab = {
  label: string;
  children: CompositionNode[];
};

export type CompositionCta = {
  label: string;
  href: string;
  ariaLabel?: string;
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
  beforeImage?: CompositionImage;
  afterImage?: CompositionImage;
  initialSplit?: number;
  faqItems?: CompositionFaqItem[];
  tabs?: CompositionTab[];
  primaryCta?: CompositionCta;
  secondaryCta?: CompositionCta;
  style?: NodeStyle;
  responsive?: Partial<Record<Breakpoint, NodeStyle>>;
  motion?: NodeMotion;
  hover?: NodeHover;
  /** AI-authored labels and visual theme for a working widget; never contains business data. */
  widgetPresentation?: WidgetPresentation;
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
const SAFE_GRID_ROW = /^[a-z0-9.\- ]{1,120}$/i;

/**
 * Lossless spelling normalisation for grid-template-areas: the AI may write
 * rows as an array, with single quotes, or unquoted rows separated by "/" or
 * newlines. Every form is rewritten to the canonical quoted CSS form; anything
 * with other characters is rejected, never guessed.
 */
export function normalizeGridAreas(value: unknown): string | null {
  let rows: string[];
  if (Array.isArray(value)) rows = value.map((row) => (typeof row === "string" ? row : "\u0000"));
  else if (typeof value === "string") {
    const text = value.trim();
    if (SAFE_GRID_AREAS.test(text)) return text;
    const quoted = [...text.matchAll(/["']([^"']*)["']/g)].map((m) => m[1]!);
    rows = quoted.length ? quoted : text.split(/\s*[/\n;|]\s*/);
  } else return null;
  rows = rows.map((row) => row.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!rows.length || rows.length > 12 || !rows.every((row) => SAFE_GRID_ROW.test(row))) return null;
  return rows.map((row) => `"${row}"`).join(" ");
}
const SAFE_ASPECT = /^\d{1,2}:\d{1,2}$/;

/**
 * Lossless spelling normalisation for aspect ratios: "16/9", "16 / 9", "4x5",
 * "1", 1.5 and "square" all mean one exact ratio and become "a:b".
 */
export function normalizeAspect(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) value = String(value);
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (SAFE_ASPECT.test(text)) return text;
  if (text === "square") return "1:1";
  const pair = text.match(/^(\d{1,2})\s*[/x×:]\s*(\d{1,2})$/);
  if (pair) return `${pair[1]}:${pair[2]}`;
  const ratio = text.match(/^(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (ratio) {
    const scale = ratio[2] ? 10 ** ratio[2].length : 1;
    const a = Number(ratio[1]) * scale + Number(ratio[2] ?? 0);
    if (a > 0 && a <= 99 && scale <= 99) return `${a}:${scale}`;
  }
  return null;
}
const SAFE_MEDIA_REF = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|temp_[a-z0-9_]{1,30})$/i;
const UNSAFE_TEXT = /<\s*\/?\s*(script|iframe|object|embed|style)|javascript:|on\w+\s*=/i;

export function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (/^\/(?!\/)[\w\-./#?=&%]*$/.test(value)) {
    // No "." or ".." path segments: they can climb out of the site's own pages.
    const path = value.split(/[?#]/)[0] ?? "";
    return !/(^|\/)\.\.?(\/|$)/.test(path);
  }
  if (/^#[\w-]*$/.test(value)) return true;
  if (/^(tel:\+?[\d\s\-()]{3,30}|mailto:[^\s<>"]{3,200})$/i.test(value)) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const CSS_KEYS: Record<string, string> = {
  justifyContent: "justify", textAlign: "align", alignItems: "items", fontFamily: "font", fontSize: "size",
  fontWeight: "weight", borderRadius: "radius", backgroundColor: "background", fontStyle: "italic",
};
const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 800 };
const PX = /^\s*(-?\d+(?:\.\d+)?)\s*(px)?\s*$/i;
/**
 * Translates standard CSS spellings of the same value into this schema's
 * shape ("24px" → 24, padding "16px 32px" → paddingY/paddingX, justifyContent →
 * justify). It never chooses a value; anything it can't translate is passed
 * through so the validator reports it.
 */
function cssSpellings(style: Record<string, unknown>): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [rawKey, value] of Object.entries(style)) {
    const key = CSS_KEYS[rawKey] ?? rawKey;
    if (rawKey === "fontStyle" && typeof value === "string") { out.push(["italic", value.trim() === "italic"]); continue; }
    if (rawKey === "textTransform" && typeof value === "string") { out.push(["uppercase", value.trim() === "uppercase"]); continue; }
    if (key === "font" && typeof value === "string") {
      out.push([key, value.split(",")[0]!.replace(/["']/g, "").trim()]);
      continue;
    }
    if (key === "weight" && typeof value === "string" && WEIGHT_WORDS[value.trim().toLowerCase()]) {
      out.push([key, WEIGHT_WORDS[value.trim().toLowerCase()]]);
      continue;
    }
    if (key in NUMERIC && typeof value === "string") {
      const parts = value.trim().split(/\s+/);
      const nums = parts.map((part) => PX.exec(part)?.[1]).map((n) => (n === undefined ? NaN : Number(n)));
      if (nums.every(Number.isFinite)) {
        if (nums.length === 1) { out.push([key, nums[0]]); continue; }
        if (key === "padding" && nums.length >= 2) { out.push(["paddingY", nums[0]], ["paddingX", nums[1]]); continue; }
      }
    }
    out.push([key, value]);
  }
  return out;
}

function checkStyle(style: unknown, path: string, issues: CompositionIssue[], nodeType?: CompositionPrimitive): NodeStyle {
  if (style == null) return {};
  if (typeof style !== "object" || Array.isArray(style)) {
    issues.push({ path, problem: "style must be an object" });
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of cssSpellings(style as Record<string, unknown>)) {
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
      const aspect = normalizeAspect(value);
      if (!aspect) issues.push({ path: at, problem: "aspect must look like 16:9" });
      else out[key] = aspect;
    } else if (key === "area") {
      if (typeof value !== "string" || !SAFE_AREA.test(value)) issues.push({ path: at, problem: "area must be a simple name like media" });
      else out[key] = value;
    } else if (key === "gridAreas") {
      const normalized = normalizeGridAreas(value);
      if (!normalized) issues.push({ path: at, problem: 'gridAreas must look like "media copy" "media cta"' });
      else out[key] = normalized;
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
    // WCAG AA: 3:1 is the requirement for large text (24px+, or 18.66px+
    // bold). Holding big headings to 4.5:1 rejected many sound designs and
    // pushed whole sections onto the basic fallback layout.
    const size = typeof out["size"] === "number" ? (out["size"] as number) : null;
    const weight = typeof out["weight"] === "number" ? (out["weight"] as number) : null;
    const large = nodeType === "heading" ? size == null || size >= 24 || (size >= 18.66 && (weight ?? 700) >= 700) : size != null && (size >= 24 || (size >= 18.66 && (weight ?? 400) >= 700));
    const required = large ? 3 : 4.5;
    if (ratio != null && ratio < required) issues.push({ path, problem: `text/background contrast ${ratio.toFixed(2)} is below ${required}` });
  }
  return out as NodeStyle;
}

function checkWidgetPresentation(value: unknown, path: string, issues: CompositionIssue[], screen?: (text: string) => string | null): WidgetPresentation | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ path, problem: "widgetPresentation must be an object" });
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const out: WidgetPresentation = {};
  const textKeys = [
    "eyebrow", "title", "description", "optionPrompt", "estimateLabel", "extraLabel",
    "actionLabel", "backLabel", "successTitle", "successBody", "contactLabel",
  ] as const;
  for (const key of textKeys) {
    const checked = checkText(raw[key], `${path}.${key}`, issues, screen);
    if (checked !== undefined) out[key] = checked.slice(0, 240);
  }
  if (raw["fieldLabels"] != null) {
    const labels = raw["fieldLabels"];
    if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
      issues.push({ path: `${path}.fieldLabels`, problem: "fieldLabels must be an object" });
    } else {
      const checked: Partial<Record<CompositionWidgetField, string>> = {};
      for (const [key, value_] of Object.entries(labels as Record<string, unknown>)) {
        if (!(COMPOSITION_WIDGET_FIELDS as readonly string[]).includes(key)) {
          issues.push({ path: `${path}.fieldLabels.${key}`, problem: "unknown widget field label" });
          continue;
        }
        const text = checkText(value_, `${path}.fieldLabels.${key}`, issues, screen);
        if (text !== undefined) checked[key as CompositionWidgetField] = text.slice(0, 120);
      }
      if (Object.keys(checked).length) out.fieldLabels = checked;
    }
  }
  if (raw["theme"] != null) {
    const theme = raw["theme"];
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
      issues.push({ path: `${path}.theme`, problem: "theme must be an object" });
    } else {
      const rawTheme = theme as Record<string, unknown>;
      const themeOut: NonNullable<WidgetPresentation["theme"]> = {};
      const keys = ["surface", "text", "muted", "border", "action", "actionText", "selected", "selectedText"] as const;
      for (const key of keys) {
        const color = rawTheme[key];
        if (color == null) continue;
        if (typeof color !== "string" || !HEX.test(color)) {
          issues.push({ path: `${path}.theme.${key}`, problem: "widget theme colours must be #RGB or #RRGGBB" });
        } else themeOut[key] = color;
      }
      const surface = themeOut.surface;
      const text = themeOut.text;
      if (surface && text) {
        const ratio = contrastRatio(text, surface);
        if (ratio != null && ratio < 4.5)
          issues.push({ path: `${path}.theme`, problem: `widget text/surface contrast ${ratio.toFixed(2)} is below 4.5` });
      }
      const action = themeOut.action;
      const actionText = themeOut.actionText;
      if (action && actionText) {
        const ratio = contrastRatio(actionText, action);
        if (ratio != null && ratio < 4.5)
          issues.push({ path: `${path}.theme`, problem: `widget action contrast ${ratio.toFixed(2)} is below 4.5` });
      }
      const selected = themeOut.selected;
      const selectedText = themeOut.selectedText;
      if (selected && selectedText) {
        const ratio = contrastRatio(selectedText, selected);
        if (ratio != null && ratio < 4.5)
          issues.push({ path: `${path}.theme`, problem: `widget selected-state contrast ${ratio.toFixed(2)} is below 4.5` });
      }
      if (Object.keys(themeOut).length) out.theme = themeOut;
    }
  }
  return Object.keys(out).length ? out : undefined;
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
  /**
   * Rendering a saved tree: quality findings (contrast, an unknown style
   * key, a small button label, long text) are not safety problems and must
   * not make a whole live section disappear. Only unsafe or structurally
   * broken trees are refused. Generation keeps the strict default so the AI
   * still repairs those findings before anything is saved.
   */
  lenient?: boolean;
};

const SOFT_PROBLEM = /contrast|unknown style property|button text below 14px|text is too long|label must be 120|must be one of|must be a number between|must be true or false|font name contains|aspect must look like|area must be a simple name|gridAreas must look like|must be 0-3000|must be 150-4000|unknown motion|unknown hover property|must be none, subtle|from is only used|custom motion needs|ariaLabel must be text/;

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
    if (node.type === "widget" && !COMPOSITION_WIDGETS.includes(node.text as CompositionWidget)) issues.push({ path: `${path}.text`, problem: `widget must be one of ${COMPOSITION_WIDGETS.join(", ")}` });
    if (row["widgetPresentation"] != null) {
      if (node.type !== "widget") issues.push({ path: `${path}.widgetPresentation`, problem: "widgetPresentation is only valid on widget nodes" });
      else { const presentation = checkWidgetPresentation(row["widgetPresentation"], `${path}.widgetPresentation`, issues, options.screenText); if (presentation !== undefined) node.widgetPresentation = presentation; }
    }
    if (node.type === "quote" && !node.text) issues.push({ path: `${path}.text`, problem: "quote needs its words in text" });

    const checkImageObject = (value: unknown, imagePath: string): CompositionImage | undefined => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issues.push({ path: imagePath, problem: "image must be an object with src, alt and label" });
        return undefined;
      }
      const image = value as Record<string, unknown>;
      const src = image["src"];
      const alt = checkText(image["alt"], `${imagePath}.alt`, issues, options.screenText);
      const label = checkText(image["label"], `${imagePath}.label`, issues, options.screenText);
      if (typeof src !== "string" || !isSafeHref(src)) {
        issues.push({ path: `${imagePath}.src`, problem: "image source must be a safe https address" });
        return undefined;
      }
      if (!alt || !label) {
        issues.push({ path: imagePath, problem: "image needs alt text and a visible label" });
        return undefined;
      }
      return { src, alt, label };
    };

    if (row["beforeImage"] != null) {
      const image = checkImageObject(row["beforeImage"], `${path}.beforeImage`);
      if (image) node.beforeImage = image;
    }
    if (row["afterImage"] != null) {
      const image = checkImageObject(row["afterImage"], `${path}.afterImage`);
      if (image) node.afterImage = image;
    }
    if (row["initialSplit"] != null) {
      const split = row["initialSplit"];
      if (typeof split !== "number" || !Number.isFinite(split) || split < 0 || split > 100)
        issues.push({ path: `${path}.initialSplit`, problem: "initialSplit must be a number from 0 to 100" });
      else node.initialSplit = split;
    }

    if (row["faqItems"] != null) {
      const value = row["faqItems"];
      if (!Array.isArray(value) || value.length < 1) {
        issues.push({ path: `${path}.faqItems`, problem: "faqItems must contain at least one item" });
      } else {
        node.faqItems = value.map((item, i) => {
          const itemPath = `${path}.faqItems[${i}]`;
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            issues.push({ path: itemPath, problem: "FAQ item must be an object" });
            return null;
          }
          const rawItem = item as Record<string, unknown>;
          const question = checkText(rawItem["question"], `${itemPath}.question`, issues, options.screenText);
          const answer = checkText(rawItem["answer"], `${itemPath}.answer`, issues, options.screenText);
          const defaultOpen = rawItem["defaultOpen"];
          if (defaultOpen != null && typeof defaultOpen !== "boolean")
            issues.push({ path: `${itemPath}.defaultOpen`, problem: "defaultOpen must be true or false" });
          return question && answer ? { question, answer, ...(defaultOpen === true ? { defaultOpen: true } : {}) } : null;
        }).filter((item): item is CompositionFaqItem => item != null);
      }
    }

    if (row["tabs"] != null) {
      const value = row["tabs"];
      if (!Array.isArray(value) || value.length < 1) {
        issues.push({ path: `${path}.tabs`, problem: "tabs must contain at least one panel" });
      } else {
        node.tabs = value.map((tab, i) => {
          const tabPath = `${path}.tabs[${i}]`;
          if (!tab || typeof tab !== "object" || Array.isArray(tab)) {
            issues.push({ path: tabPath, problem: "tab must be an object" });
            return null;
          }
          const rawTab = tab as Record<string, unknown>;
          const label = checkText(rawTab["label"], `${tabPath}.label`, issues, options.screenText);
          if (!Array.isArray(rawTab["children"])) {
            issues.push({ path: `${tabPath}.children`, problem: "tab children must be a list" });
            return null;
          }
          const children = rawTab["children"].map((child, j) => walk(child, `${tabPath}.children[${j}]`, depth + 1)).filter((child): child is CompositionNode => child != null);
          return label ? { label, children } : null;
        }).filter((tab): tab is CompositionTab => tab != null);
      }
    }

    const checkCta = (value: unknown, ctaPath: string): CompositionCta | undefined => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issues.push({ path: ctaPath, problem: "CTA must be an object with label and href" });
        return undefined;
      }
      const cta = value as Record<string, unknown>;
      const label = checkText(cta["label"], `${ctaPath}.label`, issues, options.screenText);
      const href = cta["href"];
      if (typeof href !== "string" || !isSafeHref(href)) {
        issues.push({ path: `${ctaPath}.href`, problem: "CTA href must be a safe address" });
        return undefined;
      }
      const ariaLabel = cta["ariaLabel"];
      if (ariaLabel != null && typeof ariaLabel !== "string") issues.push({ path: `${ctaPath}.ariaLabel`, problem: "ariaLabel must be text" });
      return label ? { label, href, ...(typeof ariaLabel === "string" ? { ariaLabel: ariaLabel.slice(0, 240) } : {}) } : undefined;
    };

    if (row["primaryCta"] != null) {
      const cta = checkCta(row["primaryCta"], `${path}.primaryCta`);
      if (cta) node.primaryCta = cta;
    }
    if (row["secondaryCta"] != null) {
      const cta = checkCta(row["secondaryCta"], `${path}.secondaryCta`);
      if (cta) node.secondaryCta = cta;
    }

    if (node.type === "before_after_slider" && (!node.beforeImage || !node.afterImage))
      issues.push({ path, problem: "before_after_slider needs beforeImage and afterImage" });
    if (node.type === "faq_accordion" && !node.faqItems?.length)
      issues.push({ path, problem: "faq_accordion needs at least one FAQ item" });
    if (node.type === "tab_group" && !node.tabs?.length)
      issues.push({ path, problem: "tab_group needs at least one tab" });
    if (node.type === "mobile_sticky_bar" && !node.primaryCta)
      issues.push({ path: `${path}.primaryCta`, problem: "mobile_sticky_bar needs a primary CTA" });

    if (row["level"] != null) {
      if (![1, 2, 3, 4].includes(row["level"] as number)) issues.push({ path: `${path}.level`, problem: "level must be 1-4" });
      else node.level = row["level"] as 1 | 2 | 3 | 4;
    }
    if (row["items"] != null) {
      if (!Array.isArray(row["items"])) issues.push({ path: `${path}.items`, problem: "items must be a list of text" });
      else node.items = row["items"].map((item, i) => checkText(item, `${path}.items[${i}]`, issues, options.screenText) ?? "");
    }
    node.style = checkStyle(row["style"], `${path}.style`, issues, node.type);
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
            node.responsive[bp] = checkStyle(inner, `${path}.responsive.${bp}`, issues, node.type);
          }
        }
      }
    }
    if (row["motion"] != null) {
      const motion = row["motion"] as Record<string, unknown>;
      const kind = motion?.["kind"];
      if (!MOTION_KINDS.includes(kind as MotionKind)) issues.push({ path: `${path}.motion.kind`, problem: "unknown motion" });
      else {
        const m: NodeMotion = { kind: kind as MotionKind };
        const bad = (key: string, problem: string) => issues.push({ path: `${path}.motion.${key}`, problem });
        const delay = motion["delayMs"];
        if (delay != null) { if (typeof delay === "number" && delay >= 0 && delay <= 3000) m.delayMs = delay; else bad("delayMs", "must be 0-3000"); }
        const duration = motion["durationMs"];
        if (duration != null) { if (typeof duration === "number" && duration >= 150 && duration <= 4000) m.durationMs = duration; else bad("durationMs", "must be 150-4000"); }
        const easing = motion["easing"];
        if (easing != null) { if (MOTION_EASINGS.includes(easing as MotionEasing)) m.easing = easing as MotionEasing; else bad("easing", `must be one of ${MOTION_EASINGS.join(", ")}`); }
        const repeat = motion["repeat"];
        if (repeat != null) { if (repeat === 1 || repeat === 2 || repeat === 3 || repeat === "loop") m.repeat = repeat; else bad("repeat", "must be 1, 2, 3 or loop"); }
        const trigger = motion["trigger"];
        if (trigger != null) { if (trigger === "load" || trigger === "view") m.trigger = trigger; else bad("trigger", "must be load or view"); }
        const from = motion["from"];
        if (m.kind === "custom") {
          if (!from || typeof from !== "object" || Array.isArray(from)) bad("from", "custom motion needs a from object");
          else {
            const out: MotionFrom = {};
            for (const [k, v] of Object.entries(from as Record<string, unknown>)) {
              const range = MOTION_FROM_LIMITS[k as keyof MotionFrom];
              if (!range) bad(`from.${k}`, "unknown motion property");
              else if (typeof v !== "number" || !Number.isFinite(v) || v < range[0] || v > range[1]) bad(`from.${k}`, `must be ${range[0]}..${range[1]}`);
              else out[k as keyof MotionFrom] = v;
            }
            if (!Object.keys(out).length) bad("from", "custom motion needs at least one starting value");
            m.from = out;
          }
        } else if (from != null) bad("from", "from is only used with kind custom");
        node.motion = m;
      }
    }
    if (row["hover"] != null) {
      const hover = row["hover"];
      if (!hover || typeof hover !== "object" || Array.isArray(hover)) issues.push({ path: `${path}.hover`, problem: "must be an object" });
      else {
        const out: NodeHover = {};
        for (const [k, v] of Object.entries(hover as Record<string, unknown>)) {
          if (k === "shadow") {
            if (v === "none" || v === "subtle" || v === "medium" || v === "strong") out.shadow = v;
            else issues.push({ path: `${path}.hover.shadow`, problem: "must be none, subtle, medium or strong" });
            continue;
          }
          const range = HOVER_LIMITS[k as keyof typeof HOVER_LIMITS];
          if (!range) issues.push({ path: `${path}.hover.${k}`, problem: "unknown hover property" });
          else if (typeof v !== "number" || !Number.isFinite(v) || v < range[0] || v > range[1]) issues.push({ path: `${path}.hover.${k}`, problem: `must be ${range[0]}..${range[1]}` });
          else (out as Record<string, number>)[k] = v;
        }
        if (Object.keys(out).length) node.hover = out;
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
    if (node.type === "mobile_sticky_bar" && kids.length)
      issues.push({ path: `${path}.children`, problem: "mobile_sticky_bar uses primaryCta/secondaryCta instead of child nodes" });
    if ((node.type === "before_after_slider" || node.type === "faq_accordion" || node.type === "tab_group") && kids.length)
      issues.push({ path: `${path}.children`, problem: `${node.type} uses its dedicated data fields instead of child nodes` });
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
  const blocking = options.lenient ? issues.filter((issue) => !SOFT_PROBLEM.test(issue.problem)) : issues;
  if (blocking.length || !root) return { ok: false, issues: blocking.length ? blocking : [{ path: "root", problem: "missing root" }] };
  return { ok: true, tree: { version: 1, ...(label && label.length <= 120 ? { label } : {}), root } };
}

/** Reads a stored tree for rendering. Invalid data renders nothing — never a substitute design. */
export function readComposition(settings: unknown): CompositionTree | null {
  const raw = (settings as Record<string, unknown> | null)?.["composition"];
  const result = validateComposition(raw, { lenient: true });
  return result.ok ? result.tree : null;
}

export function writeComposition(settings: unknown, tree: CompositionTree): Record<string, unknown> {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {};
  base["composition"] = tree;
  return base;
}

/**
 * Applies a block-style colour patch to every node in a composition tree so
 * that `set_block_style` changes are visible inside AI-authored layouts.
 *
 * The wrapper div gets the new colours, but the composition's inner nodes
 * carry their own hardcoded hex styles that paint over it. This walk remaps
 * those inner styles so the AI's colour change reaches every element.
 *
 * Only colour properties are touched — layout, spacing, typography size and
 * motion are left exactly as the AI authored them.
 */
export function restyleCompositionTree(
  tree: CompositionTree,
  patch: {
    bgColor?: string | null;
    textColor?: string | null;
    buttonBgColor?: string | null;
    buttonTextColor?: string | null;
    borderColor?: string | null;
  },
): CompositionTree {
  const hasColors = Boolean(
    patch.bgColor || patch.textColor || patch.buttonBgColor ||
    patch.buttonTextColor || patch.borderColor,
  );
  if (!hasColors) return tree;

  const walk = (node: CompositionNode): CompositionNode => {
    const style: NodeStyle = { ...(node.style ?? {}) };
    const isButton = node.type === "button" || node.type === "link";
    const isContainer = node.type === "grid" || node.type === "stack" ||
      node.type === "row" || node.type === "card";
    const isText = node.type === "heading" || node.type === "text" ||
      node.type === "list" || node.type === "quote";

    if (isButton) {
      if (patch.buttonBgColor) style.background = patch.buttonBgColor;
      if (patch.buttonTextColor) style.color = patch.buttonTextColor;
    } else if (isContainer) {
      if (patch.bgColor) style.background = patch.bgColor;
      if (patch.borderColor) style.borderColor = patch.borderColor;
    } else if (isText) {
      if (patch.textColor) style.color = patch.textColor;
    }

    // Responsive overrides get the same colour remap so the change holds
    // at every breakpoint the AI authored.
    const responsive = node.responsive
      ? Object.fromEntries(
          Object.entries(node.responsive).map(([bp, rs]) => {
            if (!rs) return [bp, rs];
            const rStyle: NodeStyle = { ...rs };
            if (isButton) {
              if (patch.buttonBgColor) rStyle.background = patch.buttonBgColor;
              if (patch.buttonTextColor) rStyle.color = patch.buttonTextColor;
            } else if (isContainer) {
              if (patch.bgColor) rStyle.background = patch.bgColor;
              if (patch.borderColor) rStyle.borderColor = patch.borderColor;
            } else if (isText) {
              if (patch.textColor) rStyle.color = patch.textColor;
            }
            return [bp, rStyle];
          }),
        )
      : node.responsive;

    const children = node.children?.map(walk);

    return { ...node, style, ...(responsive ? { responsive } : {}), ...(children ? { children } : {}) };
  };

  return { ...tree, root: walk(tree.root) };
}
