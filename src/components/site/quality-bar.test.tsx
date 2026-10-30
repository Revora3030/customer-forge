import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { CountUpText, RollingNumber } from "./CountUp";
import { SiteScrollProgress } from "./SiteScrollProgress";
import { SCROLL_PROGRESS_CSS, scrollShare } from "@/lib/site-scroll-progress";
import { CINEMATIC_CSS } from "./cinematic-css";
import { estimateTotal, estimatorOptions } from "./live-blocks-utils";
import { PRIMITIVE_GUIDE, validateComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { dialLevelForPoint, dialOptionForLevel, dialOptionForPoint } from "@/lib/builder/cinematic-primitives";
import { currency } from "@/lib/format";

const render = (root: CompositionNode, editable = false) =>
  renderToStaticMarkup(<CompositionRenderer tree={{ version: 1, root } as CompositionTree} scope="qb" editable={editable} />);
// Drop <style>…</style> blocks by index scanning (no regex sanitizer; test-only markup helper).
const markup = (html: string) => {
  let out = "";
  let rest = html;
  for (;;) {
    const start = rest.toLowerCase().indexOf("<style");
    if (start === -1) return out + rest;
    out += rest.slice(0, start);
    const end = rest.toLowerCase().indexOf("</style>", start);
    if (end === -1) return out;
    rest = rest.slice(end + "</style>".length);
  }
};

describe("count-up stats (quality bar #20)", () => {
  it("accepts countUp only on a heading/text holding one real figure", () => {
    expect(validateComposition({ version: 1, root: { type: "heading", level: 2, text: "500+", countUp: true } }).ok).toBe(true);
    expect(validateComposition({ version: 1, root: { type: "text", text: "4.9★", countUp: true } }).ok).toBe(true);
    expect(validateComposition({ version: 1, root: { type: "text", text: "Since 1998", countUp: true } }).ok).toBe(false);
    expect(validateComposition({ version: 1, root: { type: "text", text: "We love clean cars", countUp: true } }).ok).toBe(false);
    expect(validateComposition({ version: 1, root: { type: "button", text: "500", href: "/book", countUp: true } }).ok).toBe(false);
    expect(validateComposition({ version: 1, root: { type: "text", text: "500", countUp: "yes" } }).ok).toBe(false);
  });

  it("server-renders the exact authored figure, marked for the count-up", () => {
    const html = markup(render({ type: "heading", level: 2, text: "1,200+", countUp: true }));
    expect(html).toContain('data-count-up=""');
    expect(html).toContain(">1,200+<");
    expect(html).not.toContain(">0+<");
  });

  it("leaves plain text alone and never animates inside the editor", () => {
    expect(markup(render({ type: "text", text: "500+" }))).not.toContain("data-count-up");
    expect(markup(render({ type: "text", text: "500+", countUp: true }, true))).not.toContain("data-count-up");
    expect(renderToStaticMarkup(<CountUpText text="Call us today" />)).toBe("Call us today");
  });

  it("is taught to the AI as figures-only", () => {
    expect(PRIMITIVE_GUIDE).toContain("countUp:true");
    expect(PRIMITIVE_GUIDE).toMatch(/never a year or an invented number/);
  });
});

describe("rolling totals (quality bar #16)", () => {
  it("server-renders the exact final value", () => {
    expect(renderToStaticMarkup(<RollingNumber value={1240} format={currency} />)).toBe(currency(1240));
  });
  it("exposes the summed amount and From flag for the estimator's rolling total", () => {
    const options = estimatorOptions([
      { id: "a", name: "Wash", price: 120 },
      { id: "b", name: "Correction", starting_price: 400 },
    ]);
    expect(estimateTotal(options, new Set(["a"]))).toMatchObject({ amount: 120, from: false });
    expect(estimateTotal(options, new Set(["a", "b"]))).toMatchObject({ amount: 520, from: true });
    expect(estimateTotal(options, new Set())).toMatchObject({ amount: null });
  });
});

describe("page progress bar (quality bar #13)", () => {
  it("renders a decorative fixed bar in the site accent", () => {
    const html = renderToStaticMarkup(<SiteScrollProgress />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("rv-progress");
    expect(SCROLL_PROGRESS_CSS).toContain("position:fixed");
    expect(SCROLL_PROGRESS_CSS).toContain("pointer-events:none");
    expect(SCROLL_PROGRESS_CSS).toContain("var(--primary");
    expect(SCROLL_PROGRESS_CSS).toContain("animation-timeline:scroll(root block)");
    expect(SCROLL_PROGRESS_CSS).toMatch(/prefers-reduced-motion:reduce\)\{\.rv-progress\{display:none/);
  });
  it("computes the scrolled share safely", () => {
    expect(scrollShare(0, 3000, 1000)).toBe(0);
    expect(scrollShare(1000, 3000, 1000)).toBe(0.5);
    expect(scrollShare(5000, 3000, 1000)).toBe(1);
    expect(scrollShare(10, 800, 1000)).toBe(0);
  });
});

describe("chapter snap (quality bar #8)", () => {
  it("snaps scroll_chapters gently, and only for visitors without reduced motion", () => {
    expect(CINEMATIC_CSS).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{\nhtml:has\(\.rv-site-root \.rv-chapters\)\{scroll-snap-type:y proximity\}/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-chapters > \.rv-chapter\{scroll-snap-align:start/);
    expect(CINEMATIC_CSS).not.toContain("scroll-snap-type:y mandatory");
  });
});

describe("custom controls (quality bar #1/#15)", () => {
  it("draws the package fader's own track and thumb", () => {
    expect(CINEMATIC_CSS).toMatch(/\.rv-tier-range\{[^}]*appearance:none/);
    expect(CINEMATIC_CSS).toContain(".rv-tier-range::-webkit-slider-thumb");
    expect(CINEMATIC_CSS).toContain(".rv-tier-range::-moz-range-thumb");
    expect(CINEMATIC_CSS).toContain("var(--rv-tier-fill,0%)");
  });
  it("turns the dial from a point on the gauge", () => {
    expect(dialLevelForPoint(0, -40)).toBe(50); // straight up
    expect(dialLevelForPoint(-40, 0)).toBe(12.5); // left: -90deg
    expect(dialLevelForPoint(40, 0)).toBe(87.5); // right: +90deg
    expect(dialLevelForPoint(-1, 40)).toBe(0); // bottom gap clamps to the near end
    expect(dialLevelForPoint(1, 40)).toBe(100);
    expect(dialLevelForPoint(2, 2)).toBeNull(); // hub dead zone
    expect(dialOptionForLevel(60, [0, 50, 100])).toBe(1);
    expect(dialOptionForLevel(60, [])).toBeNull();
    expect(dialOptionForPoint(40, 0, [10, 40, 90])).toBe(2);
  });
});
