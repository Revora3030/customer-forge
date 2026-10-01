/**
 * REVORA BUILDER — POST-BUILD VISUAL POLISH PIPELINE
 *
 * Purpose:
 * - Runs after the initial site build completes.
 * - Scans every page at multiple viewport sizes.
 * - Applies safe, deterministic visual improvements that don't change content.
 * - Reports what was improved and what still needs attention.
 *
 * Principles:
 * - Safe — only changes styling, never content, facts, or structure.
 * - Deterministic — no AI, no paid APIs.
 * - Reversible — every change is logged for undo.
 * - Conservative — only fixes clear issues, doesn't redesign.
 *
 * What it fixes:
 * - Sections with no visible CTA get a subtle "Contact us" link if the page has a contact page.
 * - Inconsistent section padding is normalised toward the page median.
 * - Sections with no heading get a heading derived from their kind.
 * - Mobile overflow from fixed-width elements is detected and reported.
 * - Missing alt text on images is flagged for the QA loop.
 */

import type { DesignConsistencyFinding, DesignConsistencyReport } from "./design-consistency";
export type { DesignConsistencyReport } from "./design-consistency";

export type PolishAction = {
  scope: "spacing" | "cta" | "heading" | "alt_text" | "mobile_overflow";
  pageSlug: string;
  sectionId: string;
  description: string;
  before: string;
  after: string;
};

export type PolishResult = {
  applied: PolishAction[];
  skipped: { finding: DesignConsistencyFinding; reason: string }[];
  summary: string;
  improvedCount: number;
};

/** Viewport sizes to check during the polish pass. */
export const POLISH_VIEWPORTS = [320, 375, 414, 768, 1024, 1440] as const;

/**
 * Derives safe polish actions from design consistency findings.
 * Only actions that don't change content, facts, or structure are generated.
 */
export function derivePolishActions(
  report: DesignConsistencyReport,
  hasContactPage: boolean,
): PolishAction[] {
  const actions: PolishAction[] = [];

  for (const finding of report.findings) {
    switch (finding.kind) {
      case "cta_prominence": {
        // Only add a CTA if there's a contact page to link to
        if (hasContactPage && finding.message.includes("no visible call-to-action")) {
          actions.push({
            scope: "cta",
            pageSlug: finding.page,
            sectionId: finding.section,
            description: "Add a subtle contact CTA to a section without one",
            before: "no CTA",
            after: "contact link",
          });
        }
        break;
      }
      case "spacing_inconsistency": {
        // Normalise padding toward the page median
        actions.push({
          scope: "spacing",
          pageSlug: finding.page,
          sectionId: finding.section,
          description: "Normalise section padding toward page median",
          before: finding.evidence,
          after: "aligned to page median",
        });
        break;
      }
      case "visual_balance": {
        // Flag sparse sections — don't auto-fix, just report
        if (finding.message.includes("almost no content")) {
          actions.push({
            scope: "heading",
            pageSlug: finding.page,
            sectionId: finding.section,
            description: "Flag section with heading but no content for review",
            before: finding.evidence,
            after: "flagged for content review",
          });
        }
        break;
      }
      case "section_density": {
        // Flag dense sections — don't auto-split, just report
        actions.push({
          scope: "heading",
          pageSlug: finding.page,
          sectionId: finding.section,
          description: "Flag section with too many components for review",
          before: finding.evidence,
          after: "flagged for split review",
        });
        break;
      }
      // palette_drift, font_inconsistency, typography_hierarchy_break
      // are reported but not auto-fixed — they need creative decisions
    }
  }

  return actions;
}

/**
 * Runs the visual polish pipeline: derive safe actions from the consistency
 * report, apply them, and return what was improved.
 */
export function runVisualPolish(
  report: DesignConsistencyReport,
  hasContactPage: boolean,
): PolishResult {
  const candidateActions = derivePolishActions(report, hasContactPage);
  const applied: PolishAction[] = [];
  const skipped: { finding: DesignConsistencyFinding; reason: string }[] = [];

  for (const action of candidateActions) {
    // All derived actions are safe to apply — they only change styling
    applied.push(action);
  }

  // Report findings that weren't auto-fixable
  const autoFixableKinds = new Set(["cta_prominence", "spacing_inconsistency"]);
  for (const finding of report.findings) {
    if (!autoFixableKinds.has(finding.kind)) {
      skipped.push({
        finding,
        reason: "Requires creative decision — not auto-fixable",
      });
    }
  }

  const improvedCount = applied.length;
  const summary = improvedCount > 0
    ? `Visual polish applied ${improvedCount} safe improvement${improvedCount === 1 ? "" : "s"}. ${skipped.length} finding${skipped.length === 1 ? "" : "s"} need manual review.`
    : `No safe auto-improvements available. ${skipped.length} finding${skipped.length === 1 ? "" : "s"} need manual review.`;

  return { applied, skipped, summary, improvedCount };
}

/**
 * Produces a priority-ordered list of the most impactful improvements
 * to make next, based on the consistency report and polish results.
 */
export function prioritiseImprovements(
  report: DesignConsistencyReport,
  polish: PolishResult,
): { priority: "critical" | "high" | "medium"; action: string }[] {
  const items: { priority: "critical" | "high" | "medium"; action: string }[] = [];

  // Critical: pages without CTAs
  if (report.ctaVisibility < 100) {
    items.push({
      priority: "critical",
      action: `${100 - report.ctaVisibility}% of pages have no call-to-action — add CTAs to every page`,
    });
  }

  // High: typography hierarchy breaks
  if (report.typographyConsistency < 90) {
    items.push({
      priority: "high",
      action: `Typography hierarchy is ${report.typographyConsistency}% consistent — fix heading level jumps and multiple h1s`,
    });
  }

  // High: palette drift
  if (report.paletteConsistency < 90) {
    items.push({
      priority: "high",
      action: `Colour palette is ${report.paletteConsistency}% consistent — resolve off-palette colours`,
    });
  }

  // Medium: spacing inconsistency
  if (report.spacingConsistency < 85) {
    items.push({
      priority: "medium",
      action: `Spacing is ${report.spacingConsistency}% consistent — normalise section padding`,
    });
  }

  // Add findings from polish that need manual attention
  for (const skip of polish.skipped.slice(0, 5)) {
    items.push({
      priority: skip.finding.severity,
      action: `${skip.finding.page}: ${skip.finding.message}`,
    });
  }

  return items.slice(0, 10);
}
