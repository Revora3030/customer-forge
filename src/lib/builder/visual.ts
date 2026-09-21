/**
 * REVORA FREE-FIRST BUILDER
 * MASTER CODE #7 — VISUAL INTELLIGENCE ENGINE
 *
 * Purpose:
 * - Measure real rendered websites.
 * - Grade responsive behavior across phone/tablet/desktop.
 * - Detect visual breakage before publishing.
 * - Detect accessibility problems.
 * - Detect conversion blockers.
 * - Detect image and performance problems.
 * - Grade the WHOLE SITE, not just the homepage.
 *
 * Principles:
 * - Deterministic.
 * - Free-first.
 * - No paid AI.
 * - No fabricated evidence.
 * - No fake "10/10" score without browser evidence.
 * - Conservative P0 classification.
 * - Backward-compatible public API.
 */

export const VIEWPORTS = [
  320,
  375,
  390,
  414,
  768,
  1024,
  1280,
  1440,
] as const;

export type AccessibilityMeasurement = {
  imagesMissingAlt: string[];
  unlabeledControls: string[];
  unlabeledInputs: string[];
  headingOrderProblems: string[];
  h1Count: number;
  hasMain: boolean;
  hasNav: boolean;
  controls: number;
  keyboardReachable: number;
  lowContrast: {
    selector: string;
    ratio: number;
  }[];
  zoomBlocked: boolean;
  invalidTabIndexes?: string[];
  focusVisibleMissing?: string[];
};

export type PerformanceMeasurement = {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  longTasks: number | null;

  resources: number;
  scriptBytes: number;
  imageBytes: number;
  fontBytes: number;
  failedRequests: number;

  oversizedImages: string[];
  renderBlocking: number;

  cssBytes?: number;
  documentBytes?: number;
  thirdPartyResources?: number;
};

export type ViewportMeasurement = {
  width: number;
  scrollWidth: number;

  overflowing: {
    selector: string;
    right: number;
  }[];

  brokenImages: string[];
  clipped: string[];

  smallTargets: {
    selector: string;
    width: number;
    height: number;
  }[];

  tinyText: {
    selector: string;
    fontSize: number;
  }[];

  unreachable: string[];

  navigable: boolean;
  ctas: number;

  deadControls?: string[] | undefined;
  distortedImages?: string[] | undefined;
  overlapping?: string[] | undefined;
  narrowColumns?: string[] | undefined;
  stickyFooterHeight?: number | undefined;

  accessibility?: AccessibilityMeasurement | undefined;
  performance?: PerformanceMeasurement | undefined;
};

export type VisualFinding = {
  key: string;
  severity: "p0" | "advice";
  detail: string;
  fix: string;
  width: number;
  page?: string;
};

export type VisualCoverage = {
  accessibility: boolean;
  performance: boolean;
};

export type VisualReport = {
  score: number;
  passed: boolean;
  findings: VisualFinding[];
  widths: number[];
  pages?: string[];
  coverage?: VisualCoverage;
};

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const PHONE_MAX = 500;

const SCORE_P0_PENALTY = 20;
const SCORE_ADVICE_PENALTY = 3;

const MAX_FINDINGS_PER_CATEGORY = 12;

/* -------------------------------------------------------------------------- */
/* BASIC HELPERS                                                              */
/* -------------------------------------------------------------------------- */

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0,
      ),
    ),
  );
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(
    new Set(
      values.filter(
        (value) =>
          Number.isFinite(value) &&
          value > 0,
      ),
    ),
  );
}

function findingIdentity(finding: VisualFinding): string {
  return [
    finding.page ?? "",
    finding.key,
    finding.width,
    finding.detail
      .replace(/\d+(?:\.\d+)?/g, "#")
      .trim(),
  ].join("|");
}

function dedupeFindings(
  findings: VisualFinding[],
): VisualFinding[] {
  const seen = new Set<string>();
  const result: VisualFinding[] = [];

  for (const finding of findings) {
    const identity = findingIdentity(finding);

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    result.push(finding);
  }

  return result;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(value)),
  );
}

/* -------------------------------------------------------------------------- */
/* VIEWPORT GRADING                                                           */
/* -------------------------------------------------------------------------- */

