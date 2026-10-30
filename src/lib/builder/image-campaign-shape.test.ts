import { describe, expect, it } from "vitest";
import { intrinsicSize, sharedCampaignStyle, standardShotAspect } from "./image-campaign";

describe("standard picture shapes", () => {
  it("hero 16:9, cards 4:3", () => {
    expect(standardShotAspect({ slot: "hero", placement: ["opening"], aspect: "3:4" })).toBe("16:9");
    expect(standardShotAspect({ slot: "service-1", placement: ["services"], aspect: "1:1" })).toBe("4:3");
    expect(standardShotAspect({ slot: "about", placement: ["story"], aspect: "3:2" })).toBe("3:2");
  });
  it("gives intrinsic sizes so nothing shifts", () => {
    expect(intrinsicSize("16:9")).toEqual({ width: 1600, height: 900 });
    expect(intrinsicSize("4 / 3")).toEqual({ width: 1600, height: 1200 });
    expect(intrinsicSize("auto")).toBeNull();
  });
  it("builds one shared style line from the hero direction", () => {
    const line = sharedCampaignStyle([{ slot: "service", lighting: "flat" }, { slot: "hero", lighting: "low golden sun", palette: "warm amber", mood: "calm" }]);
    expect(line).toContain("low golden sun");
    expect(line).toContain("warm amber");
    expect(sharedCampaignStyle([])).toBe("");
  });
});
