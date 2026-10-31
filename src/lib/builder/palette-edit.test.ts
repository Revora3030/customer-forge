import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  PALETTE_PRESETS,
  matchingPreset,
  normalizeHex,
  paletteFromProfile,
  paletteWarnings,
  readPalette,
  samePalette,
} from "./palette-edit";
import { PREVIEW_BRIDGE_SOURCE, readBuilderMessage } from "./preview-bridge";

describe("normalizeHex", () => {
  it("accepts 3 and 6 digit hex, with or without #, in any case", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("1D4ED8")).toBe("#1d4ed8");
    expect(normalizeHex("  #1d4ed8 ")).toBe("#1d4ed8");
  });
  it("rejects anything that is not a colour", () => {
    for (const bad of ["", "#12", "#12345", "#1234567", "red", "url(x)", "#gggggg", null, undefined, 5]) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe("readPalette / paletteFromProfile", () => {
  it("needs all three colours", () => {
    expect(readPalette({ primary: "#111", secondary: "#fff", accent: "#0af" })).toEqual({ primary: "#111111", secondary: "#ffffff", accent: "#00aaff" });
    expect(readPalette({ primary: "#111", secondary: "#fff" })).toBeNull();
    expect(readPalette({ primary: "#111", secondary: "nope", accent: "#fff" })).toBeNull();
    expect(readPalette(null)).toBeNull();
  });
  it("fills blanks like the renderer: highlight falls back to the main colour", () => {
    expect(paletteFromProfile({ primary_color: "#1d4ed8" })).toEqual({ primary: "#1d4ed8", secondary: "#ffffff", accent: "#1d4ed8" });
    expect(paletteFromProfile(null).primary).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("presets", () => {
  it("are valid, unique and match themselves", () => {
    const ids = new Set(PALETTE_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(PALETTE_PRESETS.length);
    for (const preset of PALETTE_PRESETS) {
      expect(readPalette(preset)).toEqual({ primary: preset.primary, secondary: preset.secondary, accent: preset.accent });
      expect(matchingPreset(preset)?.id).toBe(preset.id);
    }
  });
  it("do not trip any AA warning (they are safe starting points)", () => {
    for (const preset of PALETTE_PRESETS) {
      expect(paletteWarnings(preset), preset.id).toEqual([]);
    }
  });
  it("a custom colour is not a preset", () => {
    expect(matchingPreset({ ...PALETTE_PRESETS[0]!, primary: "#123456" })).toBeNull();
    expect(samePalette(PALETTE_PRESETS[0]!, PALETTE_PRESETS[1]!)).toBe(false);
  });
});

describe("paletteWarnings", () => {
  it("flags a main colour that is nearly the page background", () => {
    const warnings = paletteWarnings({ primary: "#f5f5f5", secondary: "#ffffff", accent: "#1d4ed8" });
    expect(warnings.map((w) => w.id)).toContain("button-shape");
  });
  it("flags a mid-tone main colour where neither label colour reaches 4.5:1", () => {
    const warnings = paletteWarnings({ primary: "#777777", secondary: "#ffffff", accent: "#1d4ed8" });
    const text = warnings.find((w) => w.id === "button-text");
    expect(text).toBeTruthy();
    expect(text!.ratio).toBeLessThan(AA_TEXT);
    expect(text!.required).toBe(AA_TEXT);
  });
  it("flags a washed-out highlight colour", () => {
    expect(paletteWarnings({ primary: "#1d4ed8", secondary: "#ffffff", accent: "#fafafa" }).map((w) => w.id)).toEqual(["accent-shape"]);
  });
});

describe("builder to preview theme messages", () => {
  it("reads a live palette and normalises case", () => {
    expect(readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "patch-theme", primary: "#1D4ED8", secondary: "#ffffff", accent: "#0369a1" })).toEqual({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "patch-theme",
      primary: "#1d4ed8",
      secondary: "#ffffff",
      accent: "#0369a1",
    });
  });
  it("refuses anything that is not three plain hex colours (no CSS injection)", () => {
    const base = { source: PREVIEW_BRIDGE_SOURCE, type: "patch-theme", primary: "#1d4ed8", secondary: "#ffffff", accent: "#0369a1" };
    expect(readBuilderMessage({ ...base, primary: "red; background:url(x)" })).toBeNull();
    expect(readBuilderMessage({ ...base, accent: "#fff" })).toBeNull();
    expect(readBuilderMessage({ ...base, secondary: undefined })).toBeNull();
    expect(readBuilderMessage({ ...base, source: "someone-else" })).toBeNull();
  });
  it("reads reset-theme and the quick-edit flag", () => {
    expect(readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "reset-theme" })).toEqual({ source: PREVIEW_BRIDGE_SOURCE, type: "reset-theme" });
    const on = readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: true, quickEdit: true });
    expect(on).toMatchObject({ type: "select-mode", on: true, quickEdit: true });
    const plain = readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "select-mode", on: true });
    expect(plain && "quickEdit" in plain).toBe(false);
  });
});
