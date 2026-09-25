/**
 * Firewall for the architecture clean-up: customer-site creative decisions
 * come only from the AI. These tests fail if a deterministic author returns.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE_WIDE_CREATIVE_QUALITY_MATRIX } from "@/lib/builder/creative-quality-matrix";
import { effectForKind, parseAuthoredDirection, readSectionEffects } from "@/lib/authored-direction";
import { siteThemeStyle } from "@/lib/site-theme";
import { proposeUpgrades } from "@/lib/auto-upgrade";
import { backdropLayerCss, safeBackdropSpec } from "@/lib/site-effects";

const src = (path: string) => readFileSync(path, "utf8");

describe("creative clean-up firewall", () => {
  it("the site-wide standard holds only truth, accessibility and device widths", () => {
    expect(Object.keys(SITE_WIDE_CREATIVE_QUALITY_MATRIX).sort()).toEqual(
      ["accessibility", "responsiveWidths", "truth", "version"].sort(),
    );
  });

  it("section motion comes from the AI per type, with no built-in grouping", () => {
    const direction = parseAuthoredDirection({
      name: "Tidewater",
      primary: "#123456",
      secondary: "#fafafa",
      accent: "#aa5500",
      font: "Fraunces",
      sectionEffects: { hero: "tilt_3d", pricing_matrix: "glass" },
      defaultEffect: "none",
    })!;
    expect(effectForKind(direction, "hero")).toBe("tilt_3d");
    expect(effectForKind(direction, "pricing_matrix")).toBe("glass");
    // An AI-invented type the AI didn't list is not lumped with "cta" or "hero".
    expect(effectForKind(direction, "cta")).toBe("none");
  });

  it("an effect the AI did not name is none, never a house default", () => {
    expect(readSectionEffects({}).defaultEffect).toBe("none");
    expect(src("src/lib/builder/ai-brand-identity.server.ts")).not.toMatch(/:\s*"rise"/);
  });

  it("the AI can compose its own background, bounded only for safety", () => {
    const spec = safeBackdropSpec({
      layers: [{ shape: "conic", colors: ["#112233", "#445566", "#778899"], angle: 30, x: 20, y: 80, size: 300, opacity: 50 }],
      drift: "slow",
    })!;
    expect(spec.layers[0]!.shape).toBe("conic");
    expect(backdropLayerCss(spec.layers[0]!)).toContain("conic-gradient");
    expect(safeBackdropSpec({ layers: [{ colors: ["url(javascript:x)"] }] })).toBeNull();
  });

  it("a site with no authored colours is neutral, never Revora gold", () => {
    const vars = siteThemeStyle({}) as Record<string, string>;
    expect(vars["--background"]).toBe("#ffffff");
    expect(JSON.stringify(vars).toLowerCase()).not.toMatch(/#d4af37|#c9a227|gold/);
  });

  it("site-review suggestions never pre-write search titles or pick sections", () => {
    const proposals = proposeUpgrades(
      [
        { upgrade: "page_seo", pageId: "p1", scope: "Services", max: 4, points: 0, detail: "" },
        { upgrade: "add_faq_section", pageId: "p1", scope: "Services", max: 3, points: 0, detail: "" },
      ] as never,
      {
        goal: "quotes",
        copyHeadline: null,
        copyMetaDescription: null,
        copyPrimaryCta: null,
        headline: "x",
        metaDescription: "y",
        primaryCtaLabel: "z",
        publishState: "published",
        pages: [{ id: "p1", title: "Services", slug: "services", seo_title: null, seo_description: null, noindex: false }],
        businessName: "Acme",
        city: "Austin",
      } as never,
    );
    for (const p of proposals) {
      expect(p.seoPatch).toBeUndefined();
      expect(p.sectionKind).toBeUndefined();
      expect(JSON.stringify(p)).not.toContain("| Acme");
    }
  });

  it("picture requests are not keyword-routed to fixed sections", () => {
    const code = src("src/lib/site-agent.functions.ts");
    expect(code).not.toContain("pictureActionsFor");
    expect(code).not.toContain("requestsPictureWork");
  });
});
