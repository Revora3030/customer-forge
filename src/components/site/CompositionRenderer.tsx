import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Breakpoint, CompositionFaqItem, CompositionNode, CompositionTab, CompositionTree, MotionEasing, NodeHover, NodeMotion, NodeStyle, WidgetPresentation } from "@/lib/builder/composition-tree";
import type { PersistedComponentVisual } from "@/lib/site-style";
import { resolveImageSource } from "@/lib/brand-logos";
import { contrastRatio, readableOn, toRgb } from "@/lib/readable-color";
import { premiumSurface } from "@/lib/site-theme";
import { clampSplit, splitForKey, splitForPointer } from "@/lib/builder/compare-slider";
import { brushRadius, coverRect, coveragePercent, isRevealDone, newGrid, paintAt, strokePoints, type RevealGrid } from "@/lib/builder/reveal-brush";
import { DEFAULT_OFFER_ANCHOR, DEFAULT_SCENE_ANCHOR, sceneScrim, type SceneAnchor } from "@/lib/builder/cinematic-primitives";
import { LensMagnifier, StickySplitStory } from "@/components/site/MasterBlocks";
import { CollectionRow, SceneVideo, ScrollChapters, SpinViewer, type SpinFrame } from "@/components/site/CinematicBlocks";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";

/**
 * Draws any validated AI-authored composition tree. It only translates the
 * AI's values into CSS — it never adds, reorders or restyles anything itself.
 * Responsive overrides become scoped CSS custom properties per breakpoint.
 */
// Compatibility only for old saved trees; new compositions can author numeric depth.
const SHADOWS: Record<string, string> = {
  none: "none",
  subtle: "0 1px 3px rgb(0 0 0 / 0.12)",
  medium: "0 8px 24px rgb(0 0 0 / 0.18)",
  strong: "0 20px 50px rgb(0 0 0 / 0.3)",
};
const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" } as const;
const ITEMS = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" } as const;

// eslint-disable-next-line react-refresh/only-export-components -- renderer helpers are intentionally co-located with their composition types.
export function styleToCss(style: NodeStyle | undefined, type: CompositionNode["type"]): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.columns != null && type === "grid") css.gridTemplateColumns = `repeat(${style.columns}, minmax(0, 1fr))`;
  if (style.span != null) css.gridColumn = `span ${style.span} / span ${style.span}`;
  if (style.gap != null) css.gap = style.gap;
  if (style.padding != null) css.padding = style.padding;
  if (style.paddingX != null) { css.paddingLeft = style.paddingX; css.paddingRight = style.paddingX; }
  if (style.paddingY != null) { css.paddingTop = style.paddingY; css.paddingBottom = style.paddingY; }
  if (style.maxWidth != null) { css.maxWidth = style.maxWidth; css.marginLeft = "auto"; css.marginRight = "auto"; }
  if (style.align) css.textAlign = style.align;
  if (style.justify) css.justifyContent = JUSTIFY[style.justify];
  if (style.items) css.alignItems = ITEMS[style.items];
  if (style.size != null) {
    if (type === "heading") {
      const max = Math.round(style.size);
      // Never let the floor exceed the authored size (clamp() with min > max
      // is invalid and the browser dropped the size entirely).
      const min = Math.min(max, Math.max(18, Math.round(max * 0.72)));
      const vw = Math.max(2.5, Math.min(8, Math.round((max / 16) * 10) / 10));
      css.fontSize = `clamp(${min}px, ${vw}vw, ${max}px)`;
    } else {
      css.fontSize = style.size;
    }
  }
  if (style.weight != null) css.fontWeight = style.weight;
  if (style.lineHeight != null) css.lineHeight = style.lineHeight;
  if (style.letterSpacing != null) css.letterSpacing = `${Math.max(-0.05, Math.min(0.5, style.letterSpacing))}em`;
  if (style.italic) css.fontStyle = "italic";
  if (style.uppercase) css.textTransform = "uppercase";
  if (style.font) css.fontFamily = `"${style.font}", var(--font-body, system-ui), sans-serif`;
  if (style.color) css.color = style.color;
  if (style.background && style.gradientTo) {
    css.backgroundImage = `linear-gradient(${style.gradientAngle ?? 180}deg, ${style.background}, ${style.gradientTo})`;
  } else if (style.background) css.backgroundColor = style.background;
  if (style.radius != null) css.borderRadius = style.radius;
  if (style.borderWidth != null) { css.borderWidth = style.borderWidth; css.borderStyle = "solid"; }
  if (style.borderColor) css.borderColor = style.borderColor;
  if (type === "card" && style.borderWidth == null && style.borderColor == null) {
    css.border = "1px solid color-mix(in srgb, currentColor 10%, transparent)";
  }
  if (style.shadow) css.boxShadow = SHADOWS[style.shadow];
  if (style.opacity != null) css.opacity = style.opacity / 100;
  if (style.aspect) css.aspectRatio = style.aspect.replace(":", " / ");
  if (style.objectFit) css.objectFit = style.objectFit;
  if (style.minHeight != null) css.minHeight = style.minHeight;
  if (style.hidden) css.display = "none";
  if (style.position) css.position = style.position;
  if (style.top != null) css.top = style.top;
  if (style.left != null) css.left = style.left;
  if (style.right != null) css.right = style.right;
  if (style.bottom != null) css.bottom = style.bottom;
  if (style.zIndex != null) css.zIndex = style.zIndex;
  if (style.overlap != null) { css.marginTop = -style.overlap; css.position = css.position ?? "relative"; }
  if (style.blur != null) { css.backdropFilter = `blur(${style.blur}px)`; css.WebkitBackdropFilter = `blur(${style.blur}px)`; }
  // The independent `rotate` property, so hover lift and entrance motion
  // (which animate \`transform\`) no longer wipe out an authored rotation.
  if (style.rotate != null) css.rotate = `${style.rotate}deg`;
  if (style.gridAreas && type === "grid") css.gridTemplateAreas = style.gridAreas;
  if (style.area) css.gridArea = style.area;
  return css;
}

function cssText(css: CSSProperties): string {
  return Object.entries(css)
    .map(([key, value]) => {
      const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const v = typeof value === "number" && !/opacity|weight|line-height|z-index/.test(prop) ? `${value}px` : String(value);
      return `${prop}:${v} !important`;
    })
    .join(";");
}

const MEDIA: Record<Breakpoint, string> = {
  mobile: "(max-width: 639px)",
  tablet: "(min-width: 640px) and (max-width: 1023px)",
  desktop: "(min-width: 1024px)",
};

type ResolvedMedia = string | { url: string | null; visual?: PersistedComponentVisual };
/** Working form widgets: a hover lift under a visitor's pointer while they type is distracting, so they never lift. */
const FORM_WIDGETS = ["booking_form", "quote_calculator", "enquiry_form"] as const;
/** Scopes that draw the shared site header/footer: the page itself owns its headings and its single h1. */
const CHROME_SCOPES = new Set(["site-header", "site-footer"]);

/** Facts for an offer card, read from the owner's real Services tool. Never authored by the AI. */
export type OfferFacts = { name: string; price: string | null; duration: string | null };

type Ctx = { offer?: (service: string) => OfferFacts | null; sceneScrim?: string | undefined; chrome?: boolean; editable?: boolean; label?: (text: string) => string; depth?: number | undefined; bg?: string | undefined; bg2?: string | undefined; fg?: string | undefined; rules: string[]; counter: { n: number; sawMedia?: boolean }; eagerFirstMedia?: boolean; scope: string; href: (h: string) => string; media: (ref: string) => ResolvedMedia | null; widget: (name: string, presentation?: WidgetPresentation) => ReactNode };

const mediaUrl = (media: ResolvedMedia | null): string | null =>
  typeof media === "string" ? media : media?.url ?? null;
const mediaVisual = (media: ResolvedMedia | null): PersistedComponentVisual | undefined =>
  typeof media === "string" ? undefined : media?.visual;
/**
 * AI_GENERATED_DRAFT / NOT_VERIFIED_WORK_PROOF: a stored picture whose visual
 * record says it was generated can illustrate a page, but it must never be
 * shown as a before/after result — that would present AI work as the
 * business's real job.
 */
const isGeneratedMedia = (media: ResolvedMedia | null): boolean => {
  // Licensed stock is not the business's work either.
  const source = mediaVisual(media)?.source;
  return source === "generated" || source === "stock";
};

