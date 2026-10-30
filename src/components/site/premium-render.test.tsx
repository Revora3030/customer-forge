import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { PREMIUM_CSS } from "./premium-css";
import { validateComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { auditPageDesign, needsDesignRepair } from "@/lib/builder/design-quality";
import { readActions } from "@/lib/site-agent";

const ref = (n: number) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`;
const tree = (root: CompositionNode): CompositionTree => ({ version: 1, root } as CompositionTree);
const resolve = (visual: Record<string, unknown> = { source: "customer", width: 6000, height: 3000 }) => (r: string) => ({ url: `https://img.example.test/${r}.jpg`, visual: visual as never });
const render = (root: CompositionNode, visual?: Record<string, unknown>) =>
  renderToStaticMarkup(<CompositionRenderer tree={tree(root)} scope="s-test" resolveMedia={resolve(visual)} />);
const markup = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");

const shader: CompositionNode = {
  type: "shader_field", shader: "grain", style: { background: "#0b0d12", gradientTo: "#2f6bff" },
  children: [{ type: "heading", level: 1, text: "Roofs that last.", motion: { kind: "split" } } as CompositionNode, { type: "button", text: "Get a quote", href: "/quote" }],
} as CompositionNode;
const tour: CompositionNode = { type: "tour_360", text: "Walk the showroom", children: [{ type: "media", mediaRef: ref(1), alt: "Showroom floor", text: "Showroom" }] } as CompositionNode;
const building: CompositionNode = { type: "building_explorer", text: "The tower", floors: [{ label: "Lobby" }, { label: "Sky lounge", body: "Level 30" }] } as CompositionNode;

describe("validator", () => {
  it("accepts the three premium blocks", () => {
    expect(validateComposition(tree(shader)).ok).toBe(true);
    expect(validateComposition(tree(tour), { allowedMediaRefs: new Set([ref(1)]), panoramaRefs: new Set([ref(1)]) }).ok).toBe(true);
    expect(validateComposition(tree(building)).ok).toBe(true);
  });
  it("rejects an unknown shader, a shader holding a tour, and an ordinary picture in a tour", () => {
    expect(validateComposition(tree({ ...shader, shader: "plasma" } as never)).ok).toBe(false);
    expect(validateComposition(tree({ ...shader, children: [tour] } as CompositionNode)).ok).toBe(false);
    expect(validateComposition(tree(tour), { allowedMediaRefs: new Set([ref(1)]), panoramaRefs: new Set() }).ok).toBe(false);
    expect(validateComposition(tree({ ...building, floors: [{ label: "One" }] } as never)).ok).toBe(false);
  });
});

describe("design-quality gate", () => {
  const section = (id: string, root: CompositionNode) => ({ id, role: "content", tree: tree(root) });
  it("flags a second shader_field and sends it back for repair", () => {
    const out = auditPageDesign([section("a", shader), section("b", shader)]);
    const finding = out["b"]?.find((f) => f.code === "too_many_heavy_effects");
    expect(finding).toBeDefined();
    expect(needsDesignRepair([finding!])).toBe(true);
    expect(out["a"]?.some((f) => f.code === "too_many_heavy_effects") ?? false).toBe(false);
  });
  it("flags text that disappears into part of the shader's colours", () => {
    const dim = { ...shader, children: [{ type: "heading", level: 2, text: "Hidden", style: { color: "#2a2f3a" } }] } as CompositionNode;
    const out = auditPageDesign([section("a", dim)]);
    expect(out["a"]?.some((f) => f.code === "shader_text_contrast")).toBe(true);
    const fine = { ...shader, children: [{ type: "heading", level: 2, text: "Seen", style: { color: "#ffffff" } }] } as CompositionNode;
    expect(auditPageDesign([section("a", fine)])["a"]?.some((f) => f.code === "shader_text_contrast") ?? false).toBe(false);
  });
});

describe("site agent set_premium_fx", () => {
  const known = { pageIds: new Set<string>(), sectionIds: new Set<string>(), componentIds: new Set<string>() };
  it("reads the switch and a cleaned label, and drops junk", () => {
    expect(readActions([{ type: "set_premium_fx", enabled: false }], known)).toEqual([{ type: "set_premium_fx", enabled: false }]);
    expect(readActions([{ type: "set_premium_fx", meterLabel: " Clean " }], known)).toEqual([{ type: "set_premium_fx", meterLabel: "clean" }]);
    expect(readActions([{ type: "set_premium_fx", meterLabel: null }], known)).toEqual([{ type: "set_premium_fx", meterLabel: null }]);
    expect(readActions([{ type: "set_premium_fx", meterLabel: "<b>x</b>" }], known)).toEqual([]);
  });
});

describe("server markup and fallbacks", () => {
  it("shader_field renders its copy over a CSS still, with no canvas on the server", () => {
    const html = markup(render(shader));
    expect(html).toContain("rv-shader");
    expect(html).toContain("Get a quote");
    expect(html).not.toContain("<canvas");
  });
  it("split headings keep the full text for screen readers and hide the word spans", () => {
    const html = markup(render(shader));
    expect(html).toMatch(/class="rv-sr-only">Roofs that last\.</);
    expect(html).toMatch(/aria-hidden="true" data-split="(load|view)"/);
    expect(html).toContain("rv-cn-w");
  });
  it("tour_360 shows the panorama as a still poster until tapped", () => {
    const html = markup(render(tour));
    expect(html).toContain("rv-tour-poster");
    expect(html).toContain('alt="Showroom floor"');
    expect(html).not.toContain("<canvas");
  });
  it("tour_360 never shows AI-made, stock or clearly non-panoramic pictures", () => {
    expect(markup(render(tour, { source: "generated" }))).not.toContain("rv-tour");
    expect(markup(render(tour, { source: "customer", width: 1600, height: 1200 }))).not.toContain("rv-tour");
  });
  it("building_explorer lists every floor as plain accessible content", () => {
    const html = markup(render(building));
    expect(html).toContain("rv-building");
    expect(html).toContain("Lobby");
    expect(html).toContain("Sky lounge");
    expect(html).not.toContain("<canvas");
  });
  it("premium CSS honours reduced motion", () => {
    expect(PREMIUM_CSS).toContain("prefers-reduced-motion");
  });
});
