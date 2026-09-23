import type { CSSProperties, ReactNode } from "react";
import type { Breakpoint, CompositionNode, CompositionTree, NodeStyle } from "@/lib/builder/composition-tree";

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
  if (style.letterSpacing != null) css.letterSpacing = `${style.letterSpacing}em`;
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
  if (style.minHeight != null) css.minHeight = style.minHeight;
  if (style.hidden) css.display = "none";
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

type Ctx = { rules: string[]; counter: { n: number }; scope: string };

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
    style: motion?.delayMs ? { ...style, animationDelay: `${motion.delayMs}ms` } : style,
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
      return node.src ? <img key={key} {...props} src={node.src} alt={node.alt ?? ""} loading="lazy" style={{ objectFit: "cover", width: "100%", ...props.style }} /> : null;
    case "button":
    case "link":
      return <a key={key} {...props} href={node.href}>{node.text}{kids}</a>;
    case "list":
      return <ul key={key} {...props}>{node.items?.map((item, i) => <li key={i}>{item}</li>)}</ul>;
    case "divider":
      return <hr key={key} {...props} />;
    case "icon":
      return <span key={key} aria-hidden="true" {...props}>{node.text}</span>;
    case "card":
      return <article key={key} {...props}>{kids}</article>;
    default:
      return <div key={key} {...props}>{node.text ? <span>{node.text}</span> : null}{kids}</div>;
  }
}

const MOTION_CSS = `@media (prefers-reduced-motion: no-preference){.rv-cn-motion{animation:rv-cn-in .7s ease both}.rv-cn-motion[data-motion=rise]{animation-name:rv-cn-rise}.rv-cn-motion[data-motion=scale]{animation-name:rv-cn-scale}.rv-cn-motion[data-motion=float]{animation:rv-cn-float 6s ease-in-out infinite}}@keyframes rv-cn-in{from{opacity:0}to{opacity:1}}@keyframes rv-cn-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes rv-cn-scale{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@keyframes rv-cn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`;

export function CompositionRenderer({ tree, scope }: { tree: CompositionTree; scope: string }) {
  const ctx: Ctx = { rules: [], counter: { n: 0 }, scope: scope.replace(/[^\w-]/g, "") || "cn" };
  const body = renderNode(tree.root, ctx, "root");
  return (
    <section data-composition={tree.label ?? "composition"}>
      <style>{MOTION_CSS + ctx.rules.join("")}</style>
      {body}
    </section>
  );
}
