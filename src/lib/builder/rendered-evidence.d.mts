import type { ViewportMeasurement } from "./visual";

export type RenderedEvidence = {
  measurements: ViewportMeasurement[];
  invalidMeasurements: number;
  missingWidths: number[];
  missingAccessibilityWidths: number[];
  missingPerformanceWidths: number[];
  /** Phone widths whose overlay-covers-control check did not run. */
  missingOverlayWidths: number[];
};

export declare const OVERLAY_EVIDENCE_WIDTHS: readonly number[];

export declare function inspectRenderedEvidence(
  raw: unknown,
  requiredWidths: readonly number[],
): RenderedEvidence;
