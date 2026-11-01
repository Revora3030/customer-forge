import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import {
  healLightNode,
  lightSectionColor,
  prepareStudioPage,
  studioLightPalette,
  studioLightVars,
} from "@/lib/builder/studio-canvas";
import { DARK_TO_LIGHT_BLUEPRINTS, TRADE_BLUEPRINTS, blueprintForKey, blueprintLookNote } from "@/lib/builder/trade-blueprints";
import { luminance } from "@/lib/site-theme";

const hero: CompositionNode = { type: "scene", children: [{ type: "media", mediaRef: "m1", alt: "Villa at dusk" }, { type: "heading", text: "Stay", level: 1 }] };
const lightBand: CompositionNode = { type: "stack", style: { background: "#f4efe6", color: "#1a1a1a" }, children: [{ type: "text", text: "About" }] };
const darkBand: CompositionNode = { type: "stack", style: { background: "#101010", color: "#f5f5f5" }, children: [{ type: "text", text: "Services" }] };

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("studio transition archetype setting (#22)", () => {
  it("is explicit on every blueprint", () => {
    for (const blueprint of TRADE_BLUEPRINTS) expect(["dark-to-light", "dark-only"]).toContain(blueprint.studioTransition);
  });

  it("gives the Veyra hand-off only to the listed archetypes; WASH / Car Vault stay dark-only", () => {
    const handOff = TRADE_BLUEPRINTS.filter((b) => b.studioTransition === "dark-to-light").map((b) => b.key).sort();
    expect(handOff).toEqual([...DARK_TO_LIGHT_BLUEPRINTS].sort());
    expect(handOff).toEqual(["dentist", "landscaping", "law-firms", "real-estate"]);
    expect(blueprintForKey("pressure-washing")?.studioTransition).toBe("dark-only");
    expect(blueprintForKey("auto-detailing")?.studioTransition).toBe("dark-only");
    for (const b of TRADE_BLUEPRINTS) if (b.tone === "light") expect(b.studioTransition).toBe("dark-only");
  });

  it("every dark-to-light archetype has an AA light palette", () => {
    for (const key of DARK_TO_LIGHT_BLUEPRINTS) {
      const blueprint = blueprintForKey(key)!;
      const light = studioLightPalette(blueprint.palette);
      expect(light, key).not.toBeNull();
      expect(contrast(light!.canvas, light!.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light!.canvas, light!.muted)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("refuses a light palette that would fail AA", () => {
    expect(studioLightPalette({ canvas: "#0a0d10", surface: "#777777", ink: "#f4f1ea", muted: "#999999" })).toBeNull();
    expect(studioLightPalette({ canvas: "#0a0d10", surface: "#12161a", ink: "#8a8a8a", muted: "#999999" })).toBeNull();
  });

  it("the look note tells the design team about the hand-off", () => {
    expect(blueprintLookNote(blueprintForKey("real-estate"))).toContain("single intentional dark-to-light hand-off");
    expect(blueprintLookNote(blueprintForKey("pressure-washing"))).toContain("no light bands");
  });
});

describe("prepareStudioPage with dark-to-light (#22)", () => {
  const light = studioLightPalette(blueprintForKey("real-estate")!.palette)!;

  it("dark-only (default) still forces every section dark", () => {
    const page = prepareStudioPage([hero, lightBand], true);
    expect(page.lightFrom).toBeNull();
    expect(page.roots[1]?.style?.background).toBeUndefined();
  });

  it("keeps the dark hero and lets the rest sit on one light canvas", () => {
    const page = prepareStudioPage([hero, lightBand, darkBand], true, "dark-to-light", light);
    expect(page.lightFrom).toBe(1);
    expect(page.roots[0]?.type).toBe("scene");
    expect(page.roots[1]?.style?.background).toBe("#f4efe6");
    // A dark band after the hand-off is pulled onto the light canvas: never back to dark.
    expect(page.roots[2]?.style?.background).toBeUndefined();
    expect(page.roots[2]?.style?.color).toBe(light.ink);
  });

  it("needs a cinematic opening and a palette, else stays dark-only", () => {
    expect(prepareStudioPage([lightBand, hero], true, "dark-to-light", light).lightFrom).toBeNull();
    expect(prepareStudioPage([hero, lightBand], true, "dark-to-light", null).lightFrom).toBeNull();
    expect(prepareStudioPage([hero], true, "dark-to-light", light).lightFrom).toBeNull();
    expect(prepareStudioPage([hero, lightBand], false, "dark-to-light", light).lightFrom).toBeNull();
  });

  it("leaves later photographic chapters with their own backdrop and ink", () => {
    const chapter: CompositionNode = { type: "scene", style: { color: "#ffffff" }, children: [{ type: "media", mediaRef: "m2", alt: "Pool" }] };
    expect(healLightNode(chapter, light)).toBe(chapter);
  });

  it("light helpers pull dark fills onto the light canvas", () => {
    expect(lightSectionColor("#111111", light)).toBe(light.canvas);
    expect(lightSectionColor("#f0ebe0", light)).toBe("#f0ebe0");
    expect(studioLightVars(light)["--background"]).toBe(light.canvas);
    expect(studioLightVars(light)["--foreground"]).toBe(light.ink);
  });

  it("renders one seam above the first light section", async () => {
    const { SiteSection } = await import("@/components/site/SiteSections");
    const site = { org: { name: "Veyra", slug: "veyra" }, profile: null, services: [], reviews: [] } as never;
    const section = { id: "s2", kind: "composition", settings: null, components: [] } as never;
    const html = renderToStaticMarkup(createElement(SiteSection, { site, section, studio: true, light, seam: true, preparedRoot: lightBand }));
    expect(html.match(/data-studio-seam/g)?.length).toBe(1);
    expect(html).toContain("data-studio-light");
    expect(html).toContain(`linear-gradient(180deg, ${light.dark} 0%, ${light.canvas} 100%)`);
  }, 20000);
});
