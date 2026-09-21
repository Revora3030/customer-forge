import { describe, expect, it } from "vitest";
import {
  adaptSectionLayout,
  imageLayoutWarnings,
  imageSignalsFromBrief,
  imageSignalsFromSamples,
  type ImageSample,
} from "@/lib/builder/image-layout-intelligence";

function grid(color: (x: number, y: number) => [number, number, number]): ImageSample[] {
  const samples: ImageSample[] = [];
  for (let gx = 0; gx < 8; gx += 1) {
    for (let gy = 0; gy < 8; gy += 1) {
      const x = gx / 7;
      const y = gy / 7;
      const [r, g, b] = color(x, y);
      samples.push({ r, g, b, x, y });
    }
  }
  return samples;
}

describe("image → layout intelligence", () => {
  it("places type on the calm side of the frame", () => {
    // Busy, high-variance subject on the right; flat calm field on the left.
    const samples = grid((x, y) => (x > 0.55 ? [y > 0.5 ? 240 : 20, 30, 30] : [40, 42, 44]));
    const signals = imageSignalsFromSamples(samples, 16 / 9);
    expect(signals.safeTextArea).toBe("left");
    const layout = adaptSectionLayout(signals, null);
    expect(layout.textPlacement).toBe("left");
    expect(layout.textAlign).toBe("start");
  });

  it("reports brightness, contrast, orientation and dominant colours", () => {
    const signals = imageSignalsFromSamples(grid(() => [255, 255, 255]), 0.8);
    expect(signals.brightness).toBeCloseTo(1, 1);
    expect(signals.contrast).toBeCloseTo(0, 1);
    expect(signals.orientation).toBe("portrait");
    expect(signals.dominantColors[0]).toBe("#ffffff");
  });

  it("raises the overlay for bright busy pictures and keeps text readable", () => {
    const busy = imageSignalsFromSamples(
      grid((x, y) => [(x + y) % 0.3 < 0.15 ? 250 : 200, 220, 230]),
      16 / 9,
    );
    const layout = adaptSectionLayout(busy, null);
    expect(layout.overlayStrength).toBeGreaterThan(0.3);
    expect(layout.overlayStyle).not.toBe("none");
  });

  it("keeps the subject in frame through object-position", () => {
    const signals = imageSignalsFromSamples(
      grid((x) => (x > 0.75 ? [250, 250, 250] : [20, 20, 20])),
      16 / 9,
    );
    const layout = adaptSectionLayout(signals, null);
    expect(layout.objectPosition).toMatch(/^\d+% \d+%$/);
    expect(layout.mobileObjectPosition).toMatch(/^\d+% \d+%$/);
  });

  it("falls back to the brief's intended composition when no pixels exist", () => {
    const signals = imageSignalsFromBrief({
      slot: "hero",
      label: "hero",
      purpose: "opening",
      subject: "a detailed car",
      environment: "clean bay",
      action: "work",
      lighting: "studio",
      camera: "wide",
      framing: "16:9",
      focalPoint: "right",
      negativeSpace: "left",
      aspectRatio: "16:9",
      palette: "brand",
      mood: "calm",
      section: ["hero"],
      mobileCrop: "4:5 at 320px",
      constraints: ["no text"],
      evidenceTag: "AI_GENERATED_MARKETING_VISUAL",
    });
    expect(signals.safeTextArea).toBe("left");
    expect(signals.focalX).toBeGreaterThan(0.5);
    expect(signals.orientation).toBe("landscape");
  });

  it("warns when a picture cannot carry its slot", () => {
    const blown = imageSignalsFromSamples(grid(() => [253, 253, 253]), 16 / 9);
    expect(imageLayoutWarnings(blown, "hero").join(" ")).toMatch(/blown out|flat/);
    const black = imageSignalsFromSamples(grid(() => [2, 2, 2]), 16 / 9);
    expect(imageLayoutWarnings(black, "hero").join(" ")).toMatch(/almost black|flat/);
  });

  it("never produces an empty layout decision", () => {
    const signals = imageSignalsFromSamples([], 16 / 9);
    const layout = adaptSectionLayout(signals, null, { slot: "service" });
    expect(layout.imageRatioDesktop).toBeTruthy();
    expect(layout.imageRatioMobile).toBeTruthy();
    expect(["left", "right", "centre", "below"]).toContain(layout.textPlacement);
  });
});
