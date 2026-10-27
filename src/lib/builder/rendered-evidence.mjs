function record(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function baseMeasurement(value) {
  if (!record(value)) return false;
  return (
    nonnegative(value["width"]) && value["width"] > 0 &&
    nonnegative(value["scrollWidth"]) && value["scrollWidth"] > 0 &&
    nonnegative(value["ctas"]) && typeof value["navigable"] === "boolean" &&
    ["overflowing", "brokenImages", "clipped", "smallTargets", "tinyText", "unreachable"]
      .every((name) => Array.isArray(value[name]))
  );
}

function accessibilityComplete(value) {
  if (!record(value)) return false;
  return (
    ["imagesMissingAlt", "unlabeledControls", "unlabeledInputs", "headingOrderProblems", "lowContrast"]
      .every((name) => Array.isArray(value[name])) &&
    ["h1Count", "controls", "keyboardReachable"].every((name) => nonnegative(value[name])) &&
    ["hasMain", "hasNav", "zoomBlocked"].every((name) => typeof value[name] === "boolean")
  );
}

function performanceComplete(value) {
  if (!record(value)) return false;
  return (
    ["ttfb", "fcp", "lcp", "cls", "inp", "longTasks"]
      .every((name) => value[name] === null || nonnegative(value[name])) &&
    ["resources", "scriptBytes", "imageBytes", "fontBytes", "failedRequests", "renderBlocking"]
      .every((name) => nonnegative(value[name])) &&
    Array.isArray(value["oversizedImages"])
  );
}

/** Widths at which the overlay-covers-control check must have run (phone). */
export const OVERLAY_EVIDENCE_WIDTHS = [390];

export function inspectRenderedEvidence(
  raw,
  requiredWidths,
) {
  const rows = Array.isArray(raw) ? raw : [];
  const measurements = rows.filter(baseMeasurement);
  return {
    measurements,
    invalidMeasurements: rows.length - measurements.length,
    missingWidths: requiredWidths.filter((width) => !measurements.some((row) => row.width === width)),
    missingAccessibilityWidths: requiredWidths.filter((width) =>
      !measurements.some((row) => row.width === width && accessibilityComplete(row.accessibility)),
    ),
    missingPerformanceWidths: requiredWidths.filter((width) =>
      !measurements.some((row) => row.width === width && performanceComplete(row.performance)),
    ),
    // A measurement without the overlay array never ran that check: it is
    // reported as not measured, never counted as "no overlay covers a control".
    missingOverlayWidths: requiredWidths.filter((width) =>
      OVERLAY_EVIDENCE_WIDTHS.includes(width) &&
      !measurements.some((row) => row.width === width && Array.isArray(row.overlayConflicts)),
    ),
  };
}
