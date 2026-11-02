import type { CSSProperties } from "react";
import {
  WORDMARK_SHAPES,
  cleanBusinessName,
  estimateTextWidth,
  wordmarkInitials,
  wordmarkLines,
  wordmarkShape,
} from "@/lib/site-wordmark";

const MARK = 36;
const GAP = 10;
const HEIGHT = 40;

/**
 * Inline SVG wordmark for a generated site with no uploaded logo: a monogram
 * mark plus the business name in the site's heading font. Colours come from the
 * site's own palette variables (the mark pairs --primary with its
 * --primary-foreground; the name uses the surrounding text colour), so contrast
 * is whatever the site theme already guarantees. Built from React elements only.
 */
export function SiteWordmark(props: {
  name: string;
  trade?: string | null | undefined;
  /** "mark" is the monogram alone, for favicon-sized spots. */
  variant?: "lockup" | "mark";
  /** Rendered height in px; width follows the artwork. */
  height?: number;
  className?: string;
}) {
  const label = cleanBusinessName(props.name) || "Business";
  const initials = wordmarkInitials(props.name);
  const shape = WORDMARK_SHAPES[wordmarkShape(props.name, props.trade)];
  const markOnly = props.variant === "mark";
  const { lines, fontSize } = wordmarkLines(props.name);
  const textWidth = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize)));
  const width = markOnly ? MARK : MARK + GAP + textWidth;
  const height = props.height ?? 36;
  const letterSize = Array.from(initials).length > 1 ? 15 : 19;
  const markFill: CSSProperties = { fill: "var(--primary, #1f2937)" };
  const markInk: CSSProperties = { fill: "var(--primary-foreground, #ffffff)", fontFamily: "var(--font-display, inherit)" };
  const textStyle: CSSProperties = { fill: "currentColor", fontFamily: "var(--font-display, inherit)" };
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="site-wordmark"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={Math.round((width / HEIGHT) * height)}
      height={height}
      className={props.className}
      style={{ maxWidth: "100%", display: "block" }}
      focusable="false"
    >
      <title>{label}</title>
      <g transform={`translate(0 ${(HEIGHT - MARK) / 2})`}>
        <path d={shape} style={markFill} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} />
        <text x={MARK / 2} y={MARK / 2} dy=".35em" textAnchor="middle" fontSize={letterSize} fontWeight={700} style={markInk}>
          {initials}
        </text>
      </g>
      {markOnly
        ? null
        : lines.map((line, index) => (
            <text
              key={index}
              x={MARK + GAP}
              y={lines.length === 1 ? 26 : index === 0 ? 17 : 33}
              fontSize={fontSize}
              fontWeight={600}
              textLength={estimateTextWidth(line, fontSize)}
              lengthAdjust="spacingAndGlyphs"
              style={textStyle}
            >
              {line}
            </text>
          ))}
    </svg>
  );
}
