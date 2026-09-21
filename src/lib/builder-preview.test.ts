import { describe, expect, it } from "vitest";
import { BUILDER_VIEWPORTS, previewPath, previewZoom } from "./builder-preview";

describe("builder preview", () => {
  it("links home and internal pages through the public customer preview", () => {
    expect(previewPath("acme-co", "home")).toBe("/s/acme-co");
    expect(previewPath("acme co", "Our Work")).toBe("/s/acme%20co/Our%20Work");
  });

  it("keeps zoom inside a stable, accessible preview range", () => {
    expect(previewZoom(0.1)).toBe(0.5);
    expect(previewZoom(0.77)).toBe(0.75);
    expect(previewZoom(2)).toBe(1);
    expect(previewZoom(Number.NaN)).toBe(0.75);
  });

  it("offers representative phone, tablet, laptop and wide widths", () => {
    expect(BUILDER_VIEWPORTS.map((item) => item.width)).toEqual([390, 768, 1280, 1440]);
  });
});