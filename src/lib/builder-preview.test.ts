import { describe, expect, it } from "vitest";
import { BUILDER_VIEWPORTS, previewPath, previewZoom } from "./builder-preview";

describe("builder preview", () => {
  it("links home and internal pages through the public customer preview", () => {
    expect(previewPath("acme-co", "home")).toBe("/draft/acme-co");
    expect(previewPath("acme co", "Our Work")).toBe("/draft/acme%20co/Our%20Work");
  });

  it("keeps zoom inside a stable, accessible preview range", () => {
    expect(previewZoom(0.1)).toBe(0.5);
    expect(previewZoom(0.77)).toBe(0.75);
    expect(previewZoom(2)).toBe(1);
    expect(previewZoom(Number.NaN)).toBe(0.75);
  });

  it("offers representative phone, tablet, laptop and wide widths", () => {
    expect(BUILDER_VIEWPORTS.map((item) => item.width)).toEqual([320, 390, 768, 1280, 1440, 2560]);
  });
});
import { compareScale, draftDiff, draftDiffLabel, fitZoom, nextCompareMode } from "./builder-preview";

describe("compare modes and viewport scales", () => {
  it("cycles off → side by side → overlay → off", () => {
    expect(nextCompareMode("off")).toBe("side");
    expect(nextCompareMode("side")).toBe("overlay");
    expect(nextCompareMode("overlay")).toBe("off");
  });

  it("halves the pane only side by side, never above the zoom cap", () => {
    expect(compareScale("side", 0.75, 1000, 390)).toBe(0.75);
    expect(compareScale("side", 1, 836, 1280)).toBeCloseTo(0.3125);
    expect(compareScale("overlay", 0.6, 800, 1280)).toBe(0.6);
    expect(compareScale("off", 0.6, 0, 1280)).toBe(0.6);
  });

  it("fits every device width into the stage", () => {
    expect(fitZoom(1304, 1280)).toBe(1);
    expect(fitZoom(664, 2560)).toBeCloseTo(0.25);
    expect(fitZoom(0, 390)).toBe(0.75);
  });

  it("counts updated, new and removed sections against the live copy", () => {
    const diff = draftDiff(
      [{ id: "a", fingerprint: "1" }, { id: "b", fingerprint: "2" }, { id: "gone", fingerprint: "3" }],
      [{ id: "a", fingerprint: "1" }, { id: "b", fingerprint: "2b" }, { id: "c", fingerprint: "4" }],
    );
    expect(diff).toEqual({ updated: 1, added: 1, removed: 1 });
    expect(draftDiffLabel({ updated: 2, added: 1, removed: 0 })).toBe("Draft has 2 updated sections, 1 new section");
    expect(draftDiffLabel({ updated: 0, added: 0, removed: 0 })).toBe("Draft matches live");
    expect(draftDiffLabel(null)).toBe("Not published yet");
  });
});
