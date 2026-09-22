/**
 * Revora visual design model: safe, responsive, block-level styling.
 *
 * Every value a client picks in the visual builder is validated against a
 * closed allow-list (numeric scales, hex colours, safe URLs) before it can
 * become CSS, so a client can design freely without ever injecting markup,
 * scripts or arbitrary CSS.
 *
 * Design data lives inside the existing `settings` JSONB of a section or
 * component, which means it persists, undoes, versions and publishes through
 * the normal content path — the builder and the public renderer read the exact
 * same model, so what a client edits is what visitors see.
 *
 * Shape stored in `settings.style`:
 *
 *   { size: 32, padTop: 48, ..., tablet: { size: 28 }, mobile: { size: 24 } }
 *
 * Unset properties are `null` and emit no CSS at all, so untouched blocks keep
 * the generated template design exactly as it was. Tablet and mobile cascade
 * like CSS max-width media queries: mobile inherits tablet, tablet inherits
 * desktop.
 */
import type * as React from "react";
import { readableOn } from "@/lib/readable-color";
import { safeLinkUrl } from "@/lib/website-content";

/* ------------------------------- device tiers ------------------------------ */

export const DEVICES = ["desktop", "tablet", "mobile"] as const;
export type Device = (typeof DEVICES)[number];

/** Editing width of each tier, and the breakpoint it publishes under. */
export const DEVICE_META: Record<
  Device,
  { label: string; width: number; maxWidth: number | null }
> = {
  desktop: { label: "Desktop", width: 1180, maxWidth: null },
  tablet: { label: "Tablet", width: 834, maxWidth: 1023 },
  mobile: { label: "Mobile", width: 390, maxWidth: 639 },
};

/* ------------------------------ allowed values ----------------------------- */

export const FONT_FAMILIES = ["display", "body", "serif", "mono"] as const;
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const ALIGNMENTS = ["left", "center", "right"] as const;
export const TEXT_TRANSFORMS = ["none", "uppercase", "capitalize"] as const;
export const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96, 120, 144, 160] as const;
export const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.7, 2] as const;
export const LETTER_SPACINGS = [-0.03, -0.01, 0, 0.02, 0.06, 0.12] as const;
export const SPACES = [0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 120, 144, 160, 192, 240] as const;
export const COLUMNS = [1, 2, 3, 4, 5, 6] as const;
export const MAX_WIDTHS = [320, 480, 640, 768, 960, 1024, 1152, 1280, 1440, 1536, 1920] as const;
export const RADII = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 999] as const;
export const BORDER_WIDTHS = [0, 1, 2, 3, 4, 6, 8, 12] as const;
export const SHADOWS = ["none", "subtle", "medium", "strong"] as const;
export const OPACITIES = [100, 90, 80, 70, 60, 50, 40, 30] as const;
export const OVERLAYS = [0, 10, 20, 30, 40, 50, 60, 70, 80] as const;
export const OBJECT_FITS = ["cover", "contain", "fill"] as const;
export const BUTTON_STYLES = ["solid", "outline", "ghost", "link"] as const;
export const BUTTON_SIZES = ["sm", "md", "lg"] as const;

const SHADOW_CSS: Record<(typeof SHADOWS)[number], string> = {
  none: "none",
  subtle: "0 1px 2px rgba(0,0,0,.28)",
  medium: "0 10px 30px -12px rgba(0,0,0,.45)",
  strong: "0 26px 60px -18px rgba(0,0,0,.6)",
};

