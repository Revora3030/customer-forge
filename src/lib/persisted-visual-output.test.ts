import { describe, expect, it } from "vitest";
import {
  readComponentVisual,
  readSectionVisual,
  writeComponentVisual,
  writeSectionVisual,
} from "./site-style";

describe("persisted visual output contract", () => {
  it("round-trips section composition", () => {
    const settings = writeSectionVisual({}, {
      layout: "layered",
      density: "airy",
      spacing: "generous",
      card_style: "glass",
      image_ratio: "16:9",
    });
    expect(readSectionVisual(settings)).toEqual({
      layout: "layered",
      density: "airy",
      spacing: "generous",
      card_style: "glass",
      image_ratio: "16:9",
    });
  });

  it("round-trips component media treatment without arbitrary CSS", () => {
    const settings = writeComponentVisual({}, {
      alt: "Finished roof replacement",
      object_fit: "cover",
      radius: "large",
      shadow: "medium",
      aspect_ratio: "4:3",
      focal_point: "0.5 0.5",
    });
    const visual = readComponentVisual(settings);
    expect(visual.alt).toBe("Finished roof replacement");
    expect(visual.object_fit).toBe("cover");
    expect(visual.radius).toBe("large");
    expect(visual.shadow).toBe("medium");
  });

  it("preserves unrelated settings", () => {
    const settings = writeSectionVisual({ seo: { anchor: "services" } }, { layout: "editorial" });
    expect(settings.seo).toEqual({ anchor: "services" });
    expect(readSectionVisual(settings).layout).toBe("editorial");
  });
});
