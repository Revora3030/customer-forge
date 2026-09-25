import { useState, type CSSProperties, type ReactNode } from "react";
import type { Breakpoint, CompositionNode, CompositionTree, MotionEasing, NodeMotion, NodeStyle } from "@/lib/builder/composition-tree";

/**
 * Draws any validated AI-authored composition tree. It only translates the
 * AI's values into CSS — it never adds, reorders or restyles anything itself.
 * Responsive overrides become scoped CSS custom properties per breakpoint.
 */
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

type Ctx = { rules: string[]; counter: { n: number }; scope: string; href: (h: string) => string; media: (ref: string) => string | null };

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
  const style: CSSProperties = { ...baseLayout(node.type), ...styleToCss(node.style, node.type) };
  const motion = node.motion && node.motion.kind !== "none" ? node.motion : null;
  const props = {
    "data-cn": id,
    "data-motion": motion?.kind,
    className: motion ? "rv-cn-motion" : undefined,
    style: motion ? { ...style, ...motionStyle(motion) } : style,
  };
  const kids = node.children?.map((child, i) => renderNode(child, ctx, `${key}.${i}`));

  switch (node.type) {
    case "heading": {
      const Tag = (`h${node.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      return <Tag key={key} {...props}>{node.text}{kids}</Tag>;
    }
    case "text":
      return <p key={key} {...props}>{node.text}{kids}</p>;
    case "media":
      { const source = node.src ?? (node.mediaRef ? ctx.media(node.mediaRef) : null);
        return source ? <img key={key} {...props} src={source} alt={node.alt ?? ""} loading="lazy" style={{ objectFit: "cover", width: "100%", ...props.style }} /> : null; }
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
      const beforeSource = before?.src ?? (before?.mediaRef ? ctx.media(before.mediaRef) : null);
      const afterSource = after?.src ?? (after?.mediaRef ? ctx.media(after.mediaRef) : null);
      return before && after && beforeSource && afterSource ? <Compare key={key} props={props} before={before} after={after} beforeSource={beforeSource} afterSource={afterSource} /> : null;
    }
    case "gallery":
      return (
        <div key={key} {...props} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", ...props.style }}>
          {node.children?.map((c, i) => { const source = c.src ?? (c.mediaRef ? ctx.media(c.mediaRef) : null); return source ? (
            <a key={i} href={source} target="_blank" rel="noopener noreferrer">
              <img src={source} alt={c.alt ?? ""} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", ...styleToCss(c.style, "media") }} />
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
export const PHONE_SAFETY_CSS = `[data-composition]{max-width:100%;overflow-x:clip}[data-composition] *{min-width:0;overflow-wrap:anywhere}[data-composition] img,[data-composition] video,[data-composition] iframe{max-width:100%;height:auto}@media (max-width:639px){[data-composition] p,[data-composition] li,[data-composition] span,[data-composition] a,[data-composition] small,[data-composition] label{font-size:max(14px,1em)!important}[data-composition] a,[data-composition] button{min-height:44px!important}[data-composition] a{display:inline-flex!important;align-items:center}[data-composition] [style*="position: absolute"],[data-composition] [style*="position:absolute"]{position:relative!important;inset:auto!important}[data-composition] [style*="margin-top: -"]{margin-top:0!important}[data-composition] [style*="rotate("]{transform:none!important}[data-composition] [style*="grid-template-columns"]{grid-template-columns:minmax(0,1fr)!important}[data-composition] [style*="grid-template-areas"]{grid-template-areas:none!important}[data-composition] [style*="grid-area"]{grid-area:auto!important}}`;

const MOTION_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-motion{animation:rv-cn-in .7s ease both}.rv-cn-motion[data-motion=rise]{animation-name:rv-cn-rise}.rv-cn-motion[data-motion=scale]{animation-name:rv-cn-scale}.rv-cn-motion[data-motion=float]{animation:rv-cn-float 6s ease-in-out infinite}.rv-cn-motion[data-motion=slide-left]{animation-name:rv-cn-sl}.rv-cn-motion[data-motion=slide-right]{animation-name:rv-cn-sr}.rv-cn-motion[data-motion=blur]{animation-name:rv-cn-blur}.rv-cn-motion[data-motion=reveal]{animation-name:rv-cn-reveal}.rv-cn-motion[data-motion=custom]{animation-name:rv-cn-custom}}@keyframes rv-cn-custom{from{opacity:var(--rv-o,1);transform:translate(var(--rv-x,0),var(--rv-y,0)) scale(var(--rv-s,1)) rotate(var(--rv-r,0));filter:blur(var(--rv-b,0))}}@keyframes rv-cn-sl{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}@keyframes rv-cn-sr{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}@keyframes rv-cn-blur{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:none}}@keyframes rv-cn-reveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}@keyframes rv-cn-in{from{opacity:0}to{opacity:1}}@keyframes rv-cn-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes rv-cn-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@keyframes rv-cn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;

export function CompositionRenderer({ tree, scope, as = "section", resolveHref, resolveMedia }: { tree: CompositionTree; scope: string; as?: "section" | "div"; resolveHref?: (href: string) => string; resolveMedia?: (ref: string) => string | null }) {
  const ctx: Ctx = { rules: [], counter: { n: 0 }, scope: scope.replace(/[^\w-]/g, "") || "cn", href: resolveHref ?? ((h) => h), media: resolveMedia ?? (() => null) };
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