const FONT_CSS: Record<(typeof FONT_FAMILIES)[number], string> = {
  display: "var(--font-heading)",
  body: "var(--font-body)",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

/* --------------------------------- the model -------------------------------- */

export type BlockStyle = {
  /* typography */
  font: (typeof FONT_FAMILIES)[number] | null;
  size: number | null;
  weight: number | null;
  align: (typeof ALIGNMENTS)[number] | null;
  lineHeight: number | null;
  letterSpacing: number | null;
  textTransform: (typeof TEXT_TRANSFORMS)[number] | null;
  /** Italic emphasis — the editorial accent premium sites lean on. */
  italic: boolean | null;
  textColor: string | null;
  /* layout */
  columns: number | null;
  gap: number | null;
  maxWidth: number | null;
  contentAlign: (typeof ALIGNMENTS)[number] | null;
  /* spacing */
  padTop: number | null;
  padRight: number | null;
  padBottom: number | null;
  padLeft: number | null;
  marginTop: number | null;
  marginBottom: number | null;
  /* appearance */
  bgColor: string | null;
  /** Second colour of a background gradient, blended from `bgColor`. */
  bgGradient: string | null;
  /** Gradient direction in degrees (0 = upward, 180 = downward). */
  bgGradientAngle: number | null;
  bgImage: string | null;
  overlay: number | null;
  radius: number | null;
  borderWidth: number | null;
  borderColor: string | null;
  shadow: (typeof SHADOWS)[number] | null;
  opacity: number | null;
  /* media + buttons */
  objectFit: (typeof OBJECT_FITS)[number] | null;
  buttonStyle: (typeof BUTTON_STYLES)[number] | null;
  buttonSize: (typeof BUTTON_SIZES)[number] | null;
  buttonTextColor: string | null;
  buttonBgColor: string | null;
  /* per-device visibility */
  hidden: boolean | null;
};

export const STYLE_KEYS = [
  "font",
  "size",
  "weight",
  "align",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "italic",
  "textColor",
  "columns",
  "gap",
  "maxWidth",
  "contentAlign",
  "padTop",
  "padRight",
  "padBottom",
  "padLeft",
  "marginTop",
  "marginBottom",
  "bgColor",
  "bgGradient",
  "bgGradientAngle",
  "bgImage",
  "overlay",
  "radius",
  "borderWidth",
  "borderColor",
  "shadow",
  "opacity",
  "objectFit",
  "buttonStyle",
  "buttonSize",
  "buttonTextColor",
  "buttonBgColor",
  "hidden",
] as const satisfies readonly (keyof BlockStyle)[];

export type StyleKey = (typeof STYLE_KEYS)[number];

/** Nothing set: the block renders exactly as its template designed it. */
export const DEFAULT_BLOCK_STYLE: BlockStyle = Object.freeze(
  Object.fromEntries(STYLE_KEYS.map((key) => [key, null])) as BlockStyle,
);

/* -------------------------------- validation -------------------------------- */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_FN = /^rgba?\(\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*(?:[,/]\s*(?:0?\.\d+|[01]|\d{1,3}%)\s*)?\)$/i;
const HSL_FN = /^hsla?\(\s*-?\d{1,3}(?:deg)?\s*[, ]\s*\d{1,3}%\s*[, ]\s*\d{1,3}%\s*(?:[,/]\s*(?:0?\.\d+|[01]|\d{1,3}%)\s*)?\)$/i;
const NAMED_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#dc2626", blue: "#2563eb",
  green: "#15803d", yellow: "#eab308", orange: "#ea580c", purple: "#9333ea",
  pink: "#db2777", gray: "#6b7280", grey: "#6b7280", slate: "#475569",
  navy: "#172554", teal: "#0f766e", cyan: "#0891b2", gold: "#d4af37",
  cream: "#fff7e6", beige: "#f5f5dc", brown: "#78350f", transparent: "#00000000",
  charcoal: "#1f2937", ivory: "#fffff0", offwhite: "#f8fafc", "off-white": "#f8fafc",
  silver: "#cbd5e1", bronze: "#a16207", copper: "#b45309", champagne: "#f7e7ce",
  emerald: "#047857", forest: "#14532d", olive: "#4d7c0f", lime: "#65a30d",
  mint: "#6ee7b7", sky: "#0ea5e9", indigo: "#4338ca", violet: "#7c3aed",
  magenta: "#c026d3", crimson: "#b91c1c", maroon: "#7f1d1d", burgundy: "#881337",
  coral: "#fb7185", peach: "#fdba74", amber: "#f59e0b", sand: "#e7d8c1",
  taupe: "#8c7b6b", stone: "#78716c", graphite: "#111827", midnight: "#0b1120",
  onyx: "#0a0a0a", platinum: "#e5e7eb", rose: "#e11d48", tan: "#d2b48c",
};

/**
 * A colour the renderer can emit safely: hex (3/4/6/8 digit), an `rgb()`/`hsl()`
 * function, or a human colour name. No `url()`, no expressions, no arbitrary CSS.
 */
export function safeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || /[;{}<>\\]|url\(|var\(|expression|@import/i.test(trimmed)) return null;
  if (HEX.test(trimmed)) return trimmed;
  if (RGB_FN.test(trimmed) || HSL_FN.test(trimmed)) return trimmed;
  const named = NAMED_COLORS[trimmed] ?? NAMED_COLORS[trimmed.replace(/[\s_]+/g, "")];
  return named ?? null;
}

/**
 * Natural property names the AI models actually write, mapped onto Revora's
 * style model. Previously an action using `backgroundColor` or `fontSize` was
 * thrown away wholesale, so a perfectly valid design request appeared to do
 * nothing. Aliases remove that blocker without widening what CSS can be output.
 */
