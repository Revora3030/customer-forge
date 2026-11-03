import { describe, expect, it } from "vitest";
import { cleanFrameLabels, isProductionFrameLabel, visibleFrameLabel } from "@/lib/builder/frame-labels";

describe("frame labels a visitor may read", () => {
  it("drops AI production notes and generic slot names", () => {
    for (const label of ["Resting frame", "Moving frame", "resting", "MOVING", "Frame 2", "Shot 3", "Wide shot", "Image 1", "Scene 2", "Still", "Keyframe A", "Placeholder", "Untitled", "1", "02", "—", "", "  ", "hero-01.jpg", "Step 3", "Opening"]) {
      expect(isProductionFrameLabel(label), label).toBe(true);
      expect(visibleFrameLabel(label), label).toBeUndefined();
    }
    expect(isProductionFrameLabel(null)).toBe(true);
    expect(isProductionFrameLabel(undefined)).toBe(true);
  });

  it("keeps real chapter labels from the service story", () => {
    for (const label of ["Driveway", "Roof soft wash", "House wash", "Before", "After", "Detail", "Opening surface study - wide", "Pressure test", "Paint correction", "Moving day"]) {
      expect(isProductionFrameLabel(label), label).toBe(false);
    }
    expect(visibleFrameLabel("  Roof   soft wash ")).toBe("Roof soft wash");
    expect(visibleFrameLabel("A".repeat(40))?.length).toBe(30);
  });

  it("hides the chip row when no frame keeps a real label", () => {
    const ai = cleanFrameLabels([{ src: "/a.jpg", label: "Resting frame" }, { src: "/b.jpg", label: "Moving frame" }]);
    expect(ai.showChips).toBe(false);
    expect(ai.frames.every((frame) => !("label" in frame))).toBe(true);
    const mixed = cleanFrameLabels([{ src: "/a.jpg", label: "Driveway" }, { src: "/b.jpg", label: "Moving frame" }]);
    expect(mixed.showChips).toBe(true);
    expect(mixed.frames.map((frame) => frame.label)).toEqual(["Driveway", undefined]);
    expect(cleanFrameLabels([{ src: "/a.jpg", label: "Driveway" }]).showChips).toBe(false);
  });
});
