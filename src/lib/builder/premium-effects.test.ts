import { describe, expect, it } from "vitest";
import {
  STILL_ENVIRONMENT, MAX_HEAVY_PER_PAGE, buildingMode, checkFloors, cleanMeterLabel, createCanvasBudget, dprCap, isPanoramaPart,
  looksEquirect, overBudget, premiumMotionMode, readPremiumSettings, shaderMode, shaderPalette, shaderPixelBudget, shaderSpeed,
  shaderStillCss, shaderTextContrast, splitWords, tourMode, writePremiumSettings, SHADER_KINDS,
} from "@/lib/builder/premium-effects";
import { nicheEffects, premiumEffectsNote, resolveMeterLabel } from "@/lib/builder/premium-niche";
import { meterText } from "@/lib/site-scroll-progress";

const LIVE = { webgl: true, reducedMotion: false, saveData: false };

describe("shader selection and fallbacks", () => {
  it("runs live only with WebGL, motion allowed, no data saver, effects on and tier above T0", () => {
    expect(shaderMode(LIVE)).toBe("live");
    expect(shaderMode(STILL_ENVIRONMENT)).toBe("still");
    expect(shaderMode({ ...LIVE, webgl: false })).toBe("still");
    expect(shaderMode({ ...LIVE, reducedMotion: true })).toBe("still");
    expect(shaderMode({ ...LIVE, saveData: true })).toBe("still");
    expect(shaderMode(LIVE, false)).toBe("still");
    expect(shaderMode(LIVE, true, 0)).toBe("still");
    expect(shaderMode(LIVE, true, 1)).toBe("live");
  });
  it("speed by tier, frozen when not playing", () => {
    expect(shaderSpeed(0, true)).toBe(0);
    expect(shaderSpeed(1, true)).toBe(0.12);
    expect(shaderSpeed(2, true)).toBe(0.3);
    expect(shaderSpeed(3, true)).toBe(0.3);
    expect(shaderSpeed(3, false)).toBe(0);
  });
  it("caps pixel ratio and pixel count on phones", () => {
    expect(dprCap(390)).toBe(1.5);
    expect(dprCap(1440)).toBe(2);
    expect(shaderPixelBudget(390)).toBe(1280 * 720);
    expect(shaderPixelBudget(1440)).toBe(1920 * 1080);
  });
  it("palette is dark-first with the accent, and every kind has a CSS still", () => {
    const palette = shaderPalette(null, "#ff6600");
    expect(palette).toHaveLength(4);
    expect(palette[2]).toBe("#ff6600");
    for (const kind of SHADER_KINDS) expect(shaderStillCss(palette, kind)).toMatch(/gradient/);
    expect(shaderPalette("not a colour", "nope").every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
  });
  it("text contrast is the worst case across the palette", () => {
    const palette = shaderPalette("#000000", "#111111");
    expect(shaderTextContrast("#ffffff", palette)!).toBeGreaterThan(10);
    expect(shaderTextContrast("#101010", palette)!).toBeLessThan(2);
  });
  it("tour, building and motion modes fall back without WebGL / with reduced motion / when off", () => {
    expect(tourMode(LIVE)).toBe("interactive");
    expect(tourMode({ ...LIVE, webgl: false })).toBe("poster");
    expect(tourMode(LIVE, false)).toBe("poster");
    expect(buildingMode(LIVE)).toBe("scene");
    expect(buildingMode({ ...LIVE, saveData: true })).toBe("list");
    expect(premiumMotionMode({ reducedMotion: true })).toBe("still");
    expect(premiumMotionMode({ reducedMotion: false }, false)).toBe("still");
    expect(premiumMotionMode({ reducedMotion: false })).toBe("animate");
  });
});

describe("one live canvas per page", () => {
  it("a background takes a free slot but never displaces anything", () => {
    const seen: (string | null)[] = [];
    const budget = createCanvasBudget((holder) => seen.push(holder?.id ?? null));
    expect(budget.acquire({ id: "bg1", kind: "background" })).toBe(true);
    expect(budget.acquire({ id: "bg2", kind: "background" })).toBe(false);
    expect(budget.acquire({ id: "bg1", kind: "background" })).toBe(true);
    expect(budget.holder()?.id).toBe("bg1");
    expect(seen).toEqual(["bg1"]);
  });
  it("a viewer the visitor opens displaces the background, and the newest viewer wins", () => {
    const budget = createCanvasBudget();
    const heard: (string | null)[] = [];
    const off = budget.subscribe((holder) => heard.push(holder?.id ?? null));
    budget.acquire({ id: "bg", kind: "background" });
    expect(budget.acquire({ id: "tour", kind: "viewer" })).toBe(true);
    expect(budget.acquire({ id: "model", kind: "viewer" })).toBe(true);
    expect(budget.holder()?.id).toBe("model");
    budget.release("tour"); // not the holder: no change
    expect(budget.holder()?.id).toBe("model");
    budget.release("model");
    expect(budget.holder()).toBeNull();
    off();
    budget.acquire({ id: "bg", kind: "background" });
    expect(heard).toEqual(["bg", "tour", "model", null]);
  });
});

describe("heavy-effect budget", () => {
  const shader = { type: "shader_field", children: [{ type: "heading" }] };
  const tour = { type: "tour_360", children: [] };
  it("allows one shader and two heavy blocks per page", () => {
    expect(MAX_HEAVY_PER_PAGE).toBe(2);
    expect(overBudget([{ id: "a", root: shader }, { id: "b", root: { type: "stack", children: [tour] } }])).toEqual([]);
    expect(overBudget([{ id: "a", root: shader }, { id: "b", root: shader }])).toEqual([{ sectionId: "b", type: "shader_field", path: "root" }]);
    const over = overBudget([{ id: "a", root: tour }, { id: "b", root: tour }, { id: "c", root: { type: "stack", children: [tour] } }]);
    expect(over).toEqual([{ sectionId: "c", type: "tour_360", path: "root.children[0]" }]);
  });
});

describe("owner data", () => {
  it("panoramas are the owner's own 2:1 or filed-as-360 pictures, never stock or AI-made", () => {
    expect(isPanoramaPart({ visual: { source: "customer", width: 6000, height: 3000 } })).toBe(true);
    expect(isPanoramaPart({ visual: { source: "customer" }, media_category: "Panorama" })).toBe(true);
    expect(isPanoramaPart({ visual: { source: "stock", width: 6000, height: 3000 } })).toBe(false);
    expect(isPanoramaPart({ visual: { source: "generated" }, media_category: "360" })).toBe(false);
    expect(isPanoramaPart({ visual: { source: "customer", width: 4000, height: 3000 } })).toBe(false);
    expect(isPanoramaPart(null)).toBe(false);
  });
  it("render guard rejects clearly non-2:1 pictures but allows unknown sizes", () => {
    expect(looksEquirect({ width: 4096, height: 2048 })).toBe(true);
    expect(looksEquirect({ width: 1600, height: 1200 })).toBe(false);
    expect(looksEquirect(undefined)).toBe(true);
    expect(looksEquirect({})).toBe(true);
  });
  it("floors are 2-12 owner rows without typed prices", () => {
    expect("floors" in checkFloors([{ label: "Lobby" }, { label: "Roof terrace", body: "Views over the bay" }])).toBe(true);
    expect("problem" in checkFloors([{ label: "Only one" }])).toBe(true);
    expect("problem" in checkFloors("nope")).toBe(true);
  });
  it("splitWords keeps the spaces so the full heading re-forms exactly", () => {
    expect(splitWords("Sunset,  in red.").join("")).toBe("Sunset,  in red.");
    expect(splitWords("Sunset, in red.").filter((w) => w.trim())).toEqual(["Sunset,", "in", "red."]);
  });
});

describe("site settings and the scroll meter", () => {
  it("defaults to on with no label, and keeps the label across a toggle", () => {
    expect(readPremiumSettings(null)).toEqual({ enabled: true, meterLabel: null, meterSet: false });
    const labelled = writePremiumSettings({ other: 1 }, { meterLabel: "Clean" });
    expect(labelled["other"]).toBe(1);
    expect(readPremiumSettings(labelled)).toMatchObject({ enabled: true, meterLabel: "clean", meterSet: true });
    const off = writePremiumSettings(labelled, { enabled: false });
    expect(readPremiumSettings(off)).toMatchObject({ enabled: false, meterLabel: "clean" });
  });
  it("cleans the meter word", () => {
    expect(cleanMeterLabel("  Detailed ")).toBe("detailed");
    expect(cleanMeterLabel("<script>")).toBeNull();
    expect(cleanMeterLabel("a".repeat(19))).toBeNull();
    expect(cleanMeterLabel(4)).toBeNull();
  });
  it("owner choice beats the niche default; off hides it", () => {
    const niche = nicheEffects("auto detailing");
    expect(resolveMeterLabel({ enabled: true, meterLabel: null, meterSet: false }, niche)).toBeNull();
    expect(resolveMeterLabel({ enabled: true, meterLabel: null, meterSet: true }, niche)).toBeNull();
    expect(resolveMeterLabel({ enabled: true, meterLabel: "shiny", meterSet: true }, niche)).toBe("shiny");
    expect(resolveMeterLabel({ enabled: false, meterLabel: "shiny", meterSet: true }, niche)).toBeNull();
  });
  it("meter text reads as a percentage with the word", () => {
    expect(meterText(0.414, "clean")).toBe("41% clean");
  });
});

describe("niche tiers", () => {
  it("emergency trades are T0 with no shader or WebGL", () => {
    for (const trade of ["plumbing", "Plumber"]) {
      const fx = nicheEffects(trade);
      expect(fx.tier).toBe(0);
      expect(fx.shader).toBeNull();
    }
    expect(premiumEffectsNote("plumbing")).toMatch(/tier T0: no WebGL/);
  });
  it("real estate is T3 with a tour and a building explorer", () => {
    expect(nicheEffects("Real Estate Agency")).toMatchObject({ tier: 3, shader: "god-rays", tour360: true, building: true });
  });
  it("unknown business gets the safe base", () => {
    expect(nicheEffects(null)).toMatchObject({ key: "general", tier: 1, shader: "mesh" });
  });
  it("the prompt note carries the budget and the tap rule", () => {
    const note = premiumEffectsNote("roofing");
    expect(note).toMatch(/at most one shader_field/);
    expect(note).toMatch(/opens on a tap/);
  });
});

describe("scroll meter never leaks a default badge (audit item 3: '0% detailed')", () => {
  it("no trade has a default meter word, so nothing shows unless the owner asked", () => {
    for (const industry of ["auto detailing", "pressure washing", "cleaning", "roofing", "plumbing", "dentist", "real estate"])
      expect(nicheEffects(industry).meterLabel).toBeNull();
    const niche = nicheEffects("auto detailing");
    expect(resolveMeterLabel({ enabled: true, meterLabel: null, meterSet: false }, niche)).toBeNull();
  });
  it("an owner's explicit word still works on the live site but never in the draft preview", () => {
    const niche = nicheEffects("auto detailing");
    const own = { enabled: true, meterLabel: "shiny", meterSet: true };
    expect(resolveMeterLabel(own, niche)).toBe("shiny");
    expect(resolveMeterLabel(own, niche, { preview: true })).toBeNull();
  });
});