export const STYLE_ALIASES: Record<string, StyleKey> = {
  background: "bgColor", backgroundcolor: "bgColor", bg: "bgColor",
  backgroundcolour: "bgColor", bgcolour: "bgColor", sectionbackground: "bgColor",
  backgroundimage: "bgImage", bgimage: "bgImage", image: "bgImage",
  color: "textColor", textcolour: "textColor", fontcolor: "textColor",
  fontcolour: "textColor", foreground: "textColor", headingcolor: "textColor",
  fontfamily: "font", typeface: "font", fontsize: "size", textsize: "size",
  fontweight: "weight", bold: "weight", textalign: "align",
  lineheight: "lineHeight", leading: "lineHeight",
  letterspacing: "letterSpacing", tracking: "letterSpacing",
  texttransform: "textTransform", uppercase: "textTransform",
  fontstyle: "italic", oblique: "italic", emphasis: "italic",
  gradient: "bgGradient", backgroundgradient: "bgGradient",
  gradientto: "bgGradient", gradientcolor: "bgGradient",
  gradientcolour: "bgGradient", bggradient: "bgGradient",
  gradientangle: "bgGradientAngle", gradientdirection: "bgGradientAngle",
  bggradientangle: "bgGradientAngle",
  borderradius: "radius", cornerradius: "radius", rounded: "radius",
  borderwidth: "borderWidth", bordercolor: "borderColor", bordercolour: "borderColor",
  boxshadow: "shadow", elevation: "shadow",
  paddingtop: "padTop", paddingright: "padRight", paddingbottom: "padBottom",
  paddingleft: "padLeft", margintop: "marginTop", marginbottom: "marginBottom",
  width: "maxWidth", maxwidth: "maxWidth", contentwidth: "maxWidth",
  gridgap: "gap", spacing: "gap", columncount: "columns", cols: "columns",
  objectfit: "objectFit", buttoncolor: "buttonBgColor", buttonbackground: "buttonBgColor",
  buttonbgcolor: "buttonBgColor", buttontextcolor: "buttonTextColor",
  buttonstyle: "buttonStyle", buttonsize: "buttonSize",
  visible: "hidden", display: "hidden",
};

const FONT_NAME_ALIASES: Record<string, (typeof FONT_FAMILIES)[number]> = {
  heading: "display", headline: "display", title: "display",
  sansserif: "body", "sans-serif": "body", sans: "body", inter: "body",
  helvetica: "body", arial: "body", grotesk: "body",
  georgia: "serif", times: "serif", timesnewroman: "serif", garamond: "serif",
  playfair: "serif", didot: "serif", editorial: "serif", elegant: "serif",
  monospace: "mono", courier: "mono", code: "mono",
};

/**
 * Rewrites an incoming style object so alias names, `padding` shorthands and
 * spelled-out font names land on real style keys. Unknown keys are returned
 * untouched so callers can still report them.
 */
export function normalizeStyleInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const known = new Set<string>(STYLE_KEYS as readonly string[]);

  for (const [rawKey, value] of Object.entries(source)) {
    const compact = rawKey.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const key = known.has(rawKey) ? rawKey : (STYLE_ALIASES[compact] ?? null);

    // `padding: 48` / `padding: "48px"` sets all four sides.
    if (!key && (compact === "padding" || compact === "pad")) {
      const amount =
        typeof value === "string"
          ? Number(value.trim().replace(/(px|pt|rem|em|%)$/i, "")) *
            (/\d\s*(rem|em)$/i.test(value.trim()) ? 16 : 1)
          : value;
      out["padding"] = value;
      for (const side of ["padTop", "padRight", "padBottom", "padLeft"]) {
        if (!(side in source)) out[side] = amount;
      }
      continue;
    }
    if (!key && (compact === "margin")) {
      out["marginTop"] = value;
      out["marginBottom"] = value;
      continue;
    }
    if (!key) {
      out[rawKey] = value;
      continue;
    }

    let next: unknown = value;
    // "48px", "1.5rem", "60%" → the number the model meant.
    if (typeof next === "string") {
      const unit = next.trim().match(/^(-?\d*\.?\d+)\s*(px|pt|rem|em|%)?$/i);
      const colourKey =
        key === "textColor" || key === "bgColor" || key === "borderColor" || key === "bgGradient";
      if (unit && !colourKey) {
        const amount = Number(unit[1]);
        const scale = /rem|em/i.test(unit[2] ?? "") ? 16 : 1;
        next = amount * scale;
      }
    }
    if (key === "font" && typeof next === "string") {
      const fontKey = next.trim().toLowerCase().replace(/[\s_-]+/g, "");
      next = (FONT_FAMILIES as readonly string[]).includes(fontKey)
        ? fontKey
        : (FONT_NAME_ALIASES[fontKey] ?? next);
    }
    if (key === "weight" && typeof next === "boolean") next = next ? 700 : 400;
    if (key === "weight" && typeof next === "string") {
      const named: Record<string, number> = {
        thin: 100, light: 300, regular: 400, normal: 400, book: 400, medium: 500,
        semibold: 600, demibold: 600, bold: 700, extrabold: 800, black: 900,
      };
      next = named[next.trim().toLowerCase().replace(/[\s_-]+/g, "")] ?? next;
    }
    if (key === "textTransform" && typeof next === "boolean") next = next ? "uppercase" : "none";
    // `fontStyle: "italic"` and `italic: "yes"` both mean the same thing.
    if (key === "italic" && typeof next === "string") {
      const word = next.trim().toLowerCase();
      if (["italic", "oblique", "true", "yes", "on"].includes(word)) next = true;
      else if (["normal", "none", "false", "no", "off", "upright"].includes(word)) next = false;
    }
    // `gradientDirection: "to bottom"` → the angle that produces it.
    if (key === "bgGradientAngle" && typeof next === "string") {
      const named: Record<string, number> = {
        up: 0, top: 0, totop: 0, right: 90, toright: 90, down: 180, bottom: 180,
        tobottom: 180, left: 270, toleft: 270, diagonal: 135, tobottomright: 135,
        tobottomleft: 225, totopright: 45, totopleft: 315,
      };
      const word = next.trim().toLowerCase().replace(/[\s_-]+/g, "");
      if (word in named) next = named[word];
    }
    if (key === "hidden" && (compact === "visible" || compact === "display")) {
      next = typeof value === "boolean" ? !value : value === "none";
    }
    out[key] = next;
  }
  return out;
}