function widgetThemeStyle(theme: WidgetPresentation["theme"] | undefined): CSSProperties {
  if (!theme) return {};
  const out: Record<string, string> = {};
  const set = (name: string, value: string | undefined) => { if (value) out[name] = value; };
  set("--background", theme.surface);
  set("--card", theme.surface);
  set("--elevated", theme.surface);
  set("--popover", theme.surface);
  set("--secondary", theme.surface);
  set("--muted", theme.surface);
  set("--foreground", theme.text);
  set("--card-foreground", theme.text);
  set("--popover-foreground", theme.text);
  set("--secondary-foreground", theme.text);
  set("--muted-foreground", theme.muted ?? theme.text);
  set("--border", theme.border);
  set("--input", theme.border);
  set("--primary", theme.action);
  set("--primary-foreground", theme.actionText);
  set("--accent", theme.selected ?? theme.action);
  set("--accent-foreground", theme.selectedText ?? theme.actionText);
  return out as CSSProperties;
}

function mediaCss(visual: PersistedComponentVisual | undefined): CSSProperties {
  if (!visual) return {};
  const css: CSSProperties = {};
  if (visual.object_fit) css.objectFit = visual.object_fit;
  if (visual.object_position ?? visual.focal_point) css.objectPosition = visual.object_position ?? visual.focal_point;
  if (visual.aspect_ratio) css.aspectRatio = visual.aspect_ratio.replace(":", " / ");
  if (visual.radius != null) css.borderRadius = visual.radius;
  if (visual.shadow != null) css.boxShadow = visual.shadow <= 0 ? "none" : `0 ${Math.round(visual.shadow * .55)}px ${Math.round(visual.shadow * 1.4)}px -${Math.round(visual.shadow * .35)}px rgba(0,0,0,.45)`;
  if (visual.overlay != null) css.opacity = 1 - visual.overlay / 200;
  return css;
}

function baseLayout(type: CompositionNode["type"]): CSSProperties {
  switch (type) {
    case "stack": return { display: "flex", flexDirection: "column" };
    case "row": return { display: "flex", flexWrap: "wrap" };
    case "grid": return { display: "grid" };
    case "button": return { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44, textDecoration: "none" };
    case "spacer": return { minHeight: 24 };
    default: return {};
  }
}

function renderNode(node: CompositionNode, ctx: Ctx, key: string): ReactNode {
  const saved = { bg: ctx.bg, bg2: ctx.bg2, fg: ctx.fg, depth: ctx.depth, sceneScrim: ctx.sceneScrim };
  try {
    return renderNodeInner(node, ctx, key);
  } finally {
    ctx.bg = saved.bg; ctx.bg2 = saved.bg2; ctx.fg = saved.fg; ctx.depth = saved.depth; ctx.sceneScrim = saved.sceneScrim;
  }
}

const TEXTUAL = new Set<CompositionNode["type"]>(["heading", "text", "link", "button", "list", "quote", "icon", "accordion", "faq_accordion", "tabs", "toggle", "tab_group"]);
const BRIGHT = "#ffffff";
const INK = "#101114";
const isReadablePair = (fg: string, bg: string, bg2: string | undefined, large: boolean) => {
  const need = large ? 3 : 4.5;
  return (contrastRatio(fg, bg) ?? 21) >= need && (!bg2 || (contrastRatio(fg, bg2) ?? 21) >= need);
};
const bestInk = (bg: string, bg2?: string) => {
  const worst = (c: string) => Math.min(contrastRatio(c, bg) ?? 21, bg2 ? (contrastRatio(c, bg2) ?? 21) : 21);
  return worst(INK) >= worst(BRIGHT) ? INK : BRIGHT;
};

/**
 * Works out the text colour a node must use to stay readable on the surface
 * it is drawn over (its own background, else the nearest painted ancestor).
 * Returns the corrected colour (if any) plus the paint context for children.
 */
// eslint-disable-next-line react-refresh/only-export-components -- renderer helper, exported for tests.
export function readablePaint(node: Pick<CompositionNode, "type" | "style">, ctx: { bg?: string | undefined; bg2?: string | undefined; fg?: string | undefined }): { color?: string; bg?: string | undefined; bg2?: string | undefined; fg?: string | undefined } {
  const own = node.style?.background;
  const bg = own ?? ctx.bg;
  const bg2 = own ? node.style?.gradientTo : ctx.bg2;
  const authored = node.style?.color;
  const large = node.type === "heading" || (node.style?.size ?? 0) >= 24;
  let color: string | undefined;
  if (authored && bg) {
    const rgb = toRgb(authored);
    const neutral = rgb ? Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 28 : false;
    // White/grey/black text has no hue to keep: flip to the readable ink
    // instead of walking it into a muddy mid-grey.
    let fixed = neutral && !isReadablePair(authored, bg, bg2, large) ? bestInk(bg, bg2) : readableOn(authored, bg, { large });
    if (bg2) fixed = readableOn(fixed, bg2, { large });
    if (bg2 && (contrastRatio(fixed, bg) ?? 21) < (large ? 3 : 4.5)) fixed = bestInk(bg, bg2);
    if (fixed.toLowerCase() !== authored.toLowerCase()) color = fixed;
  } else if (!authored && own) {
    // A new surface with no authored text colour: the inherited colour may be
    // unreadable on it (white page text over a pale card). Pick the readable ink.
    const inherited = ctx.fg;
    if (!inherited || (contrastRatio(inherited, own) ?? 21) < (large ? 3 : 4.5)) color = bestInk(own, bg2);
  } else if (!authored && bg && ctx.fg && TEXTUAL.has(node.type)) {
    if ((contrastRatio(ctx.fg, bg) ?? 21) < (large ? 3 : 4.5)) color = readableOn(ctx.fg, bg, { large });
  }
  return { ...(color ? { color } : {}), bg, bg2, fg: color ?? authored ?? ctx.fg };
}

/**
 * Big background areas (the section itself and full-width rows/grids/stacks)
 * get the same premium-surface correction as the page: a washed-out mid-grey
 * band becomes a clean light tint or a deep shade. Cards, buttons, badges and
 * gradients keep exactly the colour the design chose.
 */
function correctSurface(node: CompositionNode, depth: number): CompositionNode {
  const background = node.style?.background;
  if (!background || node.style?.gradientTo) return node;
  const container = node.type === "stack" || node.type === "grid" || node.type === "row" || node.type === "card";
  if (!container) return node;
  // Big bands always get the premium correction. Deeper boxes only when they
  // are a dull, colourless mid-grey (the washed-out look) — a deliberately
  // coloured card keeps exactly the colour the design chose.
  const rgb = toRgb(background);
  const colourless = rgb ? Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 18 : false;
  if (depth > 1 && !colourless) return node;
  const fixed = premiumSurface(background);
  return fixed && fixed.toLowerCase() !== background.toLowerCase()
    ? { ...node, style: { ...node.style, background: fixed } }
    : node;
}