export function gradeViewport(
  measurement: ViewportMeasurement,
): VisualFinding[] {
  const width = numberOrZero(measurement.width);
  const phone = width > 0 && width <= PHONE_MAX;

  const findings: VisualFinding[] = [];

  const add = (
    key: string,
    severity: VisualFinding["severity"],
    detail: string,
    fix: string,
  ): void => {
    findings.push({
      key,
      severity,
      detail,
      fix,
      width,
    });
  };

  /* ---------------------------------------------------------------------- */
  /* RESPONSIVE                                                              */
  /* ---------------------------------------------------------------------- */

  const scrollWidth = numberOrZero(
    measurement.scrollWidth,
  );

  if (
    width > 0 &&
    scrollWidth > width + 1
  ) {
    add(
      "horizontal_overflow",
      "p0",
      `At ${width}px the page is ${Math.round(
        scrollWidth - width,
      )}px wider than the viewport.`,
      "Find the element causing overflow and make it responsive, wrapping, contained, or fluid.",
    );
  }

  for (
    const item of (
      measurement.overflowing ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "element_overflow",
      "p0",
      `At ${width}px “${item.selector}” extends beyond the visible viewport.`,
      "Remove fixed-width behavior and let the element shrink or wrap inside its container.",
    );
  }

  for (
    const item of (
      measurement.clipped ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "clipped_text",
      "p0",
      `At ${width}px content is visibly clipped in “${item}”.`,
      "Remove fixed heights and allow text/content to wrap naturally.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* IMAGES                                                                  */
  /* ---------------------------------------------------------------------- */

  for (
    const image of (
      measurement.brokenImages ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "broken_image",
      "p0",
      `A visible image failed to load: ${image}.`,
      "Repair the asset URL, replace the asset, or remove the broken image.",
    );
  }

  for (
    const image of (
      measurement.distortedImages ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "distorted_image",
      "advice",
      `An image appears stretched or distorted: ${image}.`,
      "Preserve the image aspect ratio or intentionally use object-fit cover/contain.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* NAVIGATION                                                              */
  /* ---------------------------------------------------------------------- */

  if (!measurement.navigable) {
    add(
      "menu_unusable",
      "p0",
      `At ${width}px the primary navigation cannot be reliably reached.`,
      "Provide a usable navigation menu or visible navigation links.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* CONVERSION                                                              */
  /* ---------------------------------------------------------------------- */

  if (measurement.ctas <= 0) {
    add(
      "no_visible_cta",
      "p0",
      `At ${width}px no visible conversion action was detected.`,
      "Provide an appropriate next step such as booking, quote, contact, enquiry, application, purchase, or consultation.",
    );
  }

  for (
    const control of (
      measurement.deadControls ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "dead_control",
      "p0",
      `“${control}” appears interactive but does not have a usable destination.`,
      "Give the control a real destination/action or remove it.",
    );
  }

  for (
    const control of (
      measurement.unreachable ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "unreachable_control",
      "p0",
      `At ${width}px “${control}” cannot be reliably reached.`,
      "Remove overlapping layers, fix z-index/layout behavior, or provide enough space for the control.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* MOBILE TOUCH                                                            */
  /* ---------------------------------------------------------------------- */

  if (phone) {
    for (
      const target of (
        measurement.smallTargets ?? []
      ).slice(0, MAX_FINDINGS_PER_CATEGORY)
    ) {
      add(
        "small_tap_target",
        "advice",
        `“${target.selector}” is approximately ${Math.round(
          target.width,
        )}×${Math.round(target.height)}px.`,
        "Give important mobile controls a comfortable touch target of roughly 44px or larger.",
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* TYPOGRAPHY                                                              */
  /* ---------------------------------------------------------------------- */

  for (
    const text of (
      measurement.tinyText ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "tiny_text",
      "advice",
      `Text in “${text.selector}” is only ${Math.round(
        text.fontSize,
      )}px.`,
      "Use readable body typography and reserve very small text for nonessential metadata.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* OVERLAPPING CONTENT                                                     */
  /* ---------------------------------------------------------------------- */

  for (
    const pair of (
      measurement.overlapping ?? []
    ).slice(0, MAX_FINDINGS_PER_CATEGORY)
  ) {
    add(
      "overlapping_content",
      "p0",
      `At ${width}px visible content blocks overlap: ${pair}.`,
      "Stack, resize, or reposition the blocks so readable content never overlaps.",
    );
  }

  for (
    const column of (
      measurement.narrowColumns ?? []
    ).slice(0, 6)
  ) {
    add(
      "narrow_column",
      "advice",
      `“${column}” is unusually narrow for readable content at ${width}px.`,
      "Give text more usable width and avoid excessive nested columns.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* STICKY MOBILE UI                                                        */
  /* ---------------------------------------------------------------------- */

  if (
    phone &&
    numberOrZero(measurement.stickyFooterHeight) > 120
  ) {
    add(
      "sticky_footer_too_tall",
      "advice",
      `A fixed bottom element occupies approximately ${Math.round(
        numberOrZero(measurement.stickyFooterHeight),
      )}px of the mobile viewport.`,
      "Keep sticky actions compact so they do not consume excessive screen space.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ACCESSIBILITY                                                           */
  /* ---------------------------------------------------------------------- */

  const accessibility = measurement.accessibility;

  if (accessibility) {
    if (accessibility.zoomBlocked) {
      add(
        "zoom_blocked",
        "p0",
        "The page prevents normal browser zooming.",
        "Allow browser zoom and avoid restrictive viewport settings.",
      );
    }

    for (
      const image of (
        accessibility.imagesMissingAlt ?? []
      ).slice(0, MAX_FINDINGS_PER_CATEGORY)
    ) {
      add(
        "image_missing_alt",
        "advice",
        `A meaningful image has no accessible alternative text: ${image}.`,
        "Add concise alt text describing the meaningful image.",
      );
    }

    for (
      const control of (
        accessibility.unlabeledControls ?? []
      ).slice(0, MAX_FINDINGS_PER_CATEGORY)
    ) {
      add(
        "unlabeled_control",
        "advice",
        `An interactive control has no accessible name: ${control}.`,
        "Add visible text or an appropriate accessible label.",
      );
    }

    for (
      const input of (
        accessibility.unlabeledInputs ?? []
      ).slice(0, MAX_FINDINGS_PER_CATEGORY)
    ) {
      add(
        "unlabeled_input",
        "p0",
        `A form field has no accessible label: ${input}.`,
        "Associate the field with a visible label or accessible name.",
      );
    }

    for (
      const heading of (
        accessibility.headingOrderProblems ?? []
      ).slice(0, 6)
    ) {
      add(
        "heading_order",
        "advice",
        `Heading hierarchy skips a level near “${heading}”.`,
        "Use heading levels in a logical document hierarchy.",
      );
    }

    if (accessibility.h1Count === 0) {
      add(
        "missing_h1",
        "advice",
        "The page has no visible H1.",
        "Provide one clear primary page heading.",
      );
    }

    if (accessibility.h1Count > 1) {
      add(
        "multiple_h1",
        "advice",
        `The page has ${accessibility.h1Count} visible H1 headings.`,
        "Prefer one clear primary H1 and use lower-level headings for supporting content.",
      );
    }

    if (!accessibility.hasMain) {
      add(
        "missing_main_landmark",
        "advice",
        "The page has no main content landmark.",
        "Use a semantic main region for primary page content.",
      );
    }

    if (!accessibility.hasNav) {
      add(
        "missing_nav_landmark",
        "advice",
        "The page has no navigation landmark.",
        "Use a semantic nav region for primary navigation.",
      );
    }

    if (
      accessibility.controls > 0 &&
      accessibility.keyboardReachable <
        accessibility.controls
    ) {
      add(
        "keyboard_unreachable",
        "p0",
        `${accessibility.controls -
          accessibility.keyboardReachable} interactive control(s) are not normally keyboard reachable.`,
        "Use native interactive elements or implement complete keyboard accessibility.",
      );
    }

    for (
      const item of (
        accessibility.lowContrast ?? []
      ).slice(0, MAX_FINDINGS_PER_CATEGORY)
    ) {
      add(
        "low_contrast",
        "advice",
        `Text in “${item.selector}” has approximately ${item.ratio.toFixed(
          1,
        )}:1 contrast.`,
        "Increase foreground/background contrast to an accessible level.",
      );
    }

    for (
      const item of (
        accessibility.invalidTabIndexes ?? []
      ).slice(0, 6)
    ) {
      add(
        "invalid_tab_index",
        "advice",
        `A control uses a positive tabindex: ${item}.`,
        "Prefer natural DOM order and avoid positive tabindex values.",
      );
    }

    for (
      const item of (
        accessibility.focusVisibleMissing ?? []
      ).slice(0, 6)
    ) {
      add(
        "missing_focus_indicator",
        "advice",
        `A keyboard-focusable control appears to lack a visible focus indicator: ${item}.`,
        "Provide a strong :focus-visible state.",
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* PERFORMANCE                                                             */
  /* ---------------------------------------------------------------------- */

  const performance = measurement.performance;

  if (performance) {
    if (
      performance.lcp !== null &&
      performance.lcp > 4000
    ) {
      add(
        "slow_main_content",
        "advice",
        `Largest contentful paint took approximately ${(
          performance.lcp / 1000
        ).toFixed(1)}s.`,
        "Optimize the largest visual/content element and reduce render-blocking work.",
      );
    }

    if (
      performance.cls !== null &&
      performance.cls > 0.1
    ) {
      add(
        "layout_shift",
        "advice",
        `The page has measurable layout movement with CLS ${performance.cls.toFixed(
          2,
        )}.`,
        "Reserve space for images, fonts and dynamic content before they render.",
      );
    }

    if (
      performance.ttfb !== null &&
      performance.ttfb > 1500
    ) {
      add(
        "slow_server_response",
        "advice",
        `Initial server response took approximately ${(
          performance.ttfb / 1000
        ).toFixed(1)}s.`,
        "Investigate server response time, caching, database work and deployment configuration.",
      );
    }

    if (performance.failedRequests > 0) {
      add(
        "failed_requests",
        "p0",
        `${performance.failedRequests} network resource(s) failed to load.`,
        "Repair, replace or remove the failed resources.",
      );
    }

    if (performance.imageBytes > 3_000_000) {
      add(
        "heavy_images",
        "advice",
        `Images transferred approximately ${(
          performance.imageBytes / 1_000_000
        ).toFixed(1)}MB.`,
        "Compress images and serve appropriately sized responsive formats.",
      );
    }

    if (performance.scriptBytes > 2_500_000) {
      add(
        "heavy_scripts",
        "advice",
        `JavaScript transferred approximately ${(
          performance.scriptBytes / 1_000_000
        ).toFixed(1)}MB.`,
        "Split bundles, remove unnecessary dependencies and lazy-load noncritical functionality.",
      );
    }

    if (performance.fontBytes > 1_000_000) {
      add(
        "heavy_fonts",
        "advice",
        `Fonts transferred approximately ${(
          performance.fontBytes / 1_000_000
        ).toFixed(1)}MB.`,
        "Load fewer font files and only the weights actually required.",
      );
    }

    if (performance.renderBlocking > 5) {
      add(
        "render_blocking",
        "advice",
        `${performance.renderBlocking} resources were reported as render-blocking.`,
        "Reduce render-blocking resources and defer noncritical work.",
      );
    }

    if (
      performance.thirdPartyResources !== undefined &&
      performance.thirdPartyResources > 15
    ) {
      add(
        "third_party_overhead",
        "advice",
        `${performance.thirdPartyResources} third-party resources were detected.`,
        "Remove unnecessary third-party scripts and defer optional integrations.",
      );
    }

    for (
      const image of (
        performance.oversizedImages ?? []
      ).slice(0, 6)
    ) {
      add(
        "oversized_image",
        "advice",
        `An image is substantially larger than its rendered space: ${image}.`,
        "Serve an appropriately sized responsive image.",
      );
    }
  }

  return dedupeFindings(findings);
}

/* -------------------------------------------------------------------------- */
/* FINDING SCORING                                                            */
/* -------------------------------------------------------------------------- */

function scoreFindings(
  findings: VisualFinding[],
): number {
  if (findings.length === 0) {
    return 100;
  }

  const p0 = new Set(
    findings
      .filter((finding) => finding.severity === "p0")
      .map((finding) => {
        return [
          finding.page ?? "",
          finding.key,
          finding.detail
            .replace(/\d+(?:\.\d+)?/g, "#")
            .trim(),
        ].join("|");
      }),
  );

  const advice = new Set(
    findings
      .filter((finding) => finding.severity === "advice")
      .map((finding) => {
        return [
          finding.page ?? "",
          finding.key,
          finding.detail
            .replace(/\d+(?:\.\d+)?/g, "#")
            .trim(),
        ].join("|");
      }),
  );

  return clampScore(
    100 -
      p0.size * SCORE_P0_PENALTY -
      advice.size * SCORE_ADVICE_PENALTY,
  );
}

/* -------------------------------------------------------------------------- */
/* SINGLE-PAGE REPORT                                                         */
/* -------------------------------------------------------------------------- */

export function gradeVisual(
  measurements: ViewportMeasurement[],
  page?: string,
): VisualReport {
  if (
    !Array.isArray(measurements) ||
    measurements.length === 0
  ) {
    return {
      score: 0,
      passed: false,
      findings: [
        {
          key: "not_measured",
          severity: "p0",
          detail:
            "The page has not been measured in a real browser.",
          fix:
            "Run the visual measurement at the required viewport widths.",
          width: 0,
          ...(page ? { page } : {}),
        },
      ],
      widths: [],
      ...(page ? { pages: [page] } : {}),
      coverage: {
        accessibility: false,
        performance: false,
      },
    };
  }

  const valid = measurements.filter(
    (measurement) =>
      numberOrZero(measurement.width) > 0,
  );

  if (valid.length === 0) {
    return {
      score: 0,
      passed: false,
      findings: [
        {
          key: "not_measured",
          severity: "p0",
          detail:
            "No valid viewport measurements were returned by the browser.",
          fix:
            "Run the browser measurement again and return valid viewport data.",
          width: 0,
          ...(page ? { page } : {}),
        },
      ],
      widths: [],
      ...(page ? { pages: [page] } : {}),
      coverage: {
        accessibility: false,
        performance: false,
      },
    };
  }

  const findings = dedupeFindings(
    valid.flatMap(gradeViewport).map((finding) =>
      page
        ? {
            ...finding,
            page,
          }
        : finding,
    ),
  );

  const widths = uniqueNumbers(
    valid.map((measurement) =>
      numberOrZero(measurement.width),
    ),
  ).sort((a, b) => a - b);

  const accessibility = valid.some(
    (measurement) =>
      !!measurement.accessibility,
  );

  const performance = valid.some(
    (measurement) =>
      !!measurement.performance,
  );

  return {
    score: scoreFindings(findings),
    passed: !findings.some(
      (finding) => finding.severity === "p0",
    ),
    findings,
    widths,
    ...(page ? { pages: [page] } : {}),
    coverage: {
      accessibility,
      performance,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* WHOLE-SITE REPORT                                                          */
/* -------------------------------------------------------------------------- */

export function gradeSite(
  expectedPages: string[],
  reports: {
    page: string;
    report: VisualReport;
  }[],
): VisualReport {
  const expected = uniqueStrings(expectedPages);

  const reportMap = new Map<string, VisualReport>();

  for (const entry of reports ?? []) {
    if (!entry?.page) {
      continue;
    }

    reportMap.set(entry.page, entry.report);
  }

  const findings: VisualFinding[] = [];
  const widthSet = new Set<number>();
  const pages: string[] = [];

  let accessibility =
    expected.length > 0;

  let performance =
    expected.length > 0;

  /* ---------------------------------------------------------------------- */
  /* PAGE COVERAGE                                                           */
  /* ---------------------------------------------------------------------- */

  for (const page of expected) {
    const report = reportMap.get(page);

    if (
      !report ||
      !Array.isArray(report.widths) ||
      report.widths.length === 0
    ) {
      findings.push({
        key: "page_not_measured",
        severity: "p0",
        detail:
          `“${page}” has not been measured in a real browser.`,
        fix:
          "Measure this visitor-visible page before allowing the site to pass.",
        width: 0,
        page,
      });

      accessibility = false;
      performance = false;
      continue;
    }

    pages.push(page);

    for (const width of report.widths) {
      widthSet.add(width);
    }

    for (const finding of report.findings ?? []) {
      findings.push({
        ...finding,
        page,
      });
    }

    if (!report.coverage?.accessibility) {
      accessibility = false;
    }

    if (!report.coverage?.performance) {
      performance = false;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* REQUIRED WIDTH COVERAGE                                                 */
  /* ---------------------------------------------------------------------- */

  if (pages.length > 0) {
    const missingWidths = VIEWPORTS.filter(
      (width) => !widthSet.has(width),
    );

    if (missingWidths.length > 0) {
      findings.push({
        key: "widths_not_measured",
        severity: "p0",
        detail:
          `The website was not checked at ${missingWidths.join(
            ", ",
          )}px.`,
        fix:
          "Measure every required viewport width before treating responsive behavior as proven.",
        width: 0,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* EMPTY SITE                                                              */
  /* ---------------------------------------------------------------------- */

  if (expected.length === 0) {
    findings.push({
      key: "not_measured",
      severity: "p0",
      detail:
        "There are no visitor-visible pages available to measure.",
      fix:
        "Build or publish visitor-visible pages before running the visual quality gate.",
      width: 0,
    });
  }

  const unique = dedupeFindings(findings);

  return {
    score: scoreFindings(unique),
    passed: !unique.some(
      (finding) => finding.severity === "p0",
    ),
    findings: unique,
    widths: [...widthSet].sort((a, b) => a - b),
    pages,
    coverage: {
      accessibility,
      performance,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* BROWSER MEASUREMENT SCRIPT                                                 */
/* -------------------------------------------------------------------------- */

/**
 * This script is intentionally dependency-free JavaScript.
 *
 * It runs INSIDE the actual rendered website.
 *
 * It does not attempt to create a subjective "AI visual score".
 * It measures concrete browser evidence that the TypeScript grader can judge.
 */
export const MEASURE_SCRIPT = `(() => {
  const width = window.innerWidth;

  const label = (el) => {
    if (!el) return "unknown";

    const tag =
      (el.tagName || "element").toLowerCase();

    const id =
      el.id
        ? "#" + String(el.id).slice(0, 30)
        : "";

    const className =
      typeof el.className === "string"
        ? el.className.trim().split(/\\s+/)[0]
        : "";

    const cls =
      className
        ? "." + className.slice(0, 30)
        : "";

    return (
      tag +
      id +
      cls
    ).slice(0, 100);
  };

  const visible = (el) => {
    if (!el) return false;

    // Deliberately hidden from assistive technology (spam traps, decoration).
    // Judging these as real controls produced false failures.
    if (el.closest('[aria-hidden="true"]')) {
      return false;
    }

    const style =
      getComputedStyle(el);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.contentVisibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const box =
      el.getBoundingClientRect();

    return (
      box.width > 0 &&
      box.height > 0
    );
  };

  const all = [
    ...document.querySelectorAll("body *")
  ].filter(visible);

  const controls = [
    ...document.querySelectorAll(
      "a[href], button, [role='button'], input, select, textarea, summary"
    )
  ].filter(
    (el) =>
      // A switched-off control is correctly skipped by the keyboard, so it is
      // not a keyboard defect.
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-disabled") !== "true" &&
      visible(el)
  );

  /* ---------------------------------------------------------------------- */
  /* OVERFLOW                                                                */
  /* ---------------------------------------------------------------------- */

  const containedOverflow = (el) => {
    if (
      getComputedStyle(el).pointerEvents === "none"
    ) {
      return true;
    }

    let parent = el.parentElement;

    while (
      parent &&
      parent !== document.documentElement
    ) {
      const style =
        getComputedStyle(parent);

      if (
        style.overflowX !== "visible" ||
        style.overflow !== "visible"
      ) {
        return true;
      }

      parent = parent.parentElement;
    }

    return false;
  };

  const overflowing = all
    .filter((el) => {
      const box =
        el.getBoundingClientRect();

      return (
        box.right > width + 1 &&
        !containedOverflow(el)
      );
    })
    .slice(0, 12)
    .map((el) => ({
      selector: label(el),
      right: Math.round(
        el.getBoundingClientRect().right
      )
    }));

  /* ---------------------------------------------------------------------- */
  /* BROKEN IMAGES                                                           */
  /* ---------------------------------------------------------------------- */

  const brokenImages = [
    ...document.images
  ]
    .filter(
      (img) =>
        !img.complete ||
        img.naturalWidth === 0
    )
    .slice(0, 12)
    .map((img) =>
      (
        img.currentSrc ||
        img.src ||
        label(img)
      ).slice(0, 140)
    );

  /* ---------------------------------------------------------------------- */
  /* CLIPPED TEXT                                                            */
  /* ---------------------------------------------------------------------- */

  const clipped = all
    .filter(
      (el) =>
        el.childElementCount === 0 &&
        (el.textContent || "").trim().length > 0
    )
    .filter((el) => {
      const style =
        getComputedStyle(el);

      return (
        (
          style.overflowX === "hidden" &&
          el.scrollWidth > el.clientWidth + 2
        ) ||
        (
          style.overflowY === "hidden" &&
          el.scrollHeight > el.clientHeight + 2
        )
      );
    })
    .slice(0, 12)
    .map((el) =>
      (el.textContent || "")
        .trim()
        .slice(0, 80)
    );

  /* ---------------------------------------------------------------------- */
  /* TOUCH TARGETS                                                           */
  /* ---------------------------------------------------------------------- */

  const smallTargets = controls
    .filter((el) => {
      const style =
        getComputedStyle(el);

      /*
       * Inline text links are allowed to be smaller than button controls.
       */
      return (
        style.display !== "inline" &&
        style.visibility !== "hidden"
      );
    })
    .map((el) => ({
      el,
      box: el.getBoundingClientRect()
    }))
    .filter(({ box }) =>
      box.width > 0 &&
      box.height > 0 &&
      (
        box.width < 44 ||
        box.height < 44
      )
    )
    .slice(0, 12)
    .map(({ el, box }) => ({
      selector: label(el),
      width: box.width,
      height: box.height
    }));

  /* ---------------------------------------------------------------------- */
  /* TINY TEXT                                                               */
  /* ---------------------------------------------------------------------- */

  const tinyText = all
    .filter(
      (el) =>
        el.childElementCount === 0 &&
        (el.textContent || "").trim().length > 20
    )
    .map((el) => ({
      el,
      size:
        parseFloat(
          getComputedStyle(el).fontSize
        ) || 16
    }))
    .filter(({ el, size }) => {
      const style =
        getComputedStyle(el);

      return (
        size > 0 &&
        size < 13 &&
        style.textTransform !== "uppercase"
      );
    })
    .slice(0, 12)
    .map(({ el, size }) => ({
      selector: label(el),
      fontSize: size
    }));

  /* ---------------------------------------------------------------------- */
  /* UNREACHABLE CONTROLS                                                    */
  /* ---------------------------------------------------------------------- */

  const unreachable = controls
    .filter((el) => {
      const box =
        el.getBoundingClientRect();

      if (
        box.right < 0 ||
        box.left > width ||
        box.bottom < 0 ||
        box.top > window.innerHeight
      ) {
        return false;
      }

      const x = Math.min(
        width - 1,
        Math.max(
          1,
          box.left + box.width / 2
        )
      );

      const y = Math.min(
        window.innerHeight - 1,
        Math.max(
          1,
          box.top + box.height / 2
        )
      );

      const hit =
        document.elementFromPoint(x, y);

      if (
        !hit ||
        el.contains(hit) ||
        hit.contains(el)
      ) {
        return false;
      }

      let parent = hit;

      while (
        parent &&
        parent !== document.documentElement
      ) {
        const style =
          getComputedStyle(parent);

        if (
          style.position === "fixed" ||
          style.position === "sticky"
        ) {
          return false;
        }

        parent =
          parent.parentElement;
      }

      return true;
    })
    .slice(0, 12)
    .map(label);

  /* ---------------------------------------------------------------------- */
  /* CTA DETECTION                                                           */
  /* ---------------------------------------------------------------------- */

  const actionWords =
    /call|book|quote|contact|get started|start now|enquir|inquir|estimate|schedule|request|available|see services|message|email|apply|hire|order|reserve|consult|learn more|shop|buy/i;

  const ctaControls =
    controls.filter((el) => {
      const href =
        (
          el.getAttribute("href") ||
          ""
        ).trim();

      const text =
        (
          (el.textContent || "") +
          " " +
          (
            el.getAttribute("aria-label") ||
            ""
          )
        ).trim();

      const box =
        el.getBoundingClientRect();

      if (
        box.width < 20 ||
        box.height < 20
      ) {
        return false;
      }

      const conversionTarget =
        /^(tel:|mailto:|sms:)/i.test(href) ||
        /book|quote|contact|schedul|estimate|appoint|start|reserve|consult|shop|buy|checkout/i.test(
          href
        );

      return (
        conversionTarget ||
        (
          actionWords.test(text) &&
          (
            href.length > 1 ||
            el.tagName === "BUTTON" ||
            el.getAttribute("role") === "button"
          )
        )
      );
    });

  const ctas =
    ctaControls.length;

  /* ---------------------------------------------------------------------- */
  /* DEAD LINKS                                                              */
  /* ---------------------------------------------------------------------- */

  const deadControls =
    controls
      .filter((el) => {
        if (el.tagName !== "A") {
          return false;
        }

        const href =
          (
            el.getAttribute("href") ||
            ""
          ).trim();

        return (
          href === "" ||
          href === "#" ||
          /^javascript:/i.test(href)
        );
      })
      .slice(0, 12)
      .map(label);

  /* ---------------------------------------------------------------------- */
  /* DISTORTED IMAGES                                                        */
  /* ---------------------------------------------------------------------- */

  const distortedImages =
    [...document.images]
      .filter(visible)
      .filter((img) => {
        if (
          !img.naturalWidth ||
          !img.naturalHeight
        ) {
          return false;
        }

        const box =
          img.getBoundingClientRect();

        if (
          box.width < 40 ||
          box.height < 40
        ) {
          return false;
        }

        const natural =
          img.naturalWidth /
          img.naturalHeight;

        const shown =
          box.width /
          box.height;

        const objectFit =
          getComputedStyle(img).objectFit;

        if (
          objectFit !== "fill"
        ) {
          return false;
        }

        return (
          Math.abs(
            natural - shown
          ) / natural > 0.15
        );
      })
      .slice(0, 12)
      .map((img) =>
        (
          img.currentSrc ||
          img.src ||
          label(img)
        ).slice(0, 140)
      );

  /* ---------------------------------------------------------------------- */
  /* OVERLAPPING TEXT                                                        */
  /* ---------------------------------------------------------------------- */

  const textBlocks =
    all
      .filter(
        (el) =>
          el.childElementCount === 0 &&
          (el.textContent || "").trim().length > 24
      )
      .filter(
        (el) =>
          getComputedStyle(el).position === "static"
      )
      .slice(0, 160);

  const overlapping = [];

  for (
    let i = 0;
    i < textBlocks.length &&
    overlapping.length < 6;
    i++
  ) {
    for (
      let j = i + 1;
      j < textBlocks.length;
      j++
    ) {
      const a =
        textBlocks[i].getBoundingClientRect();

      const b =
        textBlocks[j].getBoundingClientRect();

      if (
        textBlocks[i].contains(textBlocks[j]) ||
        textBlocks[j].contains(textBlocks[i])
      ) {
        continue;
      }

      const overlapX =
        Math.min(a.right, b.right) -
        Math.max(a.left, b.left);

      const overlapY =
        Math.min(a.bottom, b.bottom) -
        Math.max(a.top, b.top);

      if (
        overlapX > 12 &&
        overlapY > 12
      ) {
        overlapping.push(
          (
            label(textBlocks[i]) +
            " / " +
            label(textBlocks[j])
          ).slice(0, 140)
        );

        break;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* NARROW COLUMNS                                                          */
  /* ---------------------------------------------------------------------- */

  const narrowColumns =
    all
      .filter(
        (el) =>
          el.childElementCount === 0 &&
          (el.textContent || "").trim().length > 80
      )
      .filter((el) => {
        const box =
          el.getBoundingClientRect();

        const fontSize =
          parseFloat(
            getComputedStyle(el).fontSize
          ) || 16;

        return (
          box.width > 0 &&
          box.width <
            Math.min(180, fontSize * 12) &&
          width >= 360
        );
      })
      .slice(0, 6)
      .map(label);

  /* ---------------------------------------------------------------------- */
  /* FIXED BOTTOM BARS                                                       */
  /* ---------------------------------------------------------------------- */

  const fixedBars =
    all.filter((el) => {
      const style =
        getComputedStyle(el);

      if (style.position !== "fixed") {
        return false;
      }

      const box =
        el.getBoundingClientRect();

      return (
        box.height > 0 &&
        box.bottom >
          window.innerHeight - 8 &&
        box.width > width * 0.5
      );
    });

  const stickyFooterHeight =
    fixedBars.reduce(
      (max, el) =>
        Math.max(
          max,
          el.getBoundingClientRect().height
        ),
      0
    );

  /* ---------------------------------------------------------------------- */
  /* NAVIGATION                                                              */
  /* ---------------------------------------------------------------------- */

  const menuButton =
    [
      ...document.querySelectorAll(
        "button, [role='button']"
      )
    ].some((el) => {
      if (!visible(el)) {
        return false;
      }

      const text =
        (
          el.getAttribute("aria-label") ||
          ""
        ) +
        " " +
        (el.textContent || "");

      return /menu|navigation|open/i.test(text);
    });

  const inlineNav =
    [
      ...document.querySelectorAll(
        "nav a[href]"
      )
    ].filter(visible).length >= 2;

  const navigable =
    width > 500
      ? inlineNav || menuButton
      : menuButton || inlineNav;

  /* ---------------------------------------------------------------------- */
  /* ACCESSIBLE NAMES                                                        */
  /* ---------------------------------------------------------------------- */

  const named = (el) => {
    const text =
      (el.textContent || "").trim();

    const aria =
      (
        el.getAttribute("aria-label") ||
        ""
      ).trim();

    const title =
      (
        el.getAttribute("title") ||
        ""
      ).trim();

    const labelledBy =
      (
        el.getAttribute("aria-labelledby") ||
        ""
      ).trim();

    return (
      text.length > 0 ||
      aria.length > 0 ||
      title.length > 0 ||
      (
        labelledBy.length > 0 &&
        !!document.getElementById(labelledBy)
      ) ||
      !!el.querySelector(
        'img[alt]:not([alt=""])'
      )
    );
  };

  /* ---------------------------------------------------------------------- */
  /* IMAGE ALT                                                               */
  /* ---------------------------------------------------------------------- */

  const imagesMissingAlt =
    [...document.images]
      .filter(visible)
      .filter((img) => {
        return (
          img.getAttribute("alt") === null &&
          img.getAttribute("role") !== "presentation" &&
          !img.getAttribute("aria-hidden")
        );
      })
      .slice(0, 12)
      .map((img) =>
        (
          img.currentSrc ||
          img.src ||
          label(img)
        ).slice(0, 140)
      );

  /* ---------------------------------------------------------------------- */
  /* UNLABELED CONTROLS                                                      */
  /* ---------------------------------------------------------------------- */

  const unlabeledControls =
    controls
      .filter(
        (el) =>
          (
            el.tagName === "A" ||
            el.tagName === "BUTTON" ||
            el.getAttribute("role") === "button"
          ) &&
          !named(el)
      )
      .slice(0, 12)
      .map(label);

  /* ---------------------------------------------------------------------- */
  /* FORM LABELS                                                             */
  /* ---------------------------------------------------------------------- */

  const fields =
    [
      ...document.querySelectorAll(
        "input:not([type='hidden']), select, textarea"
      )
    ].filter(visible);

  const unlabeledInputs =
    fields
      .filter((el) => {
        if (
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          el.getAttribute("title")
        ) {
          return false;
        }

        if (
          el.id &&
          document.querySelector(
            'label[for="' +
              el.id.replace(/"/g, "") +
              '"]'
          )
        ) {
          return false;
        }

        return !el.closest("label");
      })
      .slice(0, 12)
      .map(label);

  /* ---------------------------------------------------------------------- */
  /* HEADING ORDER                                                           */
  /* ---------------------------------------------------------------------- */

  const headings =
    [
      ...document.querySelectorAll(
        "h1,h2,h3,h4,h5,h6"
      )
    ].filter(visible);

  const headingOrderProblems = [];

  let previousLevel = 0;

  for (const heading of headings) {
    const level =
      Number(
        heading.tagName.slice(1)
      );

    if (
      previousLevel &&
      level > previousLevel + 1
    ) {
      headingOrderProblems.push(
        (
          heading.textContent ||
          label(heading)
        )
          .trim()
          .slice(0, 80)
      );
    }

    previousLevel = level;
  }

  /* ---------------------------------------------------------------------- */
  /* KEYBOARD                                                                */
  /* ---------------------------------------------------------------------- */

  const focusable =
    controls.filter((el) => {
      const tabindex =
        el.getAttribute("tabindex");

      if (
        tabindex !== null &&
        Number(tabindex) < 0
      ) {
        return false;
      }

      if (el.hasAttribute("disabled")) {
        return false;
      }

      if (el.tagName === "A") {
        return !!(
          el.getAttribute("href") ||
          ""
        ).trim();
      }

      if (
        el.tagName === "BUTTON" ||
        el.tagName === "INPUT" ||
        el.tagName === "SELECT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SUMMARY"
      ) {
        // Natively focusable: no tabindex needed.
        return true;
      }

      return (
        tabindex !== null &&
        Number(tabindex) >= 0
      );
    });

  const invalidTabIndexes =
    controls
      .filter((el) => {
        const tabindex =
          el.getAttribute("tabindex");

        return (
          tabindex !== null &&
          Number(tabindex) > 0
        );
      })
      .slice(0, 8)
      .map(label);

  /* ---------------------------------------------------------------------- */
  /* COLOR PARSING                                                           */
  /* ---------------------------------------------------------------------- */

  const parseColor = (value) => {
    if (!value) {
      return null;
    }

    const rgbMatch =
      value.match(
        /^rgba?\\(([^)]+)\\)$/i
      );

    if (!rgbMatch) {
      return null;
    }

    const parts =
      rgbMatch[1]
        .split(",")
        .map((part) => parseFloat(part.trim()));

    if (parts.length < 3) {
      return null;
    }

    if (
      parts.length >= 4 &&
      parts[3] === 0
    ) {
      return null;
    }

    return parts.slice(0, 3);
  };

  const luminance = (rgb) => {
    const channels =
      rgb.map((value) => {
        const normalized =
          value / 255;

        return normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow(
              (normalized + 0.055) / 1.055,
              2.4
            );
      });

    return (
      0.2126 * channels[0] +
      0.7152 * channels[1] +
      0.0722 * channels[2]
    );
  };

  const backgroundOf = (el) => {
    let node = el;

    while (
      node &&
      node !== document.documentElement
    ) {
      const rgb =
        parseColor(
          getComputedStyle(node).backgroundColor
        );

      if (rgb) {
        return rgb;
      }

      node = node.parentElement;
    }

    return [255, 255, 255];
  };

  const lowContrast =
    all
      .filter(
        (el) =>
          el.childElementCount === 0 &&
          (el.textContent || "").trim().length > 12
      )
      .slice(0, 100)
      .map((el) => {
        const style =
          getComputedStyle(el);

        const foreground =
          parseColor(style.color);

        if (!foreground) {
          return null;
        }

        const background =
          backgroundOf(el);

        const foregroundLum =
          luminance(foreground);

        const backgroundLum =
          luminance(background);

        const ratio =
          (
            Math.max(
              foregroundLum,
              backgroundLum
            ) + 0.05
          ) /
          (
            Math.min(
              foregroundLum,
              backgroundLum
            ) + 0.05
          );

        const size =
          parseFloat(style.fontSize) || 16;

        const bold =
          Number(style.fontWeight) >= 700;

        const large =
          size >= 24 ||
          (
            bold &&
            size >= 18.66
          );

        return ratio <
          (
            large
              ? 3
              : 4.5
          )
          ? {
              selector: label(el),
              ratio:
                Math.round(ratio * 100) / 100
            }
          : null;
      })
      .filter(Boolean)
      .slice(0, 12);

  /* ---------------------------------------------------------------------- */
  /* ACCESSIBILITY RESULT                                                    */
  /* ---------------------------------------------------------------------- */

  const viewportMeta =
    document.querySelector(
      'meta[name="viewport"]'
    );

  const viewportContent =
    viewportMeta
      ? (
          viewportMeta.getAttribute("content") ||
          ""
        )
      : "";

  const accessibility = {
    imagesMissingAlt,
    unlabeledControls,
    unlabeledInputs,
    headingOrderProblems:
      headingOrderProblems.slice(0, 6),
    h1Count:
      [
        ...document.querySelectorAll("h1")
      ].filter(visible).length,
    hasMain:
      !!document.querySelector(
        "main, [role='main']"
      ),
    hasNav:
      !!document.querySelector(
        "nav, [role='navigation']"
      ),
    controls: controls.length,
    keyboardReachable: focusable.length,
    lowContrast,
    zoomBlocked:
      /user-scalable\\s*=\\s*no/i.test(
        viewportContent
      ) ||
      /maximum-scale\\s*=\\s*1(?:\\.0)?\\b/i.test(
        viewportContent
      ),
    invalidTabIndexes,
    focusVisibleMissing: []
  };

  /* ---------------------------------------------------------------------- */
  /* PERFORMANCE                                                             */
  /* ---------------------------------------------------------------------- */

  const entries = (type) => {
    try {
      return performance.getEntriesByType(type);
    } catch {
      return [];
    }
  };

  const navigation =
    entries("navigation")[0] || null;

  const paint =
    entries("paint").find(
      (entry) =>
        entry.name === "first-contentful-paint"
    ) || null;

  const lcpEntries =
    entries("largest-contentful-paint");

  const resources =
    entries("resource");

  const bytes = (filter) =>
    resources
      .filter(filter)
      .reduce(
        (total, resource) =>
          total +
          (
            resource.transferSize ||
            resource.encodedBodySize ||
            0
          ),
        0
      );

  const cls =
    window.__revoraCls === undefined
      ? null
      : window.__revoraCls;

  const oversizedImages =
    [...document.images]
      .filter(
        (img) =>
          img.naturalWidth > 0
      )
      .filter((img) => {
        const box =
          img.getBoundingClientRect();

        if (
          box.width <= 0 ||
          box.height <= 0
        ) {
          return false;
        }

        const dpr =
          window.devicePixelRatio || 1;

        return (
          img.naturalWidth >
          box.width * dpr * 2.2
        );
      })
      .slice(0, 8)
      .map((img) =>
        (
          img.currentSrc ||
          img.src ||
          label(img)
        ).slice(0, 140)
      );

  const performanceMeasurement = {
    ttfb:
      navigation
        ? Math.round(
            navigation.responseStart
          )
        : null,

    fcp:
      paint
        ? Math.round(
            paint.startTime
          )
        : null,

    lcp:
      lcpEntries.length
        ? Math.round(
            lcpEntries[
              lcpEntries.length - 1
            ].startTime
          )
        : null,

    cls:
      typeof cls === "number"
        ? Math.round(cls * 1000) / 1000
        : null,

    /*
     * Keep null unless a reliable INP observer has supplied data.
     */
    inp: null,

    longTasks:
      entries("longtask").length || null,

    resources: resources.length,

    scriptBytes:
      bytes(
        (resource) =>
          resource.initiatorType === "script" ||
          /\\.js(?:\\?|$)/i.test(
            resource.name
          )
      ),

    imageBytes:
      bytes(
        (resource) =>
          resource.initiatorType === "img" ||
          /\\.(?:png|jpe?g|webp|avif|gif|svg)(?:\\?|$)/i.test(
            resource.name
          )
      ),

    fontBytes:
      bytes(
        (resource) =>
          /\\.(?:woff2?|ttf|otf)(?:\\?|$)/i.test(
            resource.name
          )
      ),

    cssBytes:
      bytes(
        (resource) =>
          resource.initiatorType === "link" ||
          /\\.css(?:\\?|$)/i.test(
            resource.name
          )
      ),

    documentBytes:
      navigation
        ? (
            navigation.transferSize ||
            navigation.encodedBodySize ||
            0
          )
        : 0,

    thirdPartyResources:
      resources.filter((resource) => {
        try {
          return (
            new URL(resource.name).origin !==
            window.location.origin
          );
        } catch {
          return false;
        }
      }).length,

    failedRequests:
      resources.filter(
        (resource) =>
          (
            resource.responseStatus ||
            0
          ) >= 400
      ).length,

    oversizedImages,

    renderBlocking:
      resources.filter(
        (resource) =>
          resource.renderBlockingStatus ===
          "blocking"
      ).length
  };

  /* ---------------------------------------------------------------------- */
  /* FINAL MEASUREMENT                                                       */
  /* ---------------------------------------------------------------------- */

  return {
    width,

    scrollWidth:
      Math.max(
        document.documentElement.scrollWidth,
        document.body
          ? document.body.scrollWidth
          : 0
      ),

    overflowing,
    brokenImages,
    clipped,
    smallTargets,
    tinyText,
    unreachable,
    navigable,
    ctas,
    deadControls,
    distortedImages,
    overlapping,
    narrowColumns,
    stickyFooterHeight,
    accessibility,
    performance: performanceMeasurement
  };
})()`;

/* -------------------------------------------------------------------------- */
/* CLS OBSERVER                                                               */
/* -------------------------------------------------------------------------- */

export const OBSERVE_SCRIPT = `(() => {
  if (window.__revoraClsInstalled) {
    return true;
  }

  window.__revoraClsInstalled = true;
  window.__revoraCls = 0;

  try {
    new PerformanceObserver((list) => {
      for (
        const entry of list.getEntries()
      ) {
        if (!entry.hadRecentInput) {
          window.__revoraCls +=
            entry.value;
        }
      }
    }).observe({
      type: "layout-shift",
      buffered: true
    });
  } catch {
    window.__revoraCls = undefined;
  }

  return true;
})()`;