function boundedNumber(value: unknown, min: number, max: number, integer = false): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return integer ? Math.round(parsed) : Math.round(parsed * 100) / 100;
}

/** Background images must be safe http(s) URLs (or an internal path). */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = safeLinkUrl(value);
  if (!url) return null;
  return /^(https?:\/\/|\/)/i.test(url) ? url : null;
}

function inList<T extends readonly (string | number)[]>(
  allowed: T,
  value: unknown,
): T[number] | null {
  if (typeof value === "number" && (allowed as readonly unknown[]).includes(value))
    return value as T[number];
  if (typeof value === "string" && (allowed as readonly unknown[]).includes(value))
    return value as T[number];
  // Numeric values arrive from JSONB as numbers, but a form may hand back "32".
  if (typeof value === "string" && value.trim() !== "") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && (allowed as readonly unknown[]).includes(asNumber))
      return asNumber as T[number];
  }
  return null;
}

/* --------------------------- legacy value migration ------------------------- */

const LEGACY_SIZE: Record<string, number> = { sm: 14, base: 16, lg: 18, xl: 24, "2xl": 32 };
const LEGACY_SPACE: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 24, xl: 40 };
const LEGACY_LEADING: Record<string, number> = { tight: 1.15, normal: 1.5, relaxed: 1.7 };
const LEGACY_WEIGHT: Record<string, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};
const LEGACY_COLUMNS: Record<string, number> = { stack: 1, two: 2, three: 3, grid: 4 };
const LEGACY_FONT: Record<string, (typeof FONT_FAMILIES)[number]> = {
  display: "display",
  sans: "body",
  body: "body",
  serif: "serif",
  mono: "mono",
};

/**
 * Reads one device layer, translating the earlier keyword-based style model
 * (`size: "lg"`, `padding: "md"`, `layout: "three"`) into the current numeric
 * one so websites styled before this upgrade keep rendering identically.
 */
