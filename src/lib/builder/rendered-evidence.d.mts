import type { ViewportMeasurement } from "./visual";

export type RenderedEvidence = {
  measurements: ViewportMeasurement[];
  invalidMeasurements: number;
  missingWidths: number[];
  missingAccessibilityWidths: number[];
  missingPerformanceWidths: number[];
};

export declare function inspectRenderedEvidence(
  raw: unknown,
  requiredWidths: readonly number[],
): RenderedEvidence;
