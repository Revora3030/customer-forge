import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const card = (t: string): CompositionNode => ({ type: "card", children: [{ type: "heading", level: 3, text: t }] });
const root: CompositionNode = { type: "stack", children: [{ type: "grid", children: [card("One"), card("Two")] }] };
const html = renderToStaticMarkup(<CompositionRenderer tree={{ version: 1, root } as CompositionTree} scope="s-test" />);
const css = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
const fallbackStart = css.indexOf("@supports not (animation-timeline:view())");
const fallbackEndMarker = "calc(var(--rv-i,0)*60ms)}}}";
const fallback = css.slice(fallbackStart, css.indexOf(fallbackEndMarker, fallbackStart) + fallbackEndMarker.length);

describe("scroll-reveal fallback CSS", () => {
  it("only exists for browsers without view() timelines, and only when motion is allowed", () => {
    expect(fallback.startsWith("@supports not (animation-timeline:view())")).toBe(true);
    expect(fallback).toContain("@media (prefers-reduced-motion:no-preference)");
    // Every rule that moves anything sits inside the reduced-motion media query.
    expect(fallback.indexOf(".rv-cn-auto[data-rv-wait]")).toBeGreaterThan(fallback.indexOf("@media"));
  });

  it("is transform-only: content is never faded or hidden", () => {
    expect(fallback).not.toMatch(/opacity|visibility|display\s*:\s*none/);
    expect(fallback).toContain("[data-rv-wait]{transform:translateY(16px)}");
  });

  it("uses the shared motion tokens with fallbacks", () => {
    expect(fallback).toContain("var(--motion-duration-slower,600ms)");
    expect(fallback).toContain("var(--motion-ease-out,cubic-bezier(.22,1,.36,1))");
  });

  it("leaves server-rendered content untouched: no wait or hidden state in the markup", () => {
    const body = html.slice(html.lastIndexOf("</style>"));
    expect(body).not.toContain("data-rv-wait");
    expect(body).not.toContain("data-rv-go");
    expect(body).toContain("One");
    expect(body).toContain("Two");
  });
});