function readLayer(raw: unknown): Partial<BlockStyle> {
  const s = normalizeStyleInput(raw);
  const out: Partial<BlockStyle> = {};
  const set = <K extends StyleKey>(key: K, value: BlockStyle[K] | null) => {
    if (value !== null && value !== undefined) out[key] = value;
  };

  const legacy = <T>(map: Record<string, T>, value: unknown): T | null =>
    typeof value === "string" && value in map ? (map[value] as T) : null;

  set("font", inList(FONT_FAMILIES, s["font"]) ?? legacy(LEGACY_FONT, s["font"]));
  set("size", boundedNumber(s["size"], 10, 160) ?? boundedNumber(legacy(LEGACY_SIZE, s["size"]), 10, 160));
  set(
    "weight",
    boundedNumber(s["weight"], 100, 900, true) ??
      boundedNumber(legacy(LEGACY_WEIGHT, s["weight"]), 100, 900, true),
  );
  set("align", inList(ALIGNMENTS, s["align"]));
  set(
    "lineHeight",
    boundedNumber(s["lineHeight"], 0.75, 3) ??
      boundedNumber(legacy(LEGACY_LEADING, s["lineHeight"]), 0.75, 3),
  );
  set("letterSpacing", boundedNumber(s["letterSpacing"], -0.1, 0.3));
  set("textTransform", inList(TEXT_TRANSFORMS, s["textTransform"]));
  if (typeof s["italic"] === "boolean") set("italic", s["italic"]);
  set("textColor", safeColor(s["textColor"]));

  set(
    "columns",
    boundedNumber(s["columns"], 1, 6, true) ??
      boundedNumber(legacy(LEGACY_COLUMNS, s["layout"]), 1, 6, true),
  );
  set("gap", boundedNumber(s["gap"], 0, 240));
  set("maxWidth", boundedNumber(s["maxWidth"], 240, 1920));
  set("contentAlign", inList(ALIGNMENTS, s["contentAlign"]));

  // Legacy `padding` was one value for all four sides.
  const legacyPad =
    boundedNumber(legacy(LEGACY_SPACE, s["padding"]), 0, 240) ?? boundedNumber(s["padding"], 0, 240);
  for (const side of ["padTop", "padRight", "padBottom", "padLeft"] as const) {
    set(side, boundedNumber(s[side], 0, 240) ?? legacyPad);
  }
  set("marginTop", boundedNumber(s["marginTop"], -240, 240));
  set("marginBottom", boundedNumber(s["marginBottom"], -240, 240));

  set("bgColor", safeColor(s["bgColor"]));
  set("bgGradient", safeColor(s["bgGradient"]));
  set("bgGradientAngle", boundedNumber(s["bgGradientAngle"], 0, 360));
  set("bgImage", safeImageUrl(s["bgImage"]));
  set("overlay", boundedNumber(s["overlay"], 0, 100));
  set("radius", boundedNumber(s["radius"], 0, 999));
  set("borderWidth", boundedNumber(s["borderWidth"], 0, 12));
  set("borderColor", safeColor(s["borderColor"]));
  set("shadow", inList(SHADOWS, s["shadow"]));
  set("opacity", boundedNumber(s["opacity"], 0, 100));

  set("objectFit", inList(OBJECT_FITS, s["objectFit"]));
  set("buttonStyle", inList(BUTTON_STYLES, s["buttonStyle"]));
  set("buttonSize", inList(BUTTON_SIZES, s["buttonSize"]));
  set("buttonTextColor", safeColor(s["buttonTextColor"]));
  set("buttonBgColor", safeColor(s["buttonBgColor"]));
  if (typeof s["hidden"] === "boolean") set("hidden", s["hidden"]);

  return out;
}

function rootLayer(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const style = (settings as Record<string, unknown>)["style"];
  return style && typeof style === "object" && !Array.isArray(style)
    ? (style as Record<string, unknown>)
    : {};
}

/**
 * The style that applies on one device: desktop values, then the tablet
 * overrides, then the mobile overrides — the same cascade the published CSS
 * media queries produce.
 */
export function readBlockStyle(settings: unknown, device: Device = "desktop"): BlockStyle {
  const root = rootLayer(settings);
  const layers: Partial<BlockStyle>[] = [readLayer(root)];
  if (device === "tablet" || device === "mobile") layers.push(readLayer(root["tablet"]));
  if (device === "mobile") layers.push(readLayer(root["mobile"]));
  return { ...DEFAULT_BLOCK_STYLE, ...Object.assign({}, ...layers) };
}

/** The raw, un-cascaded values a single device layer sets. */
export function readDeviceLayer(settings: unknown, device: Device): Partial<BlockStyle> {
  const root = rootLayer(settings);
  return device === "desktop" ? readLayer(root) : readLayer(root[device]);
}

/** True when this exact device layer sets the property itself. */
export function isOverridden(settings: unknown, device: Device, key: StyleKey): boolean {
  if (device === "desktop") return false;
  return readDeviceLayer(settings, device)[key] !== undefined;
}

/**
 * Merges a style change into `settings` for one device, dropping every unsafe
 * or unknown value. Passing `null` for a property clears it again, so a client
 * can always get back to the template default.
 */
export function writeBlockStyle(
  settings: unknown,
  patch: Partial<Record<StyleKey, unknown>>,
  device: Device = "desktop",
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  const root = { ...rootLayer(settings) };

  const target = device === "desktop" ? root : { ...readLayer(root[device]) };
  const cleaned = readLayer(patch) as Record<string, unknown>;
  for (const key of STYLE_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === "" || value === undefined) delete target[key];
    else if (key in cleaned) target[key] = cleaned[key];
  }

  if (device === "desktop") {
    // Keep the nested device layers when rewriting the desktop layer.
    if (root["tablet"]) target["tablet"] = readLayer(root["tablet"]);
    if (root["mobile"]) target["mobile"] = readLayer(root["mobile"]);
    base["style"] = target;
  } else {
    const next: Record<string, unknown> = { ...readLayer(root) };
    const other: Device = device === "tablet" ? "mobile" : "tablet";
    const otherLayer = readLayer(root[other]);
    if (Object.keys(otherLayer).length) next[other] = otherLayer;
    if (Object.keys(target).length) next[device] = target;
    base["style"] = next;
  }
  return base;
}

/** Removes every override for one device (back to inheriting desktop). */
export function clearDeviceLayer(settings: unknown, device: Device): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  const root = { ...rootLayer(settings) };
  if (device === "desktop") return base;
  delete root[device];
  base["style"] = root;
  return base;
}


