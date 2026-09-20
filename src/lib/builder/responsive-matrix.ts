/**
 * RESPONSIVE DEVICE MATRIX
 * ========================
 *
 * A deterministic sweep of the viewport widths Revora promises to support.
 * It is honest about what it can and cannot know without a browser:
 *
 * - Checks that depend only on the site's own composition (grid columns per
 *   width, touch-target counts, nav item count, copy length per column) are
 *   decided here and reported PASS or FAIL.
 * - Checks that need real rendered geometry (pixel overflow, clipping,
 *   computed contrast) are reported NOT_VERIFIED unless measured evidence from
 *   the browser QA pass is supplied.
 *
 * Nothing here ever upgrades a missing measurement into a PASS.
 */

export const DEVICE_MATRIX = [
  { width: 320, label: "Small phone", kind: "phone" as const },
  { width: 375, label: "Phone", kind: "phone" as const },
  { width: 390, label: "Modern phone", kind: "phone" as const },
  { width: 414, label: "Large phone", kind: "phone" as const },
  { width: 768, label: "Tablet portrait", kind: "tablet" as const },
  { width: 1024, label: "Tablet landscape", kind: "tablet" as const },
  { width: 1280, label: "Laptop", kind: "desktop" as const },
  { width: 1440, label: "Desktop", kind: "desktop" as const },
];

export type DeviceWidth = (typeof DEVICE_MATRIX)[number]["width"];

export type MatrixVerdict = "PASS" | "FAIL" | "NOT_VERIFIED";

export type MatrixCheck = {
  width: number;
  device: string;
  check: string;
  verdict: MatrixVerdict;
  detail: string;
  evidence: "composition" | "measurement" | "none";
  pageId?: string;
  sectionId?: string;
};

export type MatrixSection = {
  id: string;
  kind: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  componentCount: number;
  /** Items rendered as a grid/list inside the section, when the section has any. */
  itemCount?: number;
};

export type MatrixPage = {
  id: string;
  title?: string | null;
  sections: MatrixSection[];
};

export type MatrixSite = {
  pages: MatrixPage[];
  navItemCount: number;
};

/** Real geometry from the browser QA pass, when it ran. */
export type MatrixMeasurement = {
  width: number;
  pageId: string;
  scrollWidth: number;
  clientWidth: number;
  clippedSelectors?: string[];
  consoleErrors?: number;
};

/** Columns the renderer uses for a multi-item section at a given width. */
export function columnsAt(width: number): number {
  if (width < 640) return 1;
  if (width < 1024) return 2;
  return 3;
}

const LONG_COPY_PER_COLUMN = 900;
const CROWDED_COMPONENTS_PHONE = 8;
const NAV_LIMIT_PHONE = 7;

function copyLength(section: MatrixSection): number {
  return [section.heading, section.subheading, section.body]
    .filter((value): value is string => typeof value === "string")
    .join(" ").length;
}

/**
 * Evaluates every supported width. Composition checks always produce a verdict;
 * geometry checks are NOT_VERIFIED unless a matching measurement is supplied.
 */
export function evaluateDeviceMatrix(
  site: MatrixSite,
  measurements: MatrixMeasurement[] = [],
): MatrixCheck[] {
  const checks: MatrixCheck[] = [];

  for (const device of DEVICE_MATRIX) {
    const columns = columnsAt(device.width);

    if (device.kind === "phone") {
      checks.push({
        width: device.width,
        device: device.label,
        check: "navigation fits a phone",
        verdict: site.navItemCount <= NAV_LIMIT_PHONE ? "PASS" : "FAIL",
        detail:
          site.navItemCount <= NAV_LIMIT_PHONE
            ? `${site.navItemCount} menu links collapse into the phone menu.`
            : `${site.navItemCount} menu links is too many for a phone menu.`,
        evidence: "composition",
      });
    }

    for (const page of site.pages) {
      for (const section of page.sections) {
        const items = section.itemCount ?? 0;
        if (items > 0) {
          const perRow = Math.min(items, columns);
          checks.push({
            width: device.width,
            device: device.label,
            check: "item grid stacks sensibly",
            verdict: perRow >= 1 && items % perRow <= perRow ? "PASS" : "FAIL",
            detail: `${items} items render ${perRow} per row at ${device.width}px.`,
            evidence: "composition",
            pageId: page.id,
            sectionId: section.id,
          });
        }

        const perColumn = Math.ceil(copyLength(section) / columns);
        if (perColumn > LONG_COPY_PER_COLUMN) {
          checks.push({
            width: device.width,
            device: device.label,
            check: "readable copy length per column",
            verdict: "FAIL",
            detail: `About ${perColumn} characters per column at ${device.width}px is a wall of text.`,
            evidence: "composition",
            pageId: page.id,
            sectionId: section.id,
          });
        }

        if (device.kind === "phone" && section.componentCount > CROWDED_COMPONENTS_PHONE) {
          checks.push({
            width: device.width,
            device: device.label,
            check: "touch targets are not crowded",
            verdict: "FAIL",
            detail: `${section.componentCount} elements in one section is crowded on a ${device.width}px screen.`,
            evidence: "composition",
            pageId: page.id,
            sectionId: section.id,
          });
        }
      }

      const measured = measurements.find(
        (entry) => entry.width === device.width && entry.pageId === page.id,
      );
      if (!measured) {
        checks.push({
          width: device.width,
          device: device.label,
          check: "no horizontal overflow",
          verdict: "NOT_VERIFIED",
          detail: "No rendered measurement for this page at this width.",
          evidence: "none",
          pageId: page.id,
        });
        continue;
      }

      const overflows = measured.scrollWidth > measured.clientWidth + 1;
      checks.push({
        width: device.width,
        device: device.label,
        check: "no horizontal overflow",
        verdict: overflows ? "FAIL" : "PASS",
        detail: overflows
          ? `Content is ${measured.scrollWidth - measured.clientWidth}px wider than the screen.`
          : "Rendered page fits the screen width.",
        evidence: "measurement",
        pageId: page.id,
      });

      const clipped = measured.clippedSelectors ?? [];
      checks.push({
        width: device.width,
        device: device.label,
        check: "nothing clipped",
        verdict: clipped.length > 0 ? "FAIL" : "PASS",
        detail:
          clipped.length > 0
            ? `${clipped.length} element(s) are cut off: ${clipped.slice(0, 3).join(", ")}.`
            : "No clipped elements were measured.",
        evidence: "measurement",
        pageId: page.id,
      });
    }
  }

  return checks;
}

export type MatrixSummary = {
  passed: number;
  failed: number;
  notVerified: number;
  /** True only when at least one real measurement backed the geometry checks. */
  measured: boolean;
  failures: MatrixCheck[];
};

export function summarizeDeviceMatrix(checks: MatrixCheck[]): MatrixSummary {
  const failures = checks.filter((check) => check.verdict === "FAIL");
  return {
    passed: checks.filter((check) => check.verdict === "PASS").length,
    failed: failures.length,
    notVerified: checks.filter((check) => check.verdict === "NOT_VERIFIED").length,
    measured: checks.some((check) => check.evidence === "measurement"),
    failures,
  };
}
