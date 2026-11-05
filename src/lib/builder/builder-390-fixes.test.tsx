import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { LAYOUT_SAFETY_CSS } from "@/components/site/layout-safety-css";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";
import { PREMIUM_CSS } from "@/components/site/premium/premium-css";
import { widgetPresentationStyle } from "@/components/site/contact-details-utils";
import { serviceMenuItems } from "@/components/site/live-blocks-utils";
import { validateComposition } from "@/lib/builder/composition-tree";
import { fullAddress } from "@/lib/builder/premium-mobile-template";
import { isStateAbbreviation, normalizeStateAbbreviations, smartIntakeValue, smartList, smartName } from "@/lib/intake-smart";
import { contrastRatio } from "@/lib/readable-color";

const themed = (muted: string) => ({
  version: 1,
  root: {
    type: "stack",
    children: [{
      type: "widget",
      text: "enquiry_form",
      widgetPresentation: { theme: { surface: "#1b2420", text: "#f4f1ea", muted, border: "#3a4640", action: "#d9f25a", actionText: "#101410" } },
    }],
  },
});
const html = (tree: unknown, keepStyle = false) => {
  const result = validateComposition(tree, { allowedMediaRefs: new Set(), lenient: true } as never);
  const ok = (result as { ok: boolean; tree?: unknown }).tree ?? (tree as never);
  const out = renderToStaticMarkup(<CompositionRenderer tree={ok as never} scope="t" resolveWidget={() => <span>w</span>} />);
  return keepStyle ? out : out.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
};

describe("builder 390: state abbreviations stay upper case", () => {
  it("smartName / smartList keep NC after a comma", () => {
    expect(smartName("raleigh, nc")).toBe("Raleigh, NC");
    expect(smartName("RALEIGH, NC")).toBe("Raleigh, NC");
    expect(smartIntakeValue("city", "durham, nc")).toBe("Durham, NC");
    expect(smartList("raleigh, nc, durham, nc")).toBe("Raleigh, NC, Durham");
  });
  it("does not capitalise real words as states", () => {
    expect(smartName("fuquay varina")).toBe("Fuquay Varina");
    expect(smartName("salt and pepper")).toBe("Salt and Pepper");
    expect(isStateAbbreviation("nc")).toBe(true);
    expect(isStateAbbreviation("xx")).toBe(false);
  });
  it("repairs already stored 'Raleigh, Nc' on location fields only", () => {
    expect(normalizeStateAbbreviations("Raleigh, Nc")).toBe("Raleigh, NC");
    expect(normalizeStateAbbreviations("Cary, nc 27511")).toBe("Cary, NC 27511");
    expect(normalizeStateAbbreviations("Raleigh, Nc, Durham, Nc")).toBe("Raleigh, NC, Durham, NC");
    expect(normalizeStateAbbreviations("Fuquay-Varina, North Carolina")).toBe("Fuquay-Varina, North Carolina");
    expect(fullAddress({ address: "1 Main St", city: "Raleigh", state: "Nc", zip: "27601" })).toBe("1 Main St, Raleigh, NC 27601");
  });
});