/* -------------------------- persisted visual tokens ------------------------- */

/**
 * Section-level composition is stored separately from free-form block styling.
 * Keeping it in a finite vocabulary lets the AI make expressive layouts while
 * guaranteeing the public renderer has a consumer for every value.
 */
export type PersistedSectionVisual = {
  layout?: "split" | "centered" | "image_left" | "image_right" | "full_bleed" | "editorial" | "layered" | "stacked";
  density?: "airy" | "balanced" | "dense";
  image_position?: "left" | "right" | "center" | "background";
  image_treatment?: "natural" | "rounded" | "soft_shadow" | "glass_frame" | "duotone" | "gradient_overlay" | "cinematic" | "cutout" | "full_bleed";
  spacing?: "tight" | "standard" | "generous";
  max_width?: "narrow" | "standard" | "wide" | "edge";
  card_style?: "soft" | "sharp" | "pill" | "glass" | "editorial" | "floating";
  image_ratio?: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
};

const SECTION_VISUAL_VALUES = {
  layout: new Set(["split", "centered", "image_left", "image_right", "full_bleed", "editorial", "layered", "stacked"]),
  density: new Set(["airy", "balanced", "dense"]),
  image_position: new Set(["left", "right", "center", "background"]),
  image_treatment: new Set(["natural", "rounded", "soft_shadow", "glass_frame", "duotone", "gradient_overlay", "cinematic", "cutout", "full_bleed"]),
  spacing: new Set(["tight", "standard", "generous"]),
  max_width: new Set(["narrow", "standard", "wide", "edge"]),
  card_style: new Set(["soft", "sharp", "pill", "glass", "editorial", "floating"]),
  image_ratio: new Set(["1:1", "4:3", "3:2", "16:9", "21:9"]),
} as const;

const VISUAL_KEYS = [
  "layout",
  "density",
  "image_position",
  "image_treatment",
  "spacing",
  "max_width",
  "card_style",
  "image_ratio",
] as const;

export function readSectionVisual(settings: unknown): PersistedSectionVisual {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Record<string, unknown>)["visual"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const key of VISUAL_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (
      typeof value === "string" &&
      value.length <= 32 &&
      SECTION_VISUAL_VALUES[key].has(value as never)
    ) {
      out[key] = value;
    }
  }
  return out as PersistedSectionVisual;
}

export function writeSectionVisual(
  settings: unknown,
  patch: PersistedSectionVisual,
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  const current = readSectionVisual(settings);
  const next: Record<string, string> = { ...current };
  for (const key of VISUAL_KEYS) {
    const value = patch[key];
    if (typeof value === "string" && value.length <= 32) next[key] = value;
  }
  base["visual"] = next;
  return base;
}

export type PersistedComponentVisual = {
  alt?: string;
  object_fit?: "cover" | "contain";
  object_position?: string;
  overlay?: "none" | "soft" | "dark" | "brand" | "gradient";
  radius?: "none" | "small" | "medium" | "large" | "pill";
  shadow?: "none" | "soft" | "medium" | "strong";
  aspect_ratio?: "1:1" | "4:3" | "3:2" | "16:9" | "21:9";
  focal_point?: string;
  /** Where the picture came from, so credits and licences stay honest. */
  source?: "customer" | "stock" | "generated" | "unknown";
  credit?: string;
  license?: string;
  source_url?: string;
};

/** The nine focal points an owner can choose, as CSS object-position values. */
export const FOCAL_POINTS = [
  { label: "Top left", value: "20% 20%" },
  { label: "Top", value: "50% 15%" },
  { label: "Top right", value: "80% 20%" },
  { label: "Left", value: "15% 50%" },
  { label: "Centre", value: "50% 50%" },
  { label: "Right", value: "85% 50%" },
  { label: "Bottom left", value: "20% 80%" },
  { label: "Bottom", value: "50% 85%" },
  { label: "Bottom right", value: "80% 80%" },
] as const;

export function readComponentVisual(settings: unknown): PersistedComponentVisual {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Record<string, unknown>)["visual"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const out: PersistedComponentVisual = {};
  if (typeof value["alt"] === "string") out.alt = value["alt"].slice(0, 160);
  if (value["object_fit"] === "cover" || value["object_fit"] === "contain") out.object_fit = value["object_fit"];
  if (typeof value["object_position"] === "string") out.object_position = value["object_position"];
  const overlay = value["overlay"];
  if (overlay === "none" || overlay === "soft" || overlay === "dark" || overlay === "brand" || overlay === "gradient") {
    out.overlay = overlay;
  }
  const radius = value["radius"];
  if (radius === "none" || radius === "small" || radius === "medium" || radius === "large" || radius === "pill") {
    out.radius = radius;
  }
  const shadow = value["shadow"];
  if (shadow === "none" || shadow === "soft" || shadow === "medium" || shadow === "strong") {
    out.shadow = shadow;
  }
  const aspectRatio = value["aspect_ratio"];
  if (aspectRatio === "1:1" || aspectRatio === "4:3" || aspectRatio === "3:2" || aspectRatio === "16:9" || aspectRatio === "21:9") {
    out.aspect_ratio = aspectRatio;
  }
  if (typeof value["focal_point"] === "string") out.focal_point = value["focal_point"];
  const source = value["source"];
  if (source === "customer" || source === "stock" || source === "generated" || source === "unknown") {
    out.source = source;
  }
  if (typeof value["credit"] === "string") out.credit = value["credit"].slice(0, 120);
  if (typeof value["license"] === "string") out.license = value["license"].slice(0, 80);
  if (typeof value["source_url"] === "string") out.source_url = value["source_url"].slice(0, 500);
  return out;
}

