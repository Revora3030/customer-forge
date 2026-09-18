/**
 * REVORA ACCESSIBILITY INTELLIGENCE
 * =================================
 *
 * Pure deterministic accessibility analysis from the existing site map.
 * This layer only uses facts already stored in the site model and emits
 * renderer-safe native actions for repairs that can be made without guessing.
 */

import { type AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

type Section = AgentContext["pages"][number]["sections"][number];
type Component = Section["components"][number];

export type AccessibilityDimension =
  | "semantics"
  | "media"
  | "interaction"
  | "structure";

export type AccessibilityScore = {
  score: number;
  dimensions: Record<AccessibilityDimension, number>;
  strengths: string[];
  gaps: string[];
  scannedPages: number;
  scannedSections: number;
  scannedComponents: number;
};

export type AccessibilityFinding = {
  pageId: string;
  sectionId: string;
  componentId?: string;
  kind: "missing_alt" | "missing_link_label" | "missing_heading";
  reason: string;
  priority: number;
};

const ACCESSIBILITY_TERMS =
  /\b(accessibility|accessible|a11y|screen reader|keyboard|alt text|aria|contrast|wcag)\b/i;

function visiblePages(context: AgentContext) {
  return context.pages.filter((page) => page.is_visible && !page.noindex);
}

function visibleSections(context: AgentContext): Section[] {
  return visiblePages(context).flatMap((page) =>
    page.sections.filter((section) => section.is_visible),
  );
}

function visibleComponents(context: AgentContext): Component[] {
  return visibleSections(context).flatMap((section) =>
    section.components.filter((component) => component.is_visible),
  );
}

function scoreDimension(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function isAccessibilityRequest(instruction: string): boolean {
  return ACCESSIBILITY_TERMS.test(instruction);
}

function mediaAlt(component: Component): string {
  return [component.label, component.body]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" — ")
    .trim()
    .slice(0, 160);
}

function isInteractive(component: Component): boolean {
  return Boolean(
    component.link_url ||
      component.link_label ||
      component.kind === "button" ||
      component.kind === "link",
  );
}

export function findAccessibilityFindings(
  context: AgentContext,
  limit = 24,
): AccessibilityFinding[] {
  const findings: AccessibilityFinding[] = [];

  for (const page of visiblePages(context)) {
    for (const section of page.sections.filter((item) => item.is_visible)) {
      if (!section.heading?.trim() && findings.length < limit) {
        findings.push({
          pageId: page.id,
          sectionId: section.id,
          kind: "missing_heading",
          reason: "Visible sections should expose a meaningful heading when possible.",
          priority: section.kind === "hero" ? 100 : 60,
        });
      }

      for (const component of section.components.filter((item) => item.is_visible)) {
        if (findings.length >= limit) {
          break;
        }

        if (component.media_url && !mediaAlt(component)) {
          findings.push({
            pageId: page.id,
            sectionId: section.id,
            componentId: component.id,
            kind: "missing_alt",
            reason: "Media has no safe source-derived accessibility text.",
            priority: 90,
          });
        }

        if (
          isInteractive(component) &&
          component.link_url &&
          !component.link_label?.trim() &&
          component.label?.trim()
        ) {
          findings.push({
            pageId: page.id,
            sectionId: section.id,
            componentId: component.id,
            kind: "missing_link_label",
            reason: "Interactive content has a destination but no explicit link label.",
            priority: 80,
          });
        }
      }
    }
  }

  return findings
    .sort((a, b) => b.priority - a.priority || a.pageId.localeCompare(b.pageId))
    .slice(0, limit);
}

export function compileAccessibilityRepairs(
  context: AgentContext,
  instruction: string,
  limit = 12,
): AgentAction[] {
  if (!isAccessibilityRequest(instruction)) {
    return [];
  }

  const componentsById = new Map(
    visibleComponents(context).map((component) => [component.id, component]),
  );

  return findAccessibilityFindings(context, limit).flatMap((finding) => {
    if (!finding.componentId) {
      return [];
    }

    const component = componentsById.get(finding.componentId);
    if (!component) {
      return [];
    }

    if (finding.kind === "missing_alt") {
      const alt = mediaAlt(component);
      if (!alt) {
        return [];
      }

      return [
        {
          type: "set_component_visual" as const,
          componentId: component.id,
          patch: { alt },
        },
      ];
    }

    if (finding.kind === "missing_link_label" && component.label?.trim()) {
      return [
        {
          type: "set_component" as const,
          componentId: component.id,
          patch: { link_label: component.label.trim().slice(0, 160) },
        },
      ];
    }

    return [];
  }).slice(0, Math.max(1, Math.min(limit, 12)));
}

export function scoreAccessibility(context: AgentContext): AccessibilityScore {
  const pages = visiblePages(context);
  const sections = visibleSections(context);
  const components = visibleComponents(context);

  if (!pages.length || !sections.length) {
    return {
      score: 0,
      dimensions: { semantics: 0, media: 0, interaction: 0, structure: 0 },
      strengths: [],
      gaps: ["No visible page sections are available for accessibility analysis."],
      scannedPages: pages.length,
      scannedSections: sections.length,
      scannedComponents: components.length,
    };
  }

  const headingMissing = sections.filter((section) => !section.heading?.trim()).length;
  const media = components.filter((component) => Boolean(component.media_url));
  const mediaMissingAlt = media.filter((component) => !mediaAlt(component)).length;
  const interactive = components.filter(isInteractive);
  const unlabeledInteractive = interactive.filter(
    (component) => Boolean(component.link_url) && !component.link_label?.trim(),
  ).length;
  const pageWithoutTitle = pages.filter((page) => !page.title?.trim()).length;

  const semantics = scoreDimension(
    100 -
      (headingMissing / sections.length) * 45 -
      (pageWithoutTitle / pages.length) * 35,
  );
  const mediaScore = scoreDimension(
    media.length
      ? 100 - (mediaMissingAlt / media.length) * 70
      : 85,
  );
  const interaction = scoreDimension(
    interactive.length
      ? 100 - (unlabeledInteractive / interactive.length) * 70
      : 85,
  );
  const structure = scoreDimension(
    100 - Math.min(60, Math.max(0, pages.length - 1) * 2),
  );

  const dimensions = { semantics, media: mediaScore, interaction, structure };
  const score = scoreDimension(
    semantics * 0.30 +
      mediaScore * 0.25 +
      interaction * 0.25 +
      structure * 0.20,
  );

  const strengths = Object.entries(dimensions)
    .filter(([, value]) => value >= 80)
    .map(([name]) => `${name} accessibility signals are strong`);
  const gaps = Object.entries(dimensions)
    .filter(([, value]) => value < 70)
    .map(([name]) => `${name} needs accessibility refinement`);

  return {
    score,
    dimensions,
    strengths,
    gaps,
    scannedPages: pages.length,
    scannedSections: sections.length,
    scannedComponents: components.length,
  };
}

export function accessibilitySummary(result: AccessibilityScore): string {
  return `Deterministic accessibility scan: ${result.score}/100 across ${result.scannedPages} page(s), ${result.scannedSections} section(s), and ${result.scannedComponents} component(s).`;
}