function renderNodeInner(rawNode: CompositionNode, ctx: Ctx, key: string): ReactNode {
  const node = correctSurface(rawNode, ctx.depth ?? 0);
  const id = `${ctx.scope}-${ctx.counter.n++}`;
  // Buttons and links are how visitors act: a design may restyle them per
  // screen size but never hide one, or a phone visitor loses the action.
  const actionable = node.type === "button" || node.type === "link";
  for (const [bp, rawStyle] of Object.entries(node.responsive ?? {}) as [Breakpoint, NodeStyle][]) {
    const style = actionable && rawStyle.hidden ? { ...rawStyle, hidden: false } : rawStyle;
    const text = cssText(styleToCss(style, node.type));
    if (text) ctx.rules.push(`@media ${MEDIA[bp]}{[data-cn="${id}"]{${text}}}`);
  }
  if (node.hover) ctx.rules.push(hoverCss(id, node.hover));
  const style: CSSProperties = {
    ...baseLayout(node.type),
    ...styleToCss(actionable && node.style?.hidden ? { ...node.style, hidden: false } : node.style, node.type),
  };
  // Readability guard: saved layouts render even when a quality check failed,
  // so a heading could be painted white on a pale grey panel (unreadable).
  // Text is re-paired with the surface it actually sits on, keeping its hue.
  const paint = readablePaint(node, ctx);
  if (paint.color) style.color = paint.color;
  ctx.bg = paint.bg; ctx.bg2 = paint.bg2; ctx.fg = paint.fg;
  ctx.depth = (ctx.depth ?? 0) + 1;
  const motion = node.motion && node.motion.kind !== "none" ? node.motion : null;
  const interactive = node.type === "button" || node.type === "link" || node.type === "card" || node.type === "widget";
  const classNames = [
    motion ? "rv-cn-motion" : "",
    interactive ? "rv-cn-interactive" : "",
    node.type === "heading" || node.type === "text" ? "rv-cn-copy" : "",
  ].filter(Boolean).join(" ") || undefined;
  const mobileCols = node.type === "grid" && node.responsive?.mobile?.columns != null ? "" : undefined;
  // Builder preview only: the node's tree path, so one exact element can be
  // picked or edited in place. Never emitted on the public site. Marquee
  // duplicates (".dup.") are decorative copies and are not addressable.
  const path = ctx.editable && !key.includes(".dup.") && !key.includes(".tab.") ? key : undefined;
  const props = {
    ...(path ? { "data-rvp": path, "data-rvp-type": node.type } : {}),
    "data-cn": id,
    "data-motion": motion?.kind,
    ...(mobileCols !== undefined ? { "data-mobile-cols": mobileCols } : {}),
    className: classNames,
    style: motion ? { ...style, ...motionStyle(motion) } : style,
  };
  // Cinematic blocks paint their own surfaces (a computed scrim, a frosted
  // offer card), so their children are measured against those surfaces.
  if (node.type === "scene") return renderScene(node, ctx, key, props);
  if (node.type === "spin_viewer") return renderSpin(node, ctx, key, props);
  if (node.type === "offer_card") offerSurface(node, ctx, props);
  const children = node.children ?? [];
  const prunedChildren = children.filter((child, index) => {
    if (child.type !== "icon" || index === children.length - 1) return true;
    const next = children[index + 1];
    if (!next) return true;
    return !(
      next.type === "widget" &&
      (next.text === "direct_contact" || next.text === "contact_details") &&
      /(?:email|phone|mail|call|tel|@|☎|📞|✉)/i.test(child.text ?? "")
    );
  });
  const kids = prunedChildren.map((child, i) => renderNode(child, ctx, `${key}.${i}`));
  // A box whose contents all resolved to nothing (missing facts, unavailable
  // widget or image) is dropped so visitors never see an empty styled frame.
  const EMPTY_PRUNE = new Set(["card", "stack", "row", "grid"]);
  if (EMPTY_PRUNE.has(node.type) && !node.text && node.children?.length && kids?.every((k) => k == null)) return null;


  switch (node.type) {
    case "heading": {
      // The phone type cap reads the AI's own phone size (else its size) and
      // line height, so it only ever shrinks an oversized heading and never
      // enlarges or tightens what the AI chose.
      const phoneSize = node.responsive?.mobile?.size ?? node.style?.size;
      const phoneLeading = node.responsive?.mobile?.lineHeight ?? node.style?.lineHeight;
      const headingStyle: CSSProperties = {
        ...props.style,
        ...(phoneSize != null ? { "--rv-mfs": `${phoneSize}px` } : {}),
        ...(phoneLeading != null ? { "--rv-mlh": String(phoneLeading) } : {}),
      } as CSSProperties;
      // Site header/footer: same look, but not a document heading, so the
      // page keeps its one h1 and a clean outline.
      if (ctx.chrome) return <p key={key} {...props} style={headingStyle}>{node.text}{kids}</p>;
      const Tag = (`h${node.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      return <Tag key={key} {...props} style={headingStyle}>{node.text}{kids}</Tag>;
    }
    case "text":
      return <p key={key} {...props}>{node.text}{kids}</p>;
    case "media":
      { const resolved = node.mediaRef ? ctx.media(node.mediaRef) : null;
        const visual = mediaVisual(resolved);
        const source = node.src ? resolveImageSource(node.src) : mediaUrl(resolved);
        // The first picture of a section is usually the hero: load it eagerly
        // so the largest paint is not delayed by lazy loading.
        const first = !ctx.counter.sawMedia;
        ctx.counter.sawMedia = true;
        return source ? <img key={key} {...props} src={source} alt={node.alt ?? visual?.alt ?? ""} loading={first && ctx.eagerFirstMedia ? "eager" : "lazy"} decoding="async" {...(first && ctx.eagerFirstMedia ? { fetchPriority: "high" as const } : {})} style={{ width: "100%", height: style.aspectRatio || visual?.aspect_ratio ? "100%" : undefined, objectFit: style.objectFit ?? visual?.object_fit ?? (style.aspectRatio ? "cover" : undefined), ...mediaCss(visual), ...props.style }} /> : null; }
    case "widget":
      { const w = node.text ? ctx.widget(node.text, node.widgetPresentation) : null;
        return w ? <div key={key} {...props} data-widget={node.text} style={{ ...props.style, ...widgetThemeStyle(node.widgetPresentation?.theme) }}>{w}{kids}</div> : null; }
    case "button":
    case "link": {
      // A button authored with no destination still goes somewhere useful when
      // the resolver knows the site's pages (it maps "" to the enquiry form).
      const href = node.href ? ctx.href(node.href) : ctx.href("") || undefined;
      const external = Boolean(href && /^https:\/\//i.test(href));
      return (
        <a key={key} {...props} {...(node.type === "button" ? { "data-rv-button": "" } : {})} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {node.text && ctx.label ? ctx.label(node.text) : node.text}{kids}
        </a>
      );
    }
    case "list":
      { const items = (node.items ?? []).filter((item) => item.trim());
        return items.length ? <ul key={key} {...props}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : null; }
    case "divider":
      return <hr key={key} {...props} />;
    case "icon":
      return <span key={key} aria-hidden="true" {...props}>{node.text}</span>;
    case "card":
      return <article key={key} {...props} data-rv-card="">{kids}</article>;
    case "quote":
      return (
        <figure key={key} {...props}>
          <blockquote>{node.text}</blockquote>
          {node.items?.[0] ? <figcaption>{node.items[0]}</figcaption> : null}
        </figure>
      );
    case "accordion":
      return (
        <div key={key} {...props}>
          {node.children?.map((child, i) => (
            <details key={i} style={styleToCss(child.style, "card")}>
              <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>{child.text}</summary>
              {child.children?.map((c, j) => renderNode(c, ctx, `${key}.${i}.${j}`))}
            </details>
          ))}
        </div>
      );
    case "tabs":
    case "toggle":
      return (
        <Tabs key={key} props={props} labels={node.children?.map((c) => c.text ?? "") ?? []}
          panels={node.children?.map((child, i) => <div key={i} style={styleToCss(child.style, "stack")}>{child.children?.map((c, j) => renderNode(c, ctx, `${key}.${i}.${j}`))}</div>) ?? []} />
      );
    case "compare": {
      const [before, after] = node.children ?? [];
      if ((before?.mediaRef && isGeneratedMedia(ctx.media(before.mediaRef))) || (after?.mediaRef && isGeneratedMedia(ctx.media(after.mediaRef)))) return null;
      const beforeSource = before?.src ? resolveImageSource(before.src) : (before?.mediaRef ? mediaUrl(ctx.media(before.mediaRef)) : null);
      const afterSource = after?.src ? resolveImageSource(after.src) : (after?.mediaRef ? mediaUrl(ctx.media(after.mediaRef)) : null);
      return before && after && beforeSource && afterSource ? <Compare key={key} props={props} before={before} after={after} beforeSource={beforeSource} afterSource={afterSource} /> : null;
    }
    case "before_after_slider": {
      const { beforeImage, afterImage } = node;
      if (!beforeImage || !afterImage) return null;
      // Same provenance rule as compare: a generated picture is never shown
      // as a before/after result of the business's real work.
      const beforeMedia = beforeImage.mediaRef ? ctx.media(beforeImage.mediaRef) : null;
      const afterMedia = afterImage.mediaRef ? ctx.media(afterImage.mediaRef) : null;
      if (isGeneratedMedia(beforeMedia) || isGeneratedMedia(afterMedia)) return null;
      const beforeSource = beforeImage.mediaRef ? mediaUrl(beforeMedia) : beforeImage.src ? resolveImageSource(beforeImage.src) : null;
      const afterSource = afterImage.mediaRef ? mediaUrl(afterMedia) : afterImage.src ? resolveImageSource(afterImage.src) : null;
      if (beforeSource && afterSource && node.revealMode === "brush")
        return (
          <BrushReveal key={key} props={props} prompt={node.text?.trim().slice(0, 60) || "Reveal the result"}
            before={{ alt: beforeImage.alt, label: beforeImage.label, src: beforeSource }}
            after={{ alt: afterImage.alt, label: afterImage.label, src: afterSource }} />
        );
      return beforeSource && afterSource ? (
        <BeforeAfterSlider key={key} props={props}
          before={{ alt: beforeImage.alt, label: beforeImage.label, src: beforeSource }}
          after={{ alt: afterImage.alt, label: afterImage.label, src: afterSource }}
          initialSplit={node.initialSplit ?? 50} />
      ) : null;
    }
    case "faq_accordion":
      return node.faqItems?.length ? <FaqAccordion key={key} props={props} items={node.faqItems} /> : null;
    case "tab_group":
      return node.tabs?.length ? (
        <TabGroup
          key={key}
          props={props}
          tabs={node.tabs}
          renderPanel={(tab, tabIndex) => tab.children.map((child, childIndex) =>
            renderNode(child, ctx, `${key}.tab.${tabIndex}.${childIndex}`)
          )}
        />
      ) : null;
    case "mobile_sticky_bar":
      return node.primaryCta ? (
        <MobileStickyBar
          key={key}
          props={props}
          primary={{
            label: node.primaryCta.label,
            href: ctx.href(node.primaryCta.href),
            ariaLabel: node.primaryCta.ariaLabel ?? node.primaryCta.label,
          }}
          {...(node.secondaryCta ? {
            secondary: {
              label: node.secondaryCta.label,
              href: ctx.href(node.secondaryCta.href),
              ariaLabel: node.secondaryCta.ariaLabel ?? node.secondaryCta.label,
            },
          } : {})}
        />
      ) : null;
    case "gallery":
      if (!node.children?.some((c) => c.src || (c.mediaRef && mediaUrl(ctx.media(c.mediaRef))))) return null;
      return (
        <div key={key} {...props} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", ...props.style }}>
          {node.children?.map((c, i) => { const resolved = c.mediaRef ? ctx.media(c.mediaRef) : null; const visual = mediaVisual(resolved); const source = c.src ? resolveImageSource(c.src) : mediaUrl(resolved); return source ? (
            <a key={i} href={source} target="_blank" rel="noopener noreferrer">
              <img src={source} alt={c.alt ?? visual?.alt ?? ""} loading="lazy" style={{ width: "100%", height: "100%", ...mediaCss(visual), ...styleToCss(c.style, "media") }} />
            </a>
          ) : null; })}
        </div>
      );
    case "marquee":
      return (
        <div key={key} {...props} style={{ overflow: "hidden", ...props.style }}>
          <div className="rv-cn-marquee" style={{ display: "flex", width: "max-content", gap: props.style.gap }}>
            {kids}
            <div aria-hidden="true" inert style={{ display: "flex", gap: props.style.gap }}>{node.children?.map((c, i) => renderNode(c, ctx, `${key}.dup.${i}`))}</div>
          </div>
        </div>
      );
    case "offer_card": {
      // The price and duration are only ever the named real service's own
      // values from the Services tool. No service, or no price: none shown.
      const facts = node.service && ctx.offer ? ctx.offer(node.service) : null;
      const title = node.text?.trim() || facts?.name || "";
      const actionIndex = children.findIndex((child) => child.type === "button");
      const action = actionIndex >= 0 ? kids[actionIndex] : null;
      if (!title || !action) return null;
      const picture = children.find((child) => child.type === "media");
      const pictureResolved = picture?.mediaRef ? ctx.media(picture.mediaRef) : null;
      const pictureSource = picture?.src ? resolveImageSource(picture.src) : mediaUrl(pictureResolved);
      const specs = (node.items ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 3);
      const Title = ctx.chrome ? "p" : (`h${node.level ?? 3}` as "h2" | "h3" | "h4");
      return (
        <article key={key} {...props} className={`${props.className ?? ""} rv-offer`.trim()} data-rv-card="" data-rv-overlay="offer">
          {picture && pictureSource ? <img className="rv-offer-media" src={pictureSource} alt={picture.alt ?? mediaVisual(pictureResolved)?.alt ?? ""} loading="lazy" decoding="async" style={mediaCss(mediaVisual(pictureResolved))} /> : null}
          <Title className="rv-offer-title">{title}</Title>
          {facts?.price ? <p className="rv-offer-price">{facts.price}{facts.duration ? <span> · {facts.duration}</span> : null}</p> : null}
          {specs.length ? <ul className="rv-offer-specs">{specs.map((spec, i) => <li key={i}>{spec}</li>)}</ul> : null}
          {action}
        </article>
      );
    }
    case "scroll_chapters": {
      const pairs = children.map((child, i) => ({ chapter: kids[i], label: sceneLabel(child) || `Chapter ${i + 1}` })).filter((pair) => pair.chapter != null);
      return pairs.length ? <ScrollChapters key={key} props={props} chapters={pairs.map((pair) => pair.chapter)} labels={pairs.map((pair) => pair.label)} /> : null;
    }
    case "lens_magnifier": {
      const photo = children[0];
      const resolved = photo?.mediaRef ? ctx.media(photo.mediaRef) : null;
      // A magnifier implies real, fine detail: generated or stock pictures show nothing.
      if (!photo || isGeneratedMedia(resolved)) return null;
      const source = mediaUrl(resolved);
      if (!source) return null;
      return <LensMagnifier key={key} props={props} src={source} alt={photo.alt ?? mediaVisual(resolved)?.alt ?? ""} prompt={node.text?.trim().slice(0, 60) || "Inspect the detail"} />;
    }
    case "sticky_split_story": {
      const phases = kids.slice(1).filter((kid) => kid != null);
      return kids[0] && phases.length ? <StickySplitStory key={key} props={props} picture={kids[0]} phases={phases} /> : null;
    }
    case "collection_row": {
      const items = kids.filter((kid) => kid != null);
      return items.length ? <CollectionRow key={key} props={props} label={node.text?.trim() || "Collection"} items={items} /> : null;
    }
    default:
      return <div key={key} {...props}>{node.text ? <span>{node.text}</span> : null}{kids}</div>;
  }
}

const VIDEO_SOURCE = /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i;
const ANCHOR_ROW = { top: "start", center: "center", bottom: "end" } as const;
const ANCHOR_COLUMN = { left: "start", center: "center", right: "end" } as const;
const anchorParts = (anchor: SceneAnchor): [keyof typeof ANCHOR_ROW, keyof typeof ANCHOR_COLUMN] =>
  anchor === "center" ? ["center", "center"] : (anchor.split("-") as [keyof typeof ANCHOR_ROW, keyof typeof ANCHOR_COLUMN]);
const rgba = (hex: string, alpha: number) => {
  const rgb = toRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};
const GRADIENT_TOWARD: Record<SceneAnchor, string | null> = {
  "top-left": "to bottom", "top-center": "to bottom", "top-right": "to bottom",
  "center-left": "to right", center: null, "center-right": "to left",
  "bottom-left": "to top", "bottom-center": "to top", "bottom-right": "to top",
};

/** The first heading of a scene, used to name its chapter. */
function sceneLabel(node: CompositionNode): string {
  const heading = (node.children ?? []).find((child) => child.type === "heading" && child.text?.trim());
  return heading?.text?.trim().slice(0, 80) ?? "";
}

/**
 * A frosted offer card over a scene paints a scrim-tinted surface whose
 * opacity is computed (like the scene's) so its text passes AA whatever the
 * photo behind it shows. An AI-authored background always wins.
 */
function offerSurface(node: CompositionNode, ctx: Ctx, props: NodeProps) {
  if (node.style?.background || !ctx.sceneScrim) return;
  const scrim = sceneScrim({ ink: node.style?.color ?? ctx.fg, scrim: ctx.sceneScrim, opacity: 72 });
  props.style = { ...props.style, backgroundColor: rgba(scrim.scrim, scrim.opacity), color: scrim.ink };
  ctx.bg = scrim.surfaces[0]; ctx.bg2 = scrim.surfaces[1]; ctx.fg = scrim.ink;
}

/**
 * A full-viewport photographic chapter. The backdrop is the first media
 * child; the scrim is computed so the copy slot passes WCAG AA over any photo
 * (the AI's colour and opacity are kept as a floor); the remaining children
 * render in the AI-anchored slot, with offer cards floating on wide screens.
 */
function renderScene(node: CompositionNode, ctx: Ctx, key: string, props: NodeProps): ReactNode {
  const [backdrop, ...rest] = node.children ?? [];
  const resolved = backdrop?.mediaRef ? ctx.media(backdrop.mediaRef) : null;
  const source = backdrop?.type === "media" ? (backdrop.src ? resolveImageSource(backdrop.src) : mediaUrl(resolved)) : null;
  const visual = mediaVisual(resolved);
  const anchor = node.anchor ?? DEFAULT_SCENE_ANCHOR;
  const [row, column] = anchorParts(anchor);
  const id = props["data-cn"];
  let ink: string | undefined;
  let scrimLayer: ReactNode = null;
  if (source) {
    const scrim = sceneScrim({ ink: node.style?.color ?? null, scrim: node.scrim?.color ?? null, opacity: node.scrim?.opacity ?? null });
    ink = scrim.ink;
    ctx.bg = scrim.surfaces[0]; ctx.bg2 = scrim.surfaces[1]; ctx.fg = scrim.ink; ctx.sceneScrim = scrim.scrim;
    const solid = rgba(scrim.scrim, scrim.opacity);
    const toward = GRADIENT_TOWARD[anchor];
    const background = toward
      ? `linear-gradient(${toward}, ${solid} 0%, ${solid} 72%, ${rgba(scrim.scrim, scrim.opacity * 0.3)} 100%)`
      : solid;
    // Phones always get the even scrim: the copy may cover most of the frame.
    ctx.rules.push(`@media (max-width:767px){[data-cn="${id}"] > .rv-scene-scrim{background:${solid}!important}}`);
    scrimLayer = <div className="rv-scene-scrim" aria-hidden="true" data-scrim-opacity={scrim.opacity.toFixed(2)} style={{ background }} />;
  }
  const first = !ctx.counter.sawMedia;
  if (source) ctx.counter.sawMedia = true;
  const eager = first && Boolean(ctx.eagerFirstMedia);
  const alt = backdrop?.alt ?? visual?.alt ?? "";
  const objectPosition = node.focal ?? visual?.object_position ?? visual?.focal_point;
  const media = !source ? null : VIDEO_SOURCE.test(source) ? (
    <SceneVideo src={source} alt={alt} eager={eager} />
  ) : (
    <img className="rv-scene-media" src={source} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" {...(eager ? { fetchPriority: "high" as const } : {})} style={objectPosition ? { objectPosition } : undefined} />
  );
  const copy: ReactNode[] = [];
  const offers = new Map<SceneAnchor, ReactNode[]>();
  rest.forEach((child, i) => {
    const rendered = renderNode(child, ctx, `${key}.${i + 1}`);
    if (rendered == null) return;
    if (child.type === "offer_card") {
      const at = child.anchor ?? DEFAULT_OFFER_ANCHOR;
      offers.set(at, [...(offers.get(at) ?? []), rendered]);
    } else copy.push(rendered);
  });
  if (!media && !copy.length) return null;
  return (
    <div key={key} {...props} className={`${props.className ?? ""} rv-scene`.trim()} data-anchor={anchor} data-rv-scene="" style={{ ...props.style, ...(ink ? { color: ink } : {}) }}>
      {media}
      {scrimLayer}
      <div className="rv-scene-inner" style={{ alignContent: ANCHOR_ROW[row], justifyItems: ANCHOR_COLUMN[column], textAlign: column === "center" ? "center" : column === "right" ? "right" : "left" }}>
        <div className="rv-scene-slot" style={{ alignItems: column === "center" ? "center" : column === "right" ? "flex-end" : "flex-start" }}>{copy}</div>
        {[...offers].map(([at, cards]) => (
          <div key={at} className="rv-scene-offers" data-anchor={at} style={{ textAlign: "left" }}>{cards}</div>
        ))}
      </div>
    </div>
  );
}

/**
 * The turntable. Angle pictures marked generated or stock are never spun:
 * they are not photographs of one real object, so a single still is shown.
 */
function renderSpin(node: CompositionNode, ctx: Ctx, key: string, props: NodeProps): ReactNode {
  let illustrative = false;
  const frames: SpinFrame[] = (node.children ?? []).flatMap((child) => {
    if (child.type !== "media") return [];
    const resolved = child.mediaRef ? ctx.media(child.mediaRef) : null;
    if (isGeneratedMedia(resolved)) illustrative = true;
    const src = child.src ? resolveImageSource(child.src) : mediaUrl(resolved);
    return src ? [{ src, alt: child.alt ?? mediaVisual(resolved)?.alt ?? "" }] : [];
  });
  if (!frames.length) return null;
  ctx.counter.sawMedia = true;
  return (
    <SpinViewer key={key} props={props} frames={illustrative ? frames.slice(0, 1) : frames} label={node.text?.trim() ?? ""} initialFrame={illustrative ? 0 : node.initialFrame ?? 0} podium={node.style?.borderColor} />
  );
}

const EASING_CSS: Record<MotionEasing, string> = {
  ease: "ease", "ease-in": "ease-in", "ease-out": "ease-out", "ease-in-out": "ease-in-out", linear: "linear",
  spring: "cubic-bezier(.34,1.56,.64,1)", snap: "cubic-bezier(.2,.9,.1,1)",
};
/** Turns the AI's validated motion description into CSS variables/animation settings. */
// eslint-disable-next-line react-refresh/only-export-components -- renderer helpers are intentionally co-located with their composition types.
export function motionStyle(motion: NodeMotion): CSSProperties {
  const out: Record<string, string> = {};
  if (motion.delayMs) out["animationDelay"] = `${motion.delayMs}ms`;
  if (motion.durationMs) out["animationDuration"] = `${motion.durationMs}ms`;
  if (motion.easing) out["animationTimingFunction"] = EASING_CSS[motion.easing];
  if (motion.repeat === "loop") { out["animationIterationCount"] = "infinite"; out["animationDirection"] = "alternate"; }
  else if (motion.repeat && motion.repeat > 1) { out["animationIterationCount"] = String(motion.repeat); out["animationDirection"] = "alternate"; }
  if (motion.trigger === "view") out["animationTimeline"] = "view()";
  if (motion.trigger === "view") out["animationRange"] = "entry 0% cover 35%";
  const f = motion.from;
  if (motion.kind === "custom" && f) {
    out["--rv-o"] = String((f.opacity ?? 100) / 100);
    out["--rv-x"] = `${f.x ?? 0}px`;
    out["--rv-y"] = `${f.y ?? 0}px`;
    out["--rv-s"] = String(f.scale ?? 1);
    out["--rv-r"] = `${f.rotate ?? 0}deg`;
    out["--rv-b"] = `${f.blur ?? 0}px`;
  }
  return out as CSSProperties;
}

const HOVER_SHADOW = { none: "none", subtle: "0 4px 14px rgb(0 0 0 / .08)", medium: "0 10px 30px rgb(0 0 0 / .14)", strong: "0 20px 50px rgb(0 0 0 / .22)" } as const;
/** CSS for the AI's validated pointer/touch response; off for reduced-motion visitors. */
// eslint-disable-next-line react-refresh/only-export-components -- renderer helpers are intentionally co-located with their composition types.
export function hoverCss(id: string, h: NodeHover): string {
  const t: string[] = [];
  if (h.x || h.y) t.push(`translate(${h.x ?? 0}px,${h.y ?? 0}px)`);
  if (h.scale != null && h.scale !== 1) t.push(`scale(${h.scale})`);
  if (h.rotate) t.push(`rotate(${h.rotate}deg)`);
  const decl = [t.length ? `transform:${t.join(" ")}` : "", h.opacity != null ? `opacity:${h.opacity / 100}` : "", h.shadow ? `box-shadow:${HOVER_SHADOW[h.shadow]}` : ""].filter(Boolean).join(";");
  const sel = `[data-cn="${id}"]`;
  return `@media (prefers-reduced-motion: no-preference){${sel}{transition:transform ${h.durationMs ?? 240}ms ease,opacity ${h.durationMs ?? 240}ms ease,box-shadow ${h.durationMs ?? 240}ms ease}${sel}:hover,${sel}:focus-visible,${sel}:active{${decl}}}`;
}

type NodeProps = { "data-cn": string; "data-motion": string | undefined; className: string | undefined; style: CSSProperties };

function Tabs({ props, labels, panels }: { props: NodeProps; labels: string[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const id = props["data-cn"];
  return (
    <div {...props}>
      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {labels.map((label, i) => (
          <button key={i} type="button" role="tab" id={`${id}-t${i}`} aria-selected={active === i} aria-controls={`${id}-p${i}`}
            onClick={() => setActive(i)} style={{ minHeight: 44, padding: "0 16px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", opacity: active === i ? 1 : 0.6, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} style={active !== i ? { display: "none" } : { display: "block" }}>{panel}</div>
      ))}
    </div>
  );
}

function Compare({ props, before, after, beforeSource, afterSource }: { props: NodeProps; before: CompositionNode; after: CompositionNode; beforeSource: string; afterSource: string }) {
  // Same accessible, draggable slider as before_after_slider.
  return (
    <BeforeAfterSlider
      props={props}
      before={{ src: beforeSource, alt: before.alt ?? "", label: before.text?.slice(0, 30) || "Before" }}
      after={{ src: afterSource, alt: after.alt ?? "", label: after.text?.slice(0, 30) || "After" }}
      initialSplit={50}
    />
  );
}

/**
 * The hands-on reveal: drag across the before picture and the after appears where you have been, with a live
 * percentage. A mouse paints straight away; on a touch screen the brush is switched on with a button so the
 * page can still be scrolled past it. Keyboard and screen-reader users get a button that shows the finished
 * result, and without JavaScript the finished picture is simply shown.
 */
function BrushReveal({ props, prompt, before, after }: {
  props: NodeProps;
  prompt: string;
  before: { src: string; alt: string; label: string };
  after: { src: string; alt: string; label: string };
}) {
  const figureRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const afterImage = useRef<HTMLImageElement | null>(null);
  const grid = useRef<RevealGrid>(newGrid());
  const last = useRef<{ x: number; y: number } | null>(null);
  const [percent, setPercent] = useState(0);
  const [done, setDone] = useState(false);
  const [armed, setArmed] = useState(false);

  const size = () => {
    const box = figureRef.current?.getBoundingClientRect();
    return { w: box?.width ?? 0, h: box?.height ?? 0 };
  };
  const reset = () => {
    grid.current = newGrid();
    last.current = null;
    setPercent(0);
    setDone(false);
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    const image = new Image();
    image.src = after.src;
    afterImage.current = image;
    const fit = () => {
      const canvas = canvasRef.current;
      const { w, h } = size();
      if (!canvas || !w || !h) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      grid.current = newGrid();
      setPercent(0);
      setDone(false);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    if (figureRef.current) observer?.observe(figureRef.current);
    return () => observer?.disconnect();
  }, [after.src]);

  const stamp = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const image = afterImage.current;
    const { w, h } = size();
    if (!canvas || !image || !image.complete || !w || !h) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = canvas.width / w;
    const radius = brushRadius(w);
    const rect = coverRect(image.naturalWidth, image.naturalHeight, w, h);
    ctx.save();
    ctx.scale(ratio, ratio);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    paintAt(grid.current, x, y, radius, w, h);
  };
  const point = (event: { clientX: number; clientY: number }) => {
    const box = figureRef.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };
  const sweep = (event: { clientX: number; clientY: number }) => {
    const to = point(event);
    const { w } = size();
    for (const p of strokePoints(last.current ?? to, to, brushRadius(w))) stamp(p.x, p.y);
    last.current = to;
    const next = coveragePercent(grid.current);
    setPercent(next);
    if (isRevealDone(next)) setDone(true);
  };
  const live = (pointerType: string) => pointerType === "mouse" || armed;

  return (
    <figure {...props} className={`${props.className ?? ""} rv-cn-compare rv-cn-brush`.trim()} style={{ width: "100%", margin: 0, ...props.style, aspectRatio: undefined }}>
    <div
      ref={figureRef as React.RefObject<HTMLDivElement>}
      style={{ position: "relative", overflow: "hidden", aspectRatio: props.style.aspectRatio ?? "16 / 10", width: "100%", userSelect: "none", touchAction: armed ? "none" : "pan-y", cursor: done ? "default" : "crosshair" }}
      onPointerDown={(event) => {
        if (done || event.button !== 0 || !event.isPrimary || !live(event.pointerType)) return;
        last.current = null;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        sweep(event);
      }}
      onPointerMove={(event) => {
        if (!done && last.current && live(event.pointerType)) sweep(event);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
      onLostPointerCapture={() => (last.current = null)}
    >
      <img src={before.src} alt={before.alt} loading="lazy" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <canvas ref={canvasRef} aria-hidden="true" data-testid="brush-canvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: done ? 0 : 1, transition: "opacity 400ms ease" }} />
      <img src={after.src} alt={done ? after.alt : ""} aria-hidden={done ? undefined : true} draggable={false} data-testid="brush-after" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: done ? 1 : 0, transition: "opacity 400ms ease", pointerEvents: "none" }} />
      <noscript>
        <img src={after.src} alt={after.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      </noscript>
      <div className="rv-cn-compare-label rv-cn-compare-label-before">{done ? after.label : before.label}</div>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between", paddingTop: 10 }}>
      <span aria-live="polite" style={{ fontSize: 14, fontWeight: 600 }}>
        {done ? `${after.label}: all revealed` : percent > 0 ? `${prompt}: ${percent}%` : `${prompt}. Drag across the picture`}
      </span>
      <span style={{ display: "flex", gap: 8 }}>
        {!done ? (
          <button type="button" aria-pressed={armed} onClick={() => setArmed((value) => !value)} className="rv-cn-brush-touch" style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", fontWeight: 600, opacity: armed ? 1 : 0.85 }}>
            {armed ? "Stop" : "Start on touch"}
          </button>
        ) : null}
        <button type="button" onClick={() => (done ? reset() : setDone(true))} style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid currentColor", background: "transparent", color: "inherit", fontWeight: 600 }}>
          {done ? "Start over" : "Show finished result"}
        </button>
      </span>
    </div>
    </figure>
  );
}

function BeforeAfterSlider({ props, before, after, initialSplit }: {
  props: NodeProps;
  before: { src: string; alt: string; label: string };
  after: { src: string; alt: string; label: string };
  initialSplit: number;
}) {
  const [pos, setPos] = useState(clampSplit(initialSplit));
  const dragging = useRef(false);
  const moveTo = (event: { clientX: number; currentTarget: Element }) => {
    const box = (event.currentTarget.closest("figure") ?? event.currentTarget).getBoundingClientRect();
    setPos(splitForPointer(event.clientX, box.left, box.width));
  };
  return (
    <figure {...props} className={`${props.className ?? ""} rv-cn-compare`.trim()} style={{ position: "relative", overflow: "hidden", aspectRatio: props.style.aspectRatio ?? "16 / 10", width: "100%", touchAction: "pan-y", userSelect: "none", ...props.style }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        moveTo(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) moveTo(event);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onLostPointerCapture={() => (dragging.current = false)}
    >
      {/* Both pictures fill the same frame with object-fit: cover, so neither is ever stretched. */}
      <img src={after.src} alt={after.alt} loading="lazy" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before.src} alt={before.alt} loading="lazy" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div className="rv-cn-compare-label rv-cn-compare-label-before">{before.label}</div>
      <div className="rv-cn-compare-label rv-cn-compare-label-after">{after.label}</div>
      <div className="rv-cn-compare-divider" style={{ left: `${pos}%` }} aria-hidden="true" />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Before and after comparison slider"
        aria-description={`${before.alt}. ${after.alt}.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% ${before.label}, ${100 - Math.round(pos)}% ${after.label}`}
        aria-orientation="horizontal"
        className="rv-cn-compare-handle"
        style={{ left: `${pos}%` }}
        onKeyDown={(event) => {
          const next = splitForKey(event.key, pos);
          if (next === null) return;
          event.preventDefault();
          setPos(next);
        }}
      />
    </figure>
  );
}


function FaqAccordion({ props, items }: { props: NodeProps; items: CompositionFaqItem[] }) {
  return (
    <div {...props} className={`${props.className ?? ""} rv-cn-faq`.trim()}>
      {items.map((item, index) => (
        <details key={index} open={item.defaultOpen}>
          <summary><span>{item.question}</span><span aria-hidden="true" className="rv-cn-faq-chevron" /></summary>
          <div className="rv-cn-faq-panel"><div className="rv-cn-faq-panel-inner">{item.answer}</div></div>
        </details>
      ))}
    </div>
  );
}

function TabGroup({ props, tabs, renderPanel }: {
  props: NodeProps;
  tabs: CompositionTab[];
  renderPanel: (tab: CompositionTab, index: number) => ReactNode;
}) {
  const [active, setActive] = useState(0);
  const id = props["data-cn"];
  const activate = (index: number) => setActive(Math.max(0, Math.min(tabs.length - 1, index)));
  const focusTab = (index: number) => {
    const next = Math.max(0, Math.min(tabs.length - 1, index));
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };
  const activeTab = tabs[active];
  if (!activeTab) return null;
  return (
    <div {...props} className={`${props.className ?? ""} rv-cn-tab-group`.trim()}>
      <div role="tablist" aria-label="Options" className="rv-cn-tab-list">
        {tabs.map((tab, index) => (
          <button key={index} type="button" role="tab" id={`${id}-tab-${index}`} aria-selected={active === index} aria-controls={`${id}-panel-${index}`}
            tabIndex={active === index ? 0 : -1} onClick={() => activate(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); const next = (index + 1) % tabs.length; activate(next); focusTab(next); }
              else if (event.key === "ArrowLeft") { event.preventDefault(); const next = (index - 1 + tabs.length) % tabs.length; activate(next); focusTab(next); }
              else if (event.key === "Home") { event.preventDefault(); activate(0); focusTab(0); }
              else if (event.key === "End") { event.preventDefault(); activate(tabs.length - 1); focusTab(tabs.length - 1); }
            }}
            className={`rv-cn-tab ${active === index ? "is-active" : ""}`}>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel-${active}`} aria-labelledby={`${id}-tab-${active}`} className="rv-cn-tab-panel">
        {renderPanel(activeTab, active)}
      </div>
    </div>
  );
}

function MobileStickyBar({ props, primary, secondary }: {
  props: NodeProps;
  primary: { label: string; href: string; ariaLabel: string };
  secondary?: { label: string; href: string; ariaLabel: string };
}) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => {
      const height = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>(".rv-cn-mobile-sticky-bar")).map((item) => item.getBoundingClientRect().height));
      document.documentElement.style.setProperty("--rv-sticky-height", `${Math.ceil(height)}px`);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--rv-sticky-height");
    };
  }, []);
  return (
    <div ref={bar} {...props} role="navigation" aria-label="Quick actions" data-rv-overlay="sticky" className={`${props.className ?? ""} rv-cn-mobile-sticky-bar`.trim()} style={{
      ...props.style,
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex", gap: 8, alignItems: "stretch",
      padding: "10px 12px", paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))",
      background: props.style.background ?? "var(--background)", color: props.style.color ?? "var(--foreground)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    }}>
      <Button asChild variant="outline" style={mobileCtaStyle()}><a href={primary.href} aria-label={primary.ariaLabel}>{primary.label}</a></Button>
      {secondary ? <Button asChild variant="outline" style={mobileCtaStyle()}><a href={secondary.href} aria-label={secondary.ariaLabel}>{secondary.label}</a></Button> : null}
    </div>
  );
}

