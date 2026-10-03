import { useState, type CSSProperties, type ReactNode } from "react";
import type { Breakpoint, CompositionFaqItem, CompositionNode, CompositionTab, CompositionTree, MotionEasing, NodeHover, NodeMotion, NodeStyle, WidgetPresentation } from "@/lib/builder/composition-tree";
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
type Ctx = { rules: string[]; counter: { n: number; sawMedia?: boolean }; eagerFirstMedia?: boolean; scope: string; href: (h: string) => string; media: (ref: string) => ResolvedMedia | null; widget: (name: string, presentation?: WidgetPresentation) => ReactNode };

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
  const interactive = node.type === "button" || node.type === "link" || node.type === "card" || node.type === "widget";
  const classNames = [
    motion ? "rv-cn-motion" : "",
    interactive ? "rv-cn-interactive" : "",
    node.type === "heading" || node.type === "text" ? "rv-cn-copy" : "",
  ].filter(Boolean).join(" ") || undefined;
  const mobileCols = node.type === "grid" && node.responsive?.mobile?.columns != null ? "" : undefined;
  const props = {
    "data-cn": id,
    "data-motion": motion?.kind,
    ...(mobileCols !== undefined ? { "data-mobile-cols": mobileCols } : {}),
    className: classNames,
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
      const href = node.href ? ctx.href(node.href) : undefined;
      const external = Boolean(href && /^https:\/\//i.test(href));
      return (
        <a key={key} {...props} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {node.text}{kids}
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
    case "before_after_slider":
      return node.beforeImage && node.afterImage ? (
        <BeforeAfterSlider key={key} props={props}
          before={{ ...node.beforeImage, src: resolveImageSource(node.beforeImage.src) }}
          after={{ ...node.afterImage, src: resolveImageSource(node.afterImage.src) }}
          initialSplit={node.initialSplit ?? 50} />
      ) : null;
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
    default:
      return <div key={key} {...props}>{node.text ? <span>{node.text}</span> : null}{kids}</div>;
  }
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

function BeforeAfterSlider({ props, before, after, initialSplit }: {
  props: NodeProps;
  before: { src: string; alt: string; label: string };
  after: { src: string; alt: string; label: string };
  initialSplit: number;
}) {
  const [pos, setPos] = useState(Math.min(100, Math.max(0, initialSplit)));
  return (
    <figure {...props} style={{ position: "relative", overflow: "hidden", aspectRatio: props.style.aspectRatio ?? "16 / 10", width: "100%", touchAction: "none", ...props.style }}>
      <img src={after.src} alt={after.alt} loading="lazy" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", userSelect: "none" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before.src} alt="" loading="lazy" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", userSelect: "none" }} />
      </div>
      <div aria-hidden="true" className="rv-cn-compare-divider" style={{ left: `${pos}%` }}><span className="rv-cn-compare-handle" /></div>
      <div className="rv-cn-compare-label rv-cn-compare-label-before">{before.label}</div>
      <div className="rv-cn-compare-label rv-cn-compare-label-after">{after.label}</div>
      <input type="range" min={0} max={100} step={1} value={pos}
        onChange={(event) => setPos(Number(event.currentTarget.value))}
        aria-label={`${before.label} versus ${after.label}`}
        aria-valuetext={`${Math.round(pos)}% ${before.label}`}
        className="rv-cn-compare-input"
      />
    </figure>
  );
}

