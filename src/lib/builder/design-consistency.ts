/**
 * REVORA BUILDER — DESIGN CONSISTENCY ENGINE
 *
 * Purpose:
 * - Verify design tokens are applied consistently across every page and section.
 * - Detect typography hierarchy breaks (skipped heading levels, inconsistent fonts).
 * - Detect colour palette drift (sections using off-palette colours).
 * - Detect spacing inconsistency (inconsistent padding, margins, gaps).
 * - Detect CTA prominence issues (buried, inconsistent, or missing CTAs).
 * - Detect visual balance problems (sections that are too dense or too sparse).
 *
 * Principles:
 * - Deterministic — no AI, no paid APIs.
 * - Evidence-backed — every finding includes the selector and the measured value.
 * - Conservative — only flag clear inconsistencies, not stylistic choices.
 * - Site-wide — checks every page, not just the homepage.
 */

export type DesignConsistencyFinding = {
  kind:
    | "palette_drift"
    | "typography_hierarchy_break"
    | "spacing_inconsistency"
    | "cta_prominence"
    | "visual_balance"
    | "font_inconsistency"
    | "section_density";
  severity: "critical" | "high" | "medium";
  page: string;
  section: string;
  message: string;
  evidence: string;
};

export type DesignConsistencyReport = {
  findings: DesignConsistencyFinding[];
  paletteConsistency: number;
  typographyConsistency: number;
  spacingConsistency: number;
  ctaVisibility: number;
  overallScore: number;
};

export type DesignTokenSnapshot = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
};

export type SectionDesignData = {
  pageSlug: string;
  sectionId: string;
  sectionKind: string;
  heading: string | null;
  headingLevel: number | null;
  textColor: string | null;
  bgColor: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  gap: number | null;
  hasCta: boolean;
  ctaLabel: string | null;
  componentCount: number;
  textLength: number;
  isVisible: boolean;
};

/** Common named colours mapped to hex for palette comparison. */
const NAMED_COLOURS: Record<string, string> = {
  white: "#FFFFFF", black: "#000000", red: "#FF0000", green: "#008000",
  blue: "#0000FF", yellow: "#FFFF00", orange: "#FFA500", purple: "#800080",
  gray: "#808080", grey: "#808080", transparent: "transparent",
};

function normalizeColour(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (NAMED_COLOURS[trimmed]) return NAMED_COLOURS[trimmed];
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
  }
  return trimmed;
}

function colourDistance(a: string, b: string): number {
  if (a === b) return 0;
  const parseHex = (h: string) => {
    const hex = h.replace("#", "");
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  };
  try {
    const ca = parseHex(a);
    const cb = parseHex(b);
    return Math.sqrt(
      Math.pow(ca.r - cb.r, 2) +
      Math.pow(ca.g - cb.g, 2) +
      Math.pow(ca.b - cb.b, 2),
    );
  } catch {
    return 999;
  }
}

const PALETTE_DRIFT_THRESHOLD = 60;
const SPACING_VARIANCE_THRESHOLD = 24;

/**
 * Checks every section for colour palette consistency.
 * Sections using colours significantly different from the theme palette are flagged.
 */
function checkPaletteConsistency(
  sections: SectionDesignData[],
  tokens: DesignTokenSnapshot,
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];
  const paletteColours = [
    normalizeColour(tokens.primaryColor),
    normalizeColour(tokens.secondaryColor),
    normalizeColour(tokens.accentColor),
  ].filter(Boolean) as string[];

  if (paletteColours.length === 0) return findings;

  for (const section of sections) {
    if (!section.isVisible) continue;
    const sectionColours = [section.textColor, section.bgColor]
      .map(normalizeColour)
      .filter(Boolean) as string[];

    for (const colour of sectionColours) {
      if (colour === "transparent" || colour === "#FFFFFF" || colour === "#000000") continue;
      const closest = Math.min(
        ...paletteColours.map((p) => colourDistance(colour, p)),
      );
      if (closest > PALETTE_DRIFT_THRESHOLD) {
        findings.push({
          kind: "palette_drift",
          severity: "medium",
          page: section.pageSlug,
          section: section.sectionId,
          message: `Section uses off-palette colour ${colour} (closest palette distance: ${Math.round(closest)})`,
          evidence: `textColor=${section.textColor ?? "none"} bgColor=${section.bgColor ?? "none"}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Checks heading hierarchy across each page — skipped levels (h1 → h3) and
 * multiple h1s on a single page are flagged.
 */
function checkTypographyHierarchy(
  sections: SectionDesignData[],
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];
  const byPage = new Map<string, SectionDesignData[]>();
  for (const section of sections) {
    if (!section.isVisible) continue;
    const list = byPage.get(section.pageSlug) ?? [];
    list.push(section);
    byPage.set(section.pageSlug, list);
  }

  for (const [pageSlug, pageSections] of byPage) {
    const headings = pageSections
      .filter((s) => s.headingLevel !== null)
      .sort((a, b) => (a.headingLevel ?? 0) - (b.headingLevel ?? 0));

    if (headings.length === 0) continue;

    const h1Count = headings.filter((s) => s.headingLevel === 1).length;
    if (h1Count > 1 && headings[1]) {
      findings.push({
        kind: "typography_hierarchy_break",
        severity: "high",
        page: pageSlug,
        section: headings[1].sectionId,
        message: `Page has ${h1Count} h1 headings — use exactly one h1 per page`,
        evidence: `h1 count: ${h1Count}`,
      });
    }

    let prevLevel = 0;
    for (const section of headings) {
      const level = section.headingLevel ?? 0;
      if (prevLevel > 0 && level > prevLevel + 1) {
        findings.push({
          kind: "typography_hierarchy_break",
          severity: "medium",
          page: pageSlug,
          section: section.sectionId,
          message: `Heading jumps from h${prevLevel} to h${level} — don't skip levels`,
          evidence: `previous: h${prevLevel}, current: h${level}`,
        });
      }
      prevLevel = level;
    }
  }
  return findings;
}

