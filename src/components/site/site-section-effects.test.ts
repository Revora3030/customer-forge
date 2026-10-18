import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SECTION_EFFECT_IDS, sectionFxClassName } from "@/lib/site-effects";

// The section renderer only needs the public lead/track functions as stubs here.
vi.mock("@/lib/public-site.functions", () => ({ submitPublicLead: vi.fn(), trackPublicEvent: vi.fn() }));

const { SiteSection } = await import("@/components/site/SiteSections");

const site = {
  org: { id: "org", slug: "acme", name: "Acme" },
  profile: null,
  content: { sections: [] },
} as never;

const section = (effect: string) => ({
  id: "sec-1",
  kind: "composition",
  heading: null,
  subheading: null,
  body: null,
  components: [],
  settings: { effect, composition: { version: 1, root: { type: "text", text: "Hello" } } },
}) as never;

describe("AI-authored section effects are drawn", () => {
  it("puts the effect class on the section wrapper", () => {
    const html = renderToStaticMarkup(createElement(SiteSection, { site, section: section("float_3d") }));
    expect(html).toContain("rv-fx-float_3d");
  });

  it("adds nothing for the standard look", () => {
    const html = renderToStaticMarkup(createElement(SiteSection, { site, section: section("none") }));
    expect(html).not.toContain("rv-fx-");
    expect(sectionFxClassName("none")).toBe("");
  });

  it("keeps every movement behind prefers-reduced-motion: no-preference", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const start = css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .rv-fx-float_3d");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("@keyframes rv-fx-float", start));
    for (const id of ["float_3d", "tilt_3d", "rise", "parallax_slow"]) expect(block).toContain(`.rv-fx-${id}`);
    // The class never appears outside that block (except its keyframes).
    const outside = css.slice(0, start) + css.slice(css.indexOf("@keyframes rv-fx-float", start));
    expect(outside).not.toMatch(/\.rv-fx-float_3d/);
    expect(outside).not.toMatch(/\.rv-fx-(tilt_3d|rise|parallax_slow)/);
    // Every AI effect id has a rendering.
    for (const id of SECTION_EFFECT_IDS) expect(css).toContain(`.rv-fx-${id}`);
  });

  it("no longer claims the effects are not drawn", () => {
    expect(readFileSync("src/components/site/SiteSections.tsx", "utf8")).not.toContain("old named effects are no longer drawn");
  });
});