export function writeComponentVisual(
  settings: unknown,
  patch: PersistedComponentVisual,
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  base["visual"] = { ...readComponentVisual(settings), ...patch };
  return base;
}

/* ---------------------------------- to CSS --------------------------------- */

/**
 * Typography, spacing and appearance for the block itself.
 *
 * `surface` is the colour this block will actually sit on when the block sets
 * no background of its own (the page or parent section colour). It is used only
 * to keep the AI's chosen text colour readable — never to change the design.
 */
export function blockCss(style: BlockStyle, surface?: string | null): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.font) css.fontFamily = FONT_CSS[style.font];
  if (style.size !== null) {
    css.fontSize = `${style.size}px`;
    (css as Record<string, string | number>)["--rv-block-font-size"] = `${style.size}px`;
  }
  if (style.weight !== null) {
    css.fontWeight = style.weight;
    (css as Record<string, string | number>)["--rv-block-font-weight"] = style.weight;
  }
  if (style.align) css.textAlign = style.align;
  if (style.lineHeight !== null) {
    css.lineHeight = String(style.lineHeight);
    (css as Record<string, string | number>)["--rv-block-line-height"] = String(style.lineHeight);
  }
  if (style.letterSpacing !== null) {
    css.letterSpacing = `${style.letterSpacing}em`;
    (css as Record<string, string | number>)["--rv-block-letter-spacing"] = `${style.letterSpacing}em`;
  }
  if (style.textTransform) {
    css.textTransform = style.textTransform;
    (css as Record<string, string | number>)["--rv-block-text-transform"] = style.textTransform;
  }
  if (style.textColor) css.color = readableTextColor(style, surface);

  if (style.padTop !== null) css.paddingTop = `${style.padTop}px`;
  if (style.padRight !== null) css.paddingRight = `${style.padRight}px`;
  if (style.padBottom !== null) css.paddingBottom = `${style.padBottom}px`;
  if (style.padLeft !== null) css.paddingLeft = `${style.padLeft}px`;
  if (style.marginTop !== null) css.marginTop = `${style.marginTop}px`;
  if (style.marginBottom !== null) css.marginBottom = `${style.marginBottom}px`;

  if (style.bgColor) css.backgroundColor = style.bgColor;
  if (style.bgImage) {
    css.backgroundImage = backgroundImageCss(style);
    css.backgroundSize = "cover";
    css.backgroundPosition = "center";
  }
  if (style.radius !== null)
    css.borderRadius = style.radius >= 999 ? "9999px" : `${style.radius}px`;
  if (style.borderWidth !== null) {
    css.borderWidth = `${style.borderWidth}px`;
    css.borderStyle = "solid";
    if (!style.borderColor) css.borderColor = "currentColor";
  }
  if (style.borderColor) css.borderColor = style.borderColor;
  if (style.shadow) css.boxShadow = SHADOW_CSS[style.shadow];
  if (style.opacity !== null) css.opacity = style.opacity / 100;
  if (style.maxWidth !== null) {
    css.maxWidth = `${style.maxWidth}px`;
    if (style.contentAlign === "center") css.marginInline = "auto";
    else if (style.contentAlign === "right") css.marginLeft = "auto";
  }
  return css;
}

/**
 * The AI's text colour, kept exactly as chosen when it is readable on the
 * surface behind it, and nudged along the same hue when it is not.
 *
 * Text sitting on a background image is left alone: the scrim system handles
 * legibility there, and a photo has no single measurable colour.
 */
function readableTextColor(style: BlockStyle, surface?: string | null): string {
  const text = style.textColor ?? "";
  if (!text || style.bgImage) return text;
  const background = style.bgColor ?? surface;
  if (!background) return text;
  const large = (style.size ?? 16) >= 24 || (style.weight ?? 400) >= 700;
  return readableOn(text, background, { large });
}