function FaqAccordion({ props, items }: { props: NodeProps; items: CompositionFaqItem[] }) {
  return (
    <div {...props} className={`${props.className ?? ""} rv-cn-faq`.trim()}>
      {items.map((item, index) => (
        <details key={index} open={item.defaultOpen}>
          <summary><span>{item.question}</span><span aria-hidden="true" className="rv-cn-faq-chevron">⌄</span></summary>
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
        {renderPanel(tabs[active]!, active)}
      </div>
    </div>
  );
}

function MobileStickyBar({ props, primary, secondary }: {
  props: NodeProps;
  primary: { label: string; href: string; ariaLabel: string };
  secondary?: { label: string; href: string; ariaLabel: string };
}) {
  return (
    <div {...props} className={`${props.className ?? ""} rv-cn-mobile-sticky-bar`.trim()} style={{
      ...props.style,
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, display: "flex", gap: 8, alignItems: "stretch",
      padding: "10px 12px", paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))",
      background: props.style.background ?? "Canvas", color: props.style.color ?? "CanvasText",
    }}>
      <a href={primary.href} aria-label={primary.ariaLabel ?? primary.label} style={{ flex: secondary ? 1 : "0 1 100%", minWidth: 0, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", textDecoration: "none", touchAction: "manipulation", ...mobileCtaStyle(true) }}>{primary.label}</a>
      {secondary ? <a href={secondary.href} aria-label={secondary.ariaLabel ?? secondary.label} style={{ flex: 1, minWidth: 0, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", textDecoration: "none", touchAction: "manipulation", ...mobileCtaStyle(false) }}>{secondary.label}</a> : null}
    </div>
  );
}

function mobileCtaStyle(primary: boolean): CSSProperties {
  return { borderRadius: 10, border: "1px solid currentColor", font: "inherit", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: primary ? "currentColor" : "transparent", color: primary ? "Canvas" : "inherit" };
}

const MARQUEE_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-marquee{animation:rv-cn-marquee 30s linear infinite}}@keyframes rv-cn-marquee{to{transform:translateX(-50%)}}`;
const INTERACTIVE_CSS = `
.rv-cn-interactive{transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s cubic-bezier(.16,1,.3,1),opacity .2s ease}
.rv-cn-interactive:hover{transform:translateY(-2px)}
.rv-cn-interactive:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.rv-cn-interactive a:focus-visible,.rv-cn-interactive button:focus-visible{outline:3px solid currentColor;outline-offset:3px}
@media (prefers-reduced-motion: reduce){.rv-cn-interactive{transition:none!important}.rv-cn-interactive:hover{transform:none}}
.rv-cn-compare-input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;touch-action:none;z-index:3}
.rv-cn-compare-divider{position:absolute;top:0;bottom:0;width:2px;background:currentColor;transform:translateX(-1px);pointer-events:none;z-index:2}
.rv-cn-compare-handle{position:absolute;top:50%;left:50%;width:44px;height:44px;border-radius:999px;border:2px solid currentColor;background:Canvas;box-shadow:0 3px 16px rgb(0 0 0 / .22);transform:translate(-50%,-50%);display:grid;place-items:center}
.rv-cn-compare-handle::before,.rv-cn-compare-handle::after{content:"";position:absolute;width:7px;height:7px;border-top:2px solid currentColor;border-right:2px solid currentColor}
.rv-cn-compare-handle::before{transform:translateX(-6px) rotate(-135deg)} .rv-cn-compare-handle::after{transform:translateX(6px) rotate(45deg)}
.rv-cn-compare-label{position:absolute;top:12px;z-index:4;padding:5px 9px;border-radius:999px;background:rgb(0 0 0 / .55);color:white;font-size:12px;line-height:1.2;pointer-events:none;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rv-cn-compare-label-before{left:12px}.rv-cn-compare-label-after{right:12px}
.rv-cn-faq details{border-bottom:1px solid currentColor}
.rv-cn-faq summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;list-style:none;padding:14px 0}
.rv-cn-faq summary::-webkit-details-marker{display:none}
.rv-cn-faq-chevron{display:inline-grid;place-items:center;width:28px;height:28px;flex:0 0 28px;transition:transform .22s ease}
.rv-cn-faq details[open] .rv-cn-faq-chevron{transform:rotate(180deg)}
.rv-cn-faq-panel{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s ease}
.rv-cn-faq details[open] .rv-cn-faq-panel{grid-template-rows:1fr}
.rv-cn-faq-panel-inner{min-height:0;overflow:hidden;padding:0 0 14px;white-space:pre-wrap}
.rv-cn-tab-list{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;border-bottom:1px solid currentColor}
.rv-cn-tab{position:relative;min-height:44px;padding:0 16px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer;opacity:.65}
.rv-cn-tab::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:3px;background:currentColor;transform:scaleX(0);transform-origin:center;transition:transform .22s ease}
.rv-cn-tab.is-active{opacity:1}.rv-cn-tab.is-active::after{transform:scaleX(1)}
.rv-cn-tab:focus-visible,.rv-cn-faq summary:focus-visible,.rv-cn-mobile-sticky-bar a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.rv-cn-mobile-sticky-bar{display:none}
@media (max-width:639px){.rv-cn-mobile-sticky-bar{display:flex!important;position:fixed!important;left:0!important;right:0!important;bottom:0!important}}
@media (min-width:640px){.rv-cn-mobile-sticky-bar{display:none!important}}
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
export const PHONE_SAFETY_CSS = `[data-composition]{box-sizing:border-box;max-width:100%;min-width:0;overflow-x:clip;padding-inline-start:max(0px,env(safe-area-inset-left,0px));padding-inline-end:max(0px,env(safe-area-inset-right,0px))}[data-composition][data-composition] *{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:break-word}[data-composition][data-composition] :is(h1,h2,h3,h4){text-wrap:balance;overflow-wrap:break-word;word-break:normal;hyphens:manual}[data-composition][data-composition] :is(p,span,li,label){overflow-wrap:break-word;word-break:normal}[data-composition][data-composition] img,[data-composition][data-composition] video,[data-composition][data-composition] iframe{max-width:100%;height:auto}@media (max-width:639px){[data-composition][data-composition] [style*="grid-template-columns"]:not([data-mobile-cols]),[data-composition][data-composition] .grid:not([data-mobile-cols]){width:100%!important;max-width:100%!important;grid-template-columns:minmax(0,1fr)!important}[data-composition][data-composition] [data-widget],[data-composition][data-composition] form{width:100%!important;max-width:100%!important}[data-composition][data-composition] h1{font-size:min(2.75rem,11vw)!important;line-height:1.05!important}[data-composition][data-composition] h2{font-size:min(2.25rem,9.5vw)!important;line-height:1.1!important}[data-composition][data-composition] h3{font-size:min(1.6rem,7vw)!important;line-height:1.12!important}[data-composition][data-composition] p,[data-composition][data-composition] li,[data-composition][data-composition] span,[data-composition][data-composition] a,[data-composition][data-composition] small,[data-composition][data-composition] label{font-size:max(14px,1em)!important;line-height:1.45}[data-composition][data-composition] a,[data-composition][data-composition] button{min-height:44px!important}[data-composition][data-composition] a{align-items:center}[data-composition][data-composition] [style*="grid-template-areas"]{grid-template-areas:none!important}[data-composition][data-composition] [style*="grid-area"]{grid-area:auto!important}}`;

const MOTION_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-motion{animation:rv-cn-in .7s ease both}.rv-cn-motion[data-motion=rise]{animation-name:rv-cn-rise}.rv-cn-motion[data-motion=scale]{animation-name:rv-cn-scale}.rv-cn-motion[data-motion=float]{animation:rv-cn-float 6s ease-in-out infinite}.rv-cn-motion[data-motion=slide-left]{animation-name:rv-cn-sl}.rv-cn-motion[data-motion=slide-right]{animation-name:rv-cn-sr}.rv-cn-motion[data-motion=blur]{animation-name:rv-cn-blur}.rv-cn-motion[data-motion=reveal]{animation-name:rv-cn-reveal}.rv-cn-motion[data-motion=custom]{animation-name:rv-cn-custom}}@keyframes rv-cn-custom{from{opacity:var(--rv-o,1);transform:translate(var(--rv-x,0),var(--rv-y,0)) scale(var(--rv-s,1)) rotate(var(--rv-r,0));filter:blur(var(--rv-b,0))}}@keyframes rv-cn-sl{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:none}}@keyframes rv-cn-sr{from{opacity:0;transform:translateX(-32px)}to{opacity:1;transform:none}}@keyframes rv-cn-blur{from{opacity:0;filter:blur(12px)}to{opacity:1;filter:none}}@keyframes rv-cn-reveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}@keyframes rv-cn-in{from{opacity:0}to{opacity:1}}@keyframes rv-cn-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes rv-cn-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@keyframes rv-cn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;