describe("builder 390: no empty Services rows", () => {
  it("drops a lone qualifier row with nothing behind it, keeps real and priced rows", () => {
    const items = serviceMenuItems([
      { id: "2", name: "Interior detail", sort_order: 0 },
      { id: "3", name: "Wash", price: 40, sort_order: 1 },
      { id: "1", name: "Premium", sort_order: 2 },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Interior detail", "Wash"]);
    const priced = serviceMenuItems([{ id: "p", name: "Premium", price: 99, sort_order: 0 }]);
    expect(priced.map((i) => i.name)).toEqual(["Premium"]);
    expect(serviceMenuItems([{ id: "x", name: "Complete" }])).toEqual([]);
  });
  it("an empty text block or card renders nothing", () => {
    const out = html({ version: 1, root: { type: "stack", children: [{ type: "heading", level: 2, text: "Services" }, { type: "card", children: [{ type: "text", text: "   " }] }, { type: "text", text: "Hello there" }] } });
    expect(out).toContain("Hello there");
    expect(out).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(out).not.toContain("data-rv-card");
  });
});

describe("builder 390: sticky chrome never covers content", () => {
  it("phone page leaves room for the bar plus safe area; the scroll port too", () => {
    expect(LAYOUT_SAFETY_CSS).toMatch(/body[^{]*\{padding-bottom:calc\(max\(var\(--rv-sticky-height,84px\),84px\) \+ 16px \+ env\(safe-area-inset-bottom/);
    expect(LAYOUT_SAFETY_CSS).toContain("html[data-rv-sticky-bar]");
    expect(LAYOUT_SAFETY_CSS).toMatch(/scroll-padding-bottom:calc\(var\(--rv-sticky-height,72px\)/);
    expect(CINEMATIC_CSS).toContain("body{padding-bottom");
  });
  it("sticky header offsets anchors and scroll targets (shared sheet and premium)", () => {
    expect(LAYOUT_SAFETY_CSS).toContain("html:has(.pm-header,.rv-site-header){scroll-padding-top:calc(var(--rv-header-height,72px) + 8px)}");
    expect(PREMIUM_CSS.split("html:has(.pm-header,.rv-site-header){scroll-padding-top").length).toBe(2);
  });
  it("the shared sheet carries the safety rules", () => {
    expect(html({ version: 1, root: { type: "stack", children: [{ type: "text", text: "x" }] } }, true)).toContain("scroll-padding-top");
  });
});

describe("builder 390: form helper text and fields meet 4.5:1", () => {
  it("a pale muted ink is pulled to AA on the widget surface", () => {
    const vars = widgetPresentationStyle({ theme: { surface: "#1b2420", text: "#f4f1ea", muted: "#2c3631" } } as never) as Record<string, string>;
    expect(contrastRatio(vars["--muted-foreground"]!, "#1b2420")!).toBeGreaterThanOrEqual(4.5);
    const ok = widgetPresentationStyle({ theme: { surface: "#1b2420", text: "#f4f1ea", muted: "#b8c2bc" } } as never) as Record<string, string>;
    expect(ok["--muted-foreground"]).toBe("#b8c2bc");
  });
  it("the renderer applies the same clamp", () => {
    const out = html(themed("#2c3631"), true);
    const muted = /--muted-foreground:(#[0-9a-fA-F]{6})/.exec(out)?.[1];
    expect(muted).toBeTruthy();
    expect(contrastRatio(muted!, "#1b2420")!).toBeGreaterThanOrEqual(4.5);
  });
  it("the builder rejects a muted ink below 4.5:1 and prompts for it", () => {
    const bad = validateComposition(themed("#2c3631"), { allowedMediaRefs: new Set() });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify((bad as { issues: unknown }).issues)).toContain("muted/helper text contrast");
    const good = validateComposition(themed("#b8c2bc"), { allowedMediaRefs: new Set() });
    expect(good.ok).toBe(true);
  });
  it("studio form fields are lifted off near-black with readable placeholder and helper text", () => {
    expect(CINEMATIC_CSS).toContain('[role="combobox"]{background:rgba(255,255,255,.07)');
    expect(CINEMATIC_CSS).toContain("::placeholder{color:rgba(244,241,234,.68)");
    expect(CINEMATIC_CSS).toContain("text-muted-foreground");
    expect(LAYOUT_SAFETY_CSS).toContain("::placeholder");
  });
});

describe("builder 390: About hero text over a photo", () => {
  const css = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
  const scrim = (css.match(/\.rv-hero-grid::after \{[\s\S]*?\n\}/g) ?? []).join("\n");
  it("desktop scrim stays dark across the copy and a phone gets an even dark layer", () => {
    expect(scrim).toContain("var(--site-hero-scrim) 74%");
    expect(scrim).toContain("var(--site-hero-scrim) 78%");
    expect(css).toMatch(/\.rv-hero-grid::after \{\s*background:\s*linear-gradient\(0deg, color-mix\(in srgb, var\(--site-hero-scrim\) 90%/);
  });
  it("hero ink over the weakest scrim layer is at least 4.5:1 even on a white photo", () => {
    // 78% of oklch(0.08) near-black (~#0a0b0e) over white, then the muted hero ink (~#c9cbc4).
    const over = Math.round(0.78 * 10 + 0.22 * 255);
    const bg = `#${over.toString(16).padStart(2, "0").repeat(3)}`;
    expect(contrastRatio("#c9cbc4", bg)!).toBeGreaterThanOrEqual(4.5);
  });
});
