import { describe, expect, it } from "vitest";
import {
  readComponentVisual,
  writeComponentVisual,
} from "./site-style";

describe("persisted visual output contract", () => {


  it("round-trips component media treatment without arbitrary CSS", () => {
    const settings = writeComponentVisual({}, {
      alt: "Finished roof replacement",
      object_fit: "cover",
      radius: 37,
      shadow: 24,
      aspect_ratio: "7:5",
      focal_point: "50% 50%",
    });
    const visual = readComponentVisual(settings);
    expect(visual.alt).toBe("Finished roof replacement");
    expect(visual.object_fit).toBe("cover");
    expect(visual.radius).toBe(37);
    expect(visual.shadow).toBe(24);
    expect(visual.aspect_ratio).toBe("7:5");
  });
});