import { useState, type CSSProperties, type ReactNode } from "react";
import type { Breakpoint, CompositionNode, CompositionTree, MotionEasing, NodeHover, NodeMotion, NodeStyle, WidgetPresentation } from "@/lib/builder/composition-tree";
import type { PersistedComponentVisual } from "@/lib/site-style";
import { resolveImageSource } from "@/lib/brand-logos";

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
  if (style.size != null) css.fontSize = style.size;
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
  if (style.rotate != null) css.transform = `rotate(${style.rotate}deg)`;
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
type Ctx = { rules: string[]; counter: { n: number }; scope: string; href: (h: string) => string; media: (ref: string) => ResolvedMedia | null; widget: (name: string, presentation?: WidgetPresentation) => ReactNode };

const mediaUrl = (media: ResolvedMedia | null): string | null =>
  typeof media === "string" ? media : media?.url ?? null;
const mediaVisual = (media: ResolvedMedia | null): PersistedComponentVisual | undefined =>
  typeof media === "string" ? undefined : media?.visual;

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
  const id = `${ctx.scope}-${ctx.counter.n++}`;
  for (const [bp, style] of Object.entries(node.responsive ?? {}) as [Breakpoint, NodeStyle][]) {
    const text = cssText(styleToCss(style, node.type));
    if (text) ctx.rules.push(`@media ${MEDIA[bp]}{[data-cn="${id}"]{${text}}}`);
  }
  if (node.hover) ctx.rules.push(hoverCss(id, node.hover));
  const style: CSSProperties = { ...baseLayout(node.type), ...styleToCss(node.style, node.type) };
  const motion = node.motion && node.motion.kind !== "none" ? node.motion : null;
  const props = {
    "data-cn": id,
    "data-motion": motion?.kind,
    className: motion ? "rv-cn-motion" : undefined,
    style: motion ? { ...style, ...motionStyle(motion) } : style,
  };
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
      const Tag = (`h${node.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      return <Tag key={key} {...props}>{node.text}{kids}</Tag>;
    }
    case "text":
      return <p key={key} {...props}>{node.text}{kids}</p>;
    case "media":
      { const resolved = node.mediaRef ? ctx.media(node.mediaRef) : null;
        const visual = mediaVisual(resolved);
        const source = node.src ? resolveImageSource(node.src) : mediaUrl(resolved);
        return source ? <img key={key} {...props} src={source} alt={node.alt ?? visual?.alt ?? ""} loading="lazy" style={{ width: "100%", ...mediaCss(visual), ...props.style }} /> : null; }
    case "widget":
      { const w = node.text ? ctx.widget(node.text, node.widgetPresentation) : null;
        return w ? <div key={key} {...props} data-widget={node.text} style={{ ...props.style, ...widgetThemeStyle(node.widgetPresentation?.theme) }}>{w}{kids}</div> : null; }
    case "button":
    case "link":
      return <a key={key} {...props} href={node.href ? ctx.href(node.href) : undefined}>{node.text}{kids}</a>;
    case "list":
      return <ul key={key} {...props}>{node.items?.map((item, i) => <li key={i}>{item}</li>)}</ul>;
    case "divider":
      return <hr key={key} {...props} />;
    case "icon":
      return <span key={key} aria-hidden="true" {...props}>{node.text}</span>;
    case "card":
      return <article key={key} {...props}>{kids}</article>;
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
      const beforeSource = before?.src ? resolveImageSource(before.src) : (before?.mediaRef ? mediaUrl(ctx.media(before.mediaRef)) : null);
      const afterSource = after?.src ? resolveImageSource(after.src) : (after?.mediaRef ? mediaUrl(ctx.media(after.mediaRef)) : null);
      return before && after && beforeSource && afterSource ? <Compare key={key} props={props} before={before} after={after} beforeSource={beforeSource} afterSource={afterSource} /> : null;
    }
    case "gallery":
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
            <div aria-hidden="true" style={{ display: "flex", gap: props.style.gap }}>{node.children?.map((c, i) => renderNode(c, ctx, `${key}.dup.${i}`))}</div>
          </div>
        </div>
      );
    default:
      return <div key={key} {...props}>{node.text ? <span>{node.text}</span> : null}{kids}</div>;
  }
}

const EASING_CSS: Record<MotionEasing, string> = {
  ease: "ease", "ease-in": "ease-in", "ease-out": "ease-out", "ease-in-out": "ease-in-out", linear: "linear",
  spring: "cubic-bezier(.34,1.56,.64,1)", snap: "cubic-bezier(.2,.9,.1,1)",
};
/** Turns the AI's validated motion description into CSS variables/animation settings. */
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
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={active !== i}>{panel}</div>
      ))}
    </div>
  );
}

function Compare({ props, before, after, beforeSource, afterSource }: { props: NodeProps; before: CompositionNode; after: CompositionNode; beforeSource: string; afterSource: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div {...props} style={{ position: "relative", overflow: "hidden", ...props.style }}>
      <img src={afterSource} alt={after.alt ?? ""} loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: after.style?.objectFit ?? "cover" }} />
      <img src={beforeSource} alt={before.alt ?? ""} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: before.style?.objectFit ?? "cover", clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: `${pos}%`, width: 2, background: "currentColor" }} />
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "ew-resize", margin: 0 }} />
    </div>
  );
}

const MARQUEE_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-marquee{animation:rv-cn-marquee 30s linear infinite}}@keyframes rv-cn-marquee{to{transform:translateX(-50%)}}`;

/**
 * Objective phone safeguards (WCAG tap size / readable text / no horizontal
 * clipping). These never choose colours, fonts, order or layout — they only
 * stop AI-authored layers from becoming unusable on narrow screens.
 */
export const PHONE_SAFETY_CSS = `[data-composition]{max-width:100%;overflow-x:clip}[data-composition] *{min-width:0;overflow-wrap:break-word}[data-composition] :is(h1,h2,h3,h4){text-wrap:balance;hyphens:manual}[data-composition] img,[data-composition] video,[data-composition] iframe{max-width:100%;height:auto}@media (max-width:639px){[data-composition] [style*="grid-template-columns"],[data-composition] .grid{width:100%!important;max-width:100%!important;grid-template-columns:1fr!important}[data-composition] :is(h1,h2,h3,h4,p,span,label){overflow-wrap:break-word;word-break:normal;hyphens:none}[data-composition] [data-widget],[data-composition] form{width:100%!important;max-width:100%!important}[data-composition] h1{font-size:min(2.75rem,11vw)!important;line-height:1.05!important}[data-composition] h2{font-size:min(2.25rem,9.5vw)!important;line-height:1.1!important}[data-composition] h3{font-size:min(1.6rem,7vw)!important}[data-composition] p,[data-composition] li,[data-composition] span,[data-composition] a,[data-composition] small,[data-composition] label{font-size:max(14px,1em)!important}[data-composition] a,[data-composition] button{min-height:44px!important}[data-composition] a{display:inline-flex!important;align-items:center}[data-composition] [style*="position: absolute"],[data-composition] [style*="position:absolute"]{position:relative!important;inset:auto!important}[data-composition] [style*="margin-top: -"]{margin-top:0!important}[data-composition] [style*="rotate("]{transform:none!important}[data-composition] [style*="grid-template-columns"]{grid-template-columns:minmax(0,1fr)!important}[data-composition] [style*="grid-template-areas"]{grid-template-areas:none!important}[data-composition] [style*="grid-area"]{grid-area:auto!important}}`;

const MOTION_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-motion{animation:rv-cn-in .7s ease both}.rv-cn-motion[data-motion=rise]{animation-name:rv-cn-rise}.rv-cn-motion[data-motion=scale]{animation-name:rv-cn-scale}.rv-cn-motion[data-motion=float]{animation:rv-cn-float 6s ease-in-out infinite}.rv-cn-motion[data-motion=slide-left]{animation-name:rv-cn-sl}.rv-cn-motion[data-motion=slide-right]{animation-name:rv-cn-sr}.rv-cn-motion[data-motion=blur]{animation-name:rv-cn-blur}.rv-cn-motion[data-motion=reveal]{animation-name:rv-cn-reveal}.rv-cn-motion[data-motion=custom]{animation-name:rv-cn-custom}}@keyframes rv-cn-custom{from{opacity:var(--rv-o,1);transform:translate(var(--rv-x,0),var(--rv-y,0)) scale(var(--rv-s,1)) rotate(var(--rv-r,0));filter:blur(var(--rv-b,0))}}@keyframes rv-cn-sl{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}@keyframes rv-cn-sr{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}@keyframes rv-cn-blur{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:none}}@keyframes rv-cn-reveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}@keyframes rv-cn-in{from{opacity:0}to{opacity:1}}@keyframes rv-cn-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes rv-cn-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@keyframes rv-cn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;

export function CompositionRenderer({ tree, scope, as = "section", resolveHref, resolveMedia, resolveWidget }: { tree: CompositionTree; scope: string; as?: "section" | "div"; resolveHref?: (href: string) => string; resolveMedia?: (ref: string) => ResolvedMedia | null; resolveWidget?: (name: string) => ReactNode }) {
  const ctx: Ctx = { rules: [], counter: { n: 0 }, scope: scope.replace(/[^\w-]/g, "") || "cn", href: resolveHref ?? ((h) => h), media: resolveMedia ?? (() => null), widget: resolveWidget ?? (() => null) };
  const body = renderNode(tree.root, ctx, "root");
  return (
    as === "div" ? (
      <div data-composition={tree.label ?? "composition"}>
        <style>{MOTION_CSS + MARQUEE_CSS + ctx.rules.join("") + PHONE_SAFETY_CSS}</style>
        {body}
      </div>
    ) : (
      <section data-composition={tree.label ?? "composition"}>
        <style>{MOTION_CSS + MARQUEE_CSS + ctx.rules.join("") + PHONE_SAFETY_CSS}</style>
        {body}
      </section>
    )
  );
}