export function CompositionRenderer({ tree, scope, as = "section", resolveHref, resolveMedia, resolveWidget, eagerFirstMedia = false }: { tree: CompositionTree; scope: string; as?: "section" | "div"; resolveHref?: (href: string) => string; resolveMedia?: (ref: string) => ResolvedMedia | null; resolveWidget?: (name: string, presentation?: WidgetPresentation) => ReactNode; eagerFirstMedia?: boolean }) {
  const ctx: Ctx = { rules: [], counter: { n: 0 }, eagerFirstMedia, scope: scope.replace(/[^\w-]/g, "") || "cn", href: resolveHref ?? ((h) => h), media: resolveMedia ?? (() => null), widget: resolveWidget ?? (() => null) };
  const body = renderNode(tree.root, ctx, "root");
  // The shared rules are identical for every section. They used to be
  // repeated inline in each one (several KB per section, re-parsed by the
  // browser every time); React now hoists one copy into <head>. Only the
  // section's own responsive/hover rules stay inline, after the shared ones.
  const shared = (
    <style href="rv-cn-shared" precedence="rv-cn">
      {MOTION_CSS + MARQUEE_CSS + INTERACTIVE_CSS + PHONE_SAFETY_CSS}
    </style>
  );
  const own = ctx.rules.length ? <style>{ctx.rules.join("")}</style> : null;
  return (
    as === "div" ? (
      <div data-composition={tree.label ?? "composition"}>
        {shared}
        {own}
        {body}
      </div>
    ) : (
      <section data-composition={tree.label ?? "composition"}>
        {shared}
        {own}
        {body}
      </section>
    )
  );
}
