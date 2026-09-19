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
export const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;
export const ALIGNMENTS = ["left", "center", "right"] as const;
export const TEXT_TRANSFORMS = ["none", "uppercase", "capitalize"] as const;
export const TEXT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72] as const;
export const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 1.7, 2] as const;
export const LETTER_SPACINGS = [-0.03, -0.01, 0, 0.02, 0.06, 0.12] as const;
export const SPACES = [0, 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 120] as const;
export const COLUMNS = [1, 2, 3, 4] as const;
export const MAX_WIDTHS = [640, 768, 1024, 1280, 1536] as const;
export const RADII = [0, 4, 8, 12, 16, 24, 999] as const;
export const BORDER_WIDTHS = [0, 1, 2, 4] as const;
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

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Only strict 3/6-digit hex colours become CSS — nothing else is trusted. */
export function safeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed.toLowerCase() : null;
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
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Partial<BlockStyle> = {};
  const set = <K extends StyleKey>(key: K, value: BlockStyle[K] | null) => {
    if (value !== null && value !== undefined) out[key] = value;
  };

  const legacy = <T>(map: Record<string, T>, value: unknown): T | null =>
    typeof value === "string" && value in map ? (map[value] as T) : null;

  set("font", inList(FONT_FAMILIES, s["font"]) ?? legacy(LEGACY_FONT, s["font"]));
  set(
    "size",
    inList(TEXT_SIZES, s["size"]) ??
      inList(TEXT_SIZES, legacy(LEGACY_SIZE, s["size"]) ?? undefined),
  );
  set(
    "weight",
    inList(FONT_WEIGHTS, s["weight"]) ??
      inList(FONT_WEIGHTS, legacy(LEGACY_WEIGHT, s["weight"]) ?? undefined),
  );
  set("align", inList(ALIGNMENTS, s["align"]));
  set(
    "lineHeight",
    inList(LINE_HEIGHTS, s["lineHeight"]) ??
      inList(LINE_HEIGHTS, legacy(LEGACY_LEADING, s["lineHeight"]) ?? undefined),
  );
  set("letterSpacing", inList(LETTER_SPACINGS, s["letterSpacing"]));
  set("textTransform", inList(TEXT_TRANSFORMS, s["textTransform"]));
  set("textColor", safeColor(s["textColor"]));

  set(
    "columns",
    inList(COLUMNS, s["columns"]) ??
      inList(COLUMNS, legacy(LEGACY_COLUMNS, s["layout"]) ?? undefined),
  );
  set("gap", inList(SPACES, s["gap"]));
  set("maxWidth", inList(MAX_WIDTHS, s["maxWidth"]));
  set("contentAlign", inList(ALIGNMENTS, s["contentAlign"]));

  // Legacy `padding` was one value for all four sides.
  const legacyPad = inList(SPACES, legacy(LEGACY_SPACE, s["padding"]) ?? undefined);
  for (const side of ["padTop", "padRight", "padBottom", "padLeft"] as const) {
    set(side, inList(SPACES, s[side]) ?? legacyPad);
  }
  set("marginTop", inList(SPACES, s["marginTop"]));
  set("marginBottom", inList(SPACES, s["marginBottom"]));

  set("bgColor", safeColor(s["bgColor"]));
  set("bgImage", safeImageUrl(s["bgImage"]));
  set("overlay", inList(OVERLAYS, s["overlay"]));
  set("radius", inList(RADII, s["radius"]));
  set("borderWidth", inList(BORDER_WIDTHS, s["borderWidth"]));
  set("borderColor", safeColor(s["borderColor"]));
  set("shadow", inList(SHADOWS, s["shadow"]));
  set("opacity", inList(OPACITIES, s["opacity"]));

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
};

export function readComponentVisual(settings: unknown): PersistedComponentVisual {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Record<string, unknown>)["visual"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const out: PersistedComponentVisual = {};
  if (typeof value.alt === "string") out.alt = value.alt.slice(0, 160);
  if (value.object_fit === "cover" || value.object_fit === "contain") out.object_fit = value.object_fit;
  if (typeof value.object_position === "string") out.object_position = value.object_position;
  if (["none", "soft", "dark", "brand", "gradient"].includes(String(value.overlay))) {
    out.overlay = value.overlay as PersistedComponentVisual["overlay"];
  }
  if (["none", "small", "medium", "large", "pill"].includes(String(value.radius))) {
    out.radius = value.radius as PersistedComponentVisual["radius"];
  }
  if (["none", "soft", "medium", "strong"].includes(String(value.shadow))) {
    out.shadow = value.shadow as PersistedComponentVisual["shadow"];
  }
  if (["1:1", "4:3", "3:2", "16:9", "21:9"].includes(String(value.aspect_ratio))) {
    out.aspect_ratio = value.aspect_ratio as PersistedComponentVisual["aspect_ratio"];
  }
  if (typeof value.focal_point === "string") out.focal_point = value.focal_point;
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

/** Typography, spacing and appearance for the block itself. */
export function blockCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.font) css.fontFamily = FONT_CSS[style.font];
  if (style.size !== null) css.fontSize = `${style.size}px`;
  if (style.weight !== null) css.fontWeight = style.weight;
  if (style.align) css.textAlign = style.align;
  if (style.lineHeight !== null) css.lineHeight = String(style.lineHeight);
  if (style.letterSpacing !== null) css.letterSpacing = `${style.letterSpacing}em`;
  if (style.textTransform) css.textTransform = style.textTransform;
  if (style.textColor) css.color = style.textColor;

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

export function buttonCss(style: BlockStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.buttonTextColor) css.color = style.buttonTextColor;
  if (style.buttonBgColor && (style.buttonStyle ?? "solid") === "solid")
    css.backgroundColor = style.buttonBgColor;
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
export function blockRules(id: string, settings: unknown): string {
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
    const body = [declarations(blockCss(only)), declarations(itemsCss(only))]
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
export function styleSheet(blocks: { id: string; settings: unknown }[]): string {
  return blocks
    .map((block) => blockRules(block.id, block.settings))
    .filter(Boolean)
    .join("\n");
}