function mobileCtaStyle(): CSSProperties {
  return { flex: 1, minWidth: 44, minHeight: 44, padding: "8px 14px", borderRadius: 8, border: "1px solid currentColor", font: "inherit", fontWeight: 700, whiteSpace: "normal", overflowWrap: "anywhere", background: "transparent", color: "inherit", touchAction: "manipulation" };
}

const MARQUEE_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-marquee{animation:rv-cn-marquee 30s linear infinite}}@keyframes rv-cn-marquee{to{transform:translateX(-50%)}}`;
const INTERACTIVE_CSS = `
.rv-cn-interactive{transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s cubic-bezier(.16,1,.3,1),opacity .2s ease}
.rv-cn-interactive:hover:not(${FORM_WIDGETS.map((name) => `[data-widget="${name}"]`).join(",")}){transform:translateY(-2px)}
.rv-cn-interactive:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.rv-cn-interactive a:focus-visible,.rv-cn-interactive button:focus-visible{outline:3px solid currentColor;outline-offset:3px}
@media (prefers-reduced-motion: reduce){.rv-cn-interactive{transition:none!important}.rv-cn-interactive:hover{transform:none}}
.rv-cn-compare{cursor:ew-resize}
[data-composition][data-composition] .rv-cn-compare img{height:100%!important;width:100%!important;max-width:none!important}
.rv-cn-compare-divider{position:absolute;top:0;bottom:0;width:3px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / .45),0 0 12px rgb(0 0 0 / .35);transform:translateX(-50%);pointer-events:none;z-index:2}
.rv-cn-compare-handle{position:absolute;top:50%;width:48px;height:48px;border-radius:999px;border:2px solid #fff;background:rgb(17 17 20 / .55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 18px rgb(0 0 0 / .35);transform:translate(-50%,-50%);z-index:3;cursor:ew-resize;touch-action:none;color:#fff;transition:transform .15s ease}
.rv-cn-compare-handle:focus-visible{outline:3px solid #fff;outline-offset:3px}
.rv-cn-compare-handle:hover{transform:translate(-50%,-50%) scale(1.06)}
@media (prefers-reduced-motion: reduce){.rv-cn-compare-handle{transition:none}.rv-cn-compare-handle:hover{transform:translate(-50%,-50%)}}
.rv-cn-compare-handle::before,.rv-cn-compare-handle::after{content:"";position:absolute;top:50%;left:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-top:2px solid currentColor;border-right:2px solid currentColor}
.rv-cn-compare-handle::before{transform:translateX(-6px) rotate(-135deg)} .rv-cn-compare-handle::after{transform:translateX(6px) rotate(45deg)}
.rv-cn-compare-label{position:absolute;top:12px;z-index:4;padding:5px 10px;border-radius:999px;background:rgb(0 0 0 / .62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:white;font-weight:600;font-size:12px;line-height:1.2;pointer-events:none;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rv-cn-compare-label-before{left:12px}.rv-cn-compare-label-after{right:12px}
.rv-cn-faq{display:grid;gap:var(--rv-faq-gap,0)}
.rv-cn-faq details{border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
.rv-cn-faq summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;list-style:none;padding:16px 0;font-weight:600}
.rv-cn-faq summary::-webkit-details-marker{display:none}
.rv-cn-faq-chevron{position:relative;display:inline-block;width:20px;height:20px;flex:0 0 20px;transition:transform .22s ease}
.rv-cn-faq-chevron::before,.rv-cn-faq-chevron::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:2px;margin:-1px 0 0 -6px;border-radius:2px;background:var(--primary,currentColor)}
.rv-cn-faq-chevron::after{transform:rotate(90deg);transition:transform .22s ease}
.rv-cn-faq details[open] .rv-cn-faq-chevron::after{transform:rotate(0deg)}
.rv-faq-boxed .rv-cn-faq{--rv-faq-gap:12px}.rv-faq-boxed .rv-cn-faq details{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:var(--radius,12px);padding:0 18px;background:color-mix(in srgb,var(--card,transparent) 70%,transparent)}
.rv-faq-floating .rv-cn-faq{--rv-faq-gap:12px}.rv-faq-floating .rv-cn-faq details{border:0;border-radius:var(--radius,14px);padding:0 20px;background:var(--card,transparent);box-shadow:var(--site-card-shadow,0 8px 28px rgb(0 0 0 / .12))}
.rv-faq-minimal .rv-cn-faq details{border:0}
.rv-card-tint [data-rv-card]{background:color-mix(in srgb,var(--primary) 7%,var(--card,transparent));border:1px solid color-mix(in srgb,var(--primary) 18%,transparent)}
.rv-card-outline [data-rv-card]{background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent)}
.rv-card-elevated [data-rv-card]{border:0;box-shadow:var(--site-card-shadow,0 12px 36px rgb(0 0 0 / .14))}
.rv-card-glass [data-rv-card]{background:color-mix(in srgb,var(--card,#fff) 55%,transparent);border:1px solid color-mix(in srgb,currentColor 12%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.rv-card-bare [data-rv-card]{background:transparent;border:0;box-shadow:none}
.rv-button-outline [data-rv-button]{background:transparent;color:inherit;border:2px solid var(--primary)}
.rv-button-soft [data-rv-button]{background:color-mix(in srgb,var(--primary) 16%,transparent);color:inherit;border:0}
.rv-button-underline [data-rv-button]{background:transparent;color:inherit;border:0;border-bottom:2px solid var(--primary);border-radius:0}
.rv-cn-faq-panel{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s ease}
.rv-cn-faq details[open] .rv-cn-faq-panel{grid-template-rows:1fr}
.rv-cn-faq-panel-inner{min-height:0;overflow:hidden;padding:0 0 14px;white-space:pre-wrap}
@supports (interpolate-size:allow-keywords){.rv-cn-faq details{interpolate-size:allow-keywords}.rv-cn-faq details::details-content{block-size:0;overflow:clip;transition:block-size .24s ease,content-visibility .24s;transition-behavior:allow-discrete}.rv-cn-faq details[open]::details-content{block-size:auto}}
.rv-cn-tab-list{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid currentColor}
.rv-cn-tab{position:relative;min-height:44px;padding:0 16px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer;opacity:.65}
.rv-cn-tab::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:3px;background:currentColor;transform:scaleX(0);transform-origin:center;transition:transform .22s ease}
.rv-cn-tab.is-active{opacity:1}.rv-cn-tab.is-active::after{transform:scaleX(1)}
.rv-cn-tab:focus-visible,.rv-cn-faq summary:focus-visible,.rv-cn-mobile-sticky-bar a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.rv-cn-mobile-sticky-bar{display:none}
@media (max-width:767px){.rv-cn-mobile-sticky-bar{display:flex!important;position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:50!important;padding-bottom:max(10px,env(safe-area-inset-bottom,0px))!important}.rv-cn-mobile-sticky-bar a{min-height:44px;min-width:44px}}
@media (min-width:768px){.rv-cn-mobile-sticky-bar{display:none!important}}
@media (max-width:767px){html:has(input:focus,textarea:focus,select:focus) .rv-cn-mobile-sticky-bar{display:none!important}}
@media (prefers-reduced-motion: reduce){.rv-cn-faq details::details-content{transition:none!important}}
@media (prefers-reduced-motion: reduce){.rv-cn-faq-chevron,.rv-cn-faq-panel,.rv-cn-tab::after{transition:none!important}}
`;

/**
 * Selectors are written with a doubled attribute so they outrank any
 * per-block [data-cn] rule by specificity, whatever order the stylesheets end
 * up in (the shared sheet is hoisted into <head>, before section rules).
 *
 * Objective phone safeguards (WCAG tap size / readable text / no horizontal
 * clipping). These never choose colours, fonts, order or layout — they only
 * stop AI-authored layers from becoming unusable on narrow screens.
 */
export const PHONE_SAFETY_CSS = `[data-composition]{box-sizing:border-box;max-width:100%;min-width:0;overflow-x:clip;padding-inline-start:max(0px,env(safe-area-inset-left,0px));padding-inline-end:max(0px,env(safe-area-inset-right,0px))}[data-composition][data-composition] *{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:break-word}[data-composition][data-composition] :is(h1,h2,h3,h4){text-wrap:balance;overflow-wrap:break-word;word-break:normal;hyphens:manual}[data-composition][data-composition] :is(p,span,li,label){overflow-wrap:break-word;word-break:normal}[data-composition][data-composition] :is(p,li){text-wrap:pretty}[data-composition][data-composition] img{image-rendering:auto}[data-composition][data-composition] img,[data-composition][data-composition] video,[data-composition][data-composition] iframe{max-width:100%;height:auto}@media (max-width:639px){[data-composition][data-composition] [style*="grid-template-columns"]:not([data-mobile-cols]),[data-composition][data-composition] .grid:not([data-mobile-cols]){width:100%!important;max-width:100%!important;grid-template-columns:minmax(0,1fr)!important}[data-composition][data-composition] [data-widget],[data-composition][data-composition] form{width:100%!important;max-width:100%!important}[data-composition][data-composition] h1{font-size:min(var(--rv-mfs,2.75rem),2.75rem,11vw)!important;line-height:max(1.05,var(--rv-mlh,1.05))!important}[data-composition][data-composition] h2{font-size:min(var(--rv-mfs,2.25rem),2.25rem,9.5vw)!important;line-height:max(1.1,var(--rv-mlh,1.1))!important}[data-composition][data-composition] h3{font-size:min(var(--rv-mfs,1.6rem),1.6rem,7vw)!important;line-height:max(1.12,var(--rv-mlh,1.12))!important}[data-composition][data-composition] p,[data-composition][data-composition] li,[data-composition][data-composition] span,[data-composition][data-composition] a,[data-composition][data-composition] small,[data-composition][data-composition] label{font-size:max(14px,1em)!important;line-height:1.45}[data-composition][data-composition] a,[data-composition][data-composition] button{min-height:44px!important}[data-composition][data-composition] a{align-items:center}[data-composition][data-composition] [style*="grid-template-areas"]{grid-template-areas:none!important}[data-composition][data-composition] [style*="grid-area"]{grid-area:auto!important}}`;

const MOTION_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-motion{animation:rv-cn-in .7s ease both}.rv-cn-motion[data-motion=rise]{animation-name:rv-cn-rise}.rv-cn-motion[data-motion=scale]{animation-name:rv-cn-scale}.rv-cn-motion[data-motion=float]{animation:rv-cn-float 6s ease-in-out infinite}.rv-cn-motion[data-motion=slide-left]{animation-name:rv-cn-sl}.rv-cn-motion[data-motion=slide-right]{animation-name:rv-cn-sr}.rv-cn-motion[data-motion=blur]{animation-name:rv-cn-blur}.rv-cn-motion[data-motion=reveal]{animation-name:rv-cn-reveal}.rv-cn-motion[data-motion=custom]{animation-name:rv-cn-custom}}@keyframes rv-cn-custom{from{opacity:var(--rv-o,1);transform:translate(var(--rv-x,0),var(--rv-y,0)) scale(var(--rv-s,1)) rotate(var(--rv-r,0));filter:blur(var(--rv-b,0))}}@keyframes rv-cn-sl{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}@keyframes rv-cn-sr{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}@keyframes rv-cn-blur{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:none}}@keyframes rv-cn-reveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}@keyframes rv-cn-in{from{opacity:0}to{opacity:1}}@keyframes rv-cn-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes rv-cn-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@keyframes rv-cn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;

export function CompositionRenderer({ tree, scope, as = "section", resolveHref, resolveMedia, resolveWidget, resolveOffer, eagerFirstMedia = false, surface = null, linkLabel, editable = false }: { tree: CompositionTree; scope: string; editable?: boolean; surface?: string | null; linkLabel?: (text: string) => string; as?: "section" | "div"; resolveHref?: (href: string) => string; resolveMedia?: (ref: string) => ResolvedMedia | null; resolveWidget?: (name: string, presentation?: WidgetPresentation) => ReactNode; /** Real service facts for offer cards (Services tool); without it no price is shown. */ resolveOffer?: (service: string) => OfferFacts | null; eagerFirstMedia?: boolean }) {
  const page = surface && /^#[0-9a-f]{6}$/i.test(surface) ? surface : undefined;
  const ctx: Ctx = { ...(resolveOffer ? { offer: resolveOffer } : {}), ...(CHROME_SCOPES.has(scope) ? { chrome: true } : {}), ...(editable ? { editable: true } : {}), ...(linkLabel ? { label: linkLabel } : {}), ...(page ? { bg: page, fg: bestInk(page) } : {}), rules: [], counter: { n: 0 }, eagerFirstMedia, scope: scope.replace(/[^\w-]/g, "") || "cn", href: resolveHref ?? ((h) => h), media: resolveMedia ?? (() => null), widget: resolveWidget ?? (() => null) };
  const body = renderNode(tree.root, ctx, "root");
  // The shared rules are identical for every section. They used to be
  // repeated inline in each one (several KB per section, re-parsed by the
  // browser every time); React now hoists one copy into <head>. Only the
  // section's own responsive/hover rules stay inline, after the shared ones.
  const shared = (
    <style href="rv-cn-shared" precedence="rv-cn">
      {MOTION_CSS + MARQUEE_CSS + INTERACTIVE_CSS + PHONE_SAFETY_CSS + CINEMATIC_CSS}
    </style>
  );
  const own = ctx.rules.length ? <style>{ctx.rules.join("")}</style> : null;
  // Unstyled text was measured against this surface's ink, so the wrapper
  // must actually paint that ink — otherwise it inherits whatever the page
  // or <body> happens to use (white-on-white on light client sites).
  const rootStyle: CSSProperties | undefined = page ? { color: bestInk(page) } : undefined;
  return (
    as === "div" ? (
      <div data-composition={tree.label ?? "composition"} style={rootStyle}>
        {shared}
        {own}
        {body}
      </div>
    ) : (
      <section data-composition={tree.label ?? "composition"} style={rootStyle}>
        {shared}
        {own}
        {body}
      </section>
    )
  );
}