/** The URL is validated first, then encoded so quotes cannot break out. */
function backgroundImageCss(style: BlockStyle): string {
  const url = `url("${encodeURI(style.bgImage ?? "").replace(/["\\]/g, "")}")`;
  if (style.overlay) {
    const alpha = style.overlay / 100;
    return `linear-gradient(rgba(0,0,0,${alpha}),rgba(0,0,0,${alpha})),${url}`;
  }
  return url;
}

/** Grid CSS for a block's child items (service cards, reviews, gallery…). */
export function itemsCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.columns !== null) css.gridTemplateColumns = `repeat(${style.columns}, minmax(0, 1fr))`;
  if (style.gap !== null) css.gap = `${style.gap}px`;
  return css;
}

/**
 * Button appearance. A button label is the most costly thing on a page to get
 * wrong, so its colour is paired against the fill it sits on (solid buttons) or
 * the surface behind it (outline, ghost and link buttons). A solid button with a
 * chosen fill but no chosen label colour gets a readable label derived from the
 * fill instead of inheriting a token that may clash.
 */
export function buttonCss(style: BlockStyle, surface?: string | null): React.CSSProperties {
  const css: React.CSSProperties = {};
  const solid = (style.buttonStyle ?? "solid") === "solid";
  const behind = solid ? (style.buttonBgColor ?? style.bgColor ?? surface) : (style.bgColor ?? surface);

  if (style.buttonTextColor) {
    css.color = behind
      ? readableOn(style.buttonTextColor, behind, { large: true })
      : style.buttonTextColor;
  } else if (solid && style.buttonBgColor) {
    css.color = readableOn("#ffffff", style.buttonBgColor, { large: true });
  }
  if (style.buttonBgColor && solid) css.backgroundColor = style.buttonBgColor;
  if (style.buttonBgColor && style.buttonStyle === "outline") css.borderColor = style.buttonBgColor;
  return css;
}

export function buttonClasses(style: BlockStyle): string {
  const size =
    style.buttonSize === "sm"
      ? "px-3 py-1.5 text-[12px]"
      : style.buttonSize === "lg"
        ? "px-6 py-3 text-[15px]"
        : "px-4 py-2 text-[13px]";
  const look =
    style.buttonStyle === "outline"
      ? "border border-primary text-primary"
      : style.buttonStyle === "ghost"
        ? "text-primary hover:bg-primary/10"
        : style.buttonStyle === "link"
          ? "text-primary underline underline-offset-4"
          : "bg-primary text-primary-foreground";
  return `inline-flex items-center justify-center rounded-md font-medium ${size} ${look}`;
}

/* ------------------------- published responsive CSS ------------------------ */

const ID = /^[a-z0-9-]{6,64}$/i;

function declarations(css: React.CSSProperties): string {
  return Object.entries(css)
    .map(([property, value]) => {
      const name = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${name}:${String(value)}`;
    })
    .join(";");
}

/**
 * Publishable CSS for one block: the desktop layer is inline, so this emits
 * only the tablet and mobile overrides as media queries plus per-device
 * visibility. Every value came from the validated model above, and the
 * selector is a checked id, so nothing here can carry injected CSS.
 */
export function blockRules(id: string, settings: unknown, surface?: string | null): string {
  if (!ID.test(id)) return "";
  const rules: string[] = [];
  const root = rootLayer(settings);
  for (const device of ["tablet", "mobile"] as const) {
    const layer = readLayer(root[device]);
    if (!Object.keys(layer).length) continue;
    const merged = readBlockStyle(settings, device);
    const only: BlockStyle = { ...DEFAULT_BLOCK_STYLE };
    for (const key of Object.keys(layer) as StyleKey[]) {
      // Background image needs its overlay companion to render correctly.
      (only as Record<string, unknown>)[key] = merged[key];
      if (key === "bgImage" || key === "overlay") {
        only.bgImage = merged.bgImage;
        only.overlay = merged.overlay;
      }
    }
    // Readability pairing needs the background this device layer ends up with,
    // not just the one it sets itself, so a mobile-only text colour is still
    // measured against the desktop background it inherits.
    const body = [
      declarations(blockCss(only, merged.bgColor ?? surface)),
      declarations(itemsCss(only)),
    ]
      .filter(Boolean)
      .join(";");
    const parts: string[] = [];
    if (body) parts.push(`[data-rvb="${id}"]{${body}}`);
    if (layer.hidden === true) parts.push(`[data-rvb="${id}"]{display:none}`);
    if (layer.hidden === false) parts.push(`[data-rvb="${id}"]{display:revert}`);
    if (!parts.length) continue;
    rules.push(`@media (max-width:${DEVICE_META[device].maxWidth}px){${parts.join("")}}`);
  }
  return rules.join("");
}

/** One stylesheet for every styled block on a published page. */
export function styleSheet(
  blocks: { id: string; settings: unknown }[],
  surface?: string | null,
): string {
  return blocks
    .map((block) => blockRules(block.id, block.settings, surface))
    .filter(Boolean)
    .join("\n");
}