/**
 * Detects font family inconsistencies — sections using a different font family
 * than the theme's heading or body font.
 */
function checkFontConsistency(
  sections: SectionDesignData[],
  tokens: DesignTokenSnapshot,
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];
  const allowedFonts = new Set(
    [tokens.headingFont, tokens.bodyFont]
      .filter(Boolean)
      .map((f) => f!.toLowerCase()),
  );
  if (allowedFonts.size === 0) return findings;

  for (const section of sections) {
    if (!section.isVisible || !section.fontFamily) continue;
    const font = section.fontFamily.toLowerCase();
    if (!allowedFonts.has(font)) {
      findings.push({
        kind: "font_inconsistency",
        severity: "medium",
        page: section.pageSlug,
        section: section.sectionId,
        message: `Section uses font "${section.fontFamily}" which is not in the theme fonts`,
        evidence: `allowed: ${[...allowedFonts].join(", ")}`,
      });
    }
  }
  return findings;
}

/**
 * Detects spacing inconsistency — sections with padding that differs
 * significantly from the median padding on the same page.
 */
function checkSpacingConsistency(
  sections: SectionDesignData[],
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];
  const byPage = new Map<string, SectionDesignData[]>();
  for (const section of sections) {
    if (!section.isVisible || !section.padding) continue;
    const list = byPage.get(section.pageSlug) ?? [];
    list.push(section);
    byPage.set(section.pageSlug, list);
  }

  for (const [pageSlug, pageSections] of byPage) {
    if (pageSections.length < 3) continue;
    const topPaddings = pageSections.map((s) => s.padding!.top).sort((a, b) => a - b);
    const median = topPaddings[Math.floor(topPaddings.length / 2)] ?? 0;

    for (const section of pageSections) {
      const diff = Math.abs(section.padding!.top - median);
      if (diff > SPACING_VARIANCE_THRESHOLD) {
        findings.push({
          kind: "spacing_inconsistency",
          severity: "medium",
          page: pageSlug,
          section: section.sectionId,
          message: `Section padding (${section.padding!.top}px) deviates ${diff}px from page median (${median}px)`,
          evidence: `padding.top=${section.padding!.top} median=${median}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Checks CTA prominence — pages without any visible CTA, or CTAs that are
 * buried below dense content sections.
 */
function checkCtaProminence(
  sections: SectionDesignData[],
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];
  const byPage = new Map<string, SectionDesignData[]>();
  for (const section of sections) {
    if (!section.isVisible) continue;
    const list = byPage.get(section.pageSlug) ?? [];
    list.push(section);
    byPage.set(section.pageSlug, list);
  }

  for (const [pageSlug, pageSections] of byPage) {
    const ctaSections = pageSections.filter((s) => s.hasCta);
    if (ctaSections.length === 0 && pageSections.length > 2 && pageSections[0]) {
      findings.push({
        kind: "cta_prominence",
        severity: "high",
        page: pageSlug,
        section: pageSections[0].sectionId,
        message: "Page has no visible call-to-action — visitors have no next step",
        evidence: `sections: ${pageSections.length}, ctas: 0`,
      });
    }

    // Check if the first CTA is buried below 3+ sections
    if (ctaSections.length > 0 && ctaSections[0]) {
      const firstCtaIndex = pageSections.findIndex((s) => s.hasCta);
      if (firstCtaIndex > 3) {
        findings.push({
          kind: "cta_prominence",
          severity: "medium",
          page: pageSlug,
          section: ctaSections[0].sectionId,
          message: `First CTA is buried at position ${firstCtaIndex + 1} — move it higher for better conversion`,
          evidence: `first CTA at section ${firstCtaIndex + 1} of ${pageSections.length}`,
        });
      }
    }
  }
  return findings;
}

/**
 * Detects visual balance issues — sections that are too dense (too many
 * components) or too sparse (very little content).
 */
function checkVisualBalance(
  sections: SectionDesignData[],
): DesignConsistencyFinding[] {
  const findings: DesignConsistencyFinding[] = [];

  for (const section of sections) {
    if (!section.isVisible) continue;

    // Very dense sections
    if (section.componentCount > 8) {
      findings.push({
        kind: "section_density",
        severity: "medium" as "medium",
        page: section.pageSlug,
        section: section.sectionId,
        message: `Section has ${section.componentCount} components — consider splitting for readability`,
        evidence: `components: ${section.componentCount}`,
      });
    }

    // Very sparse sections with a heading but no body content
    if (section.componentCount === 0 && section.textLength < 50 && section.heading) {
      findings.push({
        kind: "visual_balance",
        severity: "medium" as "medium",
        page: section.pageSlug,
        section: section.sectionId,
        message: "Section has a heading but almost no content — add body copy or remove it",
        evidence: `text length: ${section.textLength} chars, components: 0`,
      });
    }
  }
  return findings;
}

/**
 * Runs every design consistency check and produces a unified report.
 */
export function runDesignConsistencyAudit(
  sections: SectionDesignData[],
  tokens: DesignTokenSnapshot,
): DesignConsistencyReport {
  const paletteFindings = checkPaletteConsistency(sections, tokens);
  const typographyFindings = checkTypographyHierarchy(sections);
  const fontFindings = checkFontConsistency(sections, tokens);
  const spacingFindings = checkSpacingConsistency(sections);
  const ctaFindings = checkCtaProminence(sections);
  const balanceFindings = checkVisualBalance(sections);

  const allFindings = [
    ...paletteFindings,
    ...typographyFindings,
    ...fontFindings,
    ...spacingFindings,
    ...ctaFindings,
    ...balanceFindings,
  ];

  const visibleSections = sections.filter((s) => s.isVisible);
  const totalSections = Math.max(visibleSections.length, 1);

  const paletteConsistency = Math.round(
    (1 - paletteFindings.length / totalSections) * 100,
  );
  const typographyConsistency = Math.round(
    (1 - typographyFindings.length / totalSections) * 100,
  );
  const spacingConsistency = Math.round(
    (1 - spacingFindings.length / totalSections) * 100,
  );

  const pagesWithCtas = new Set(
    visibleSections.filter((s) => s.hasCta).map((s) => s.pageSlug),
  );
  const allPages = new Set(visibleSections.map((s) => s.pageSlug));
  const ctaVisibility = allPages.size > 0
    ? Math.round((pagesWithCtas.size / allPages.size) * 100)
    : 100;

  const overallScore = Math.round(
    (paletteConsistency + typographyConsistency + spacingConsistency + ctaVisibility) / 4,
  );

  return {
    findings: allFindings,
    paletteConsistency: Math.max(0, Math.min(100, paletteConsistency)),
    typographyConsistency: Math.max(0, Math.min(100, typographyConsistency)),
    spacingConsistency: Math.max(0, Math.min(100, spacingConsistency)),
    ctaVisibility: Math.max(0, Math.min(100, ctaVisibility)),
    overallScore: Math.max(0, Math.min(100, overallScore)),
  };
}

/**
 * Produces a plain-English summary of the design consistency report.
 */
export function designConsistencySummary(report: DesignConsistencyReport): string {
  if (report.findings.length === 0) {
    return "Design consistency check passed — no issues found across any page.";
  }
  const critical = report.findings.filter((f) => f.severity === "critical").length;
  const high = report.findings.filter((f) => f.severity === "high").length;
  const medium = report.findings.filter((f) => f.severity === "medium").length;
  const parts = [
    `Design consistency: ${report.overallScore}% overall`,
    `palette ${report.paletteConsistency}%`,
    `typography ${report.typographyConsistency}%`,
    `spacing ${report.spacingConsistency}%`,
    `CTA coverage ${report.ctaVisibility}%`,
  ];
  if (critical) parts.push(`${critical} critical`);
  if (high) parts.push(`${high} high`);
  if (medium) parts.push(`${medium} medium`);
  return parts.join(" · ");
}
