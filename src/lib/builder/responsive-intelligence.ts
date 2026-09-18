/**
 * REVORA RESPONSIVE / MOBILE INTELLIGENCE
 * =======================================
 *
 * Pure deterministic planning for mobile-first refinement.
 * It does not inspect a browser or invent viewport measurements; it identifies
 * sections whose existing composition is likely to be harder to scan on small
 * screens and compiles conservative renderer-supported visual patches.
 */

import type { AgentAction, SectionVisualPatch } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

type Section = AgentContext["pages"][number]["sections"][number];

export type ResponsiveFinding = {
  pageId: string;
  sectionId: string;
  kind: Section["kind"];
  reasons: string[];
  priority: number;
};

const MOBILE_REQUEST = /\b(mobile|responsive|phone|phones|tablet|small screen|mobile-first|touch)\b/i;

function sectionText(section: Section): string {
  return [section.heading, section.subheading, section.body]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function riskForSection(section: Section): ResponsiveFinding | null {
  const reasons: string[] = [];
  let priority = 0;
  const text = sectionText(section);

  if (text.length > 700) {
    reasons.push("long copy");
    priority += 3;
  }

  if (section.components.length > 8) {
    reasons.push("many interactive/content elements");
    priority += 3;
  }

  if (section.kind === "hero") {
    reasons.push("first-screen section");
    priority += 5;
  }

  if (["services", "pricing", "gallery", "reviews", "benefits"].includes(section.kind)) {
    reasons.push("multi-item section");
    priority += 2;
  }

  if (section.components.some((component) => Boolean(component.media_url))) {
    reasons.push("media-bearing section");
    priority += 1;
  }

  return reasons.length
    ? { pageId: "", sectionId: section.id, kind: section.kind, reasons, priority }
    : null;
}

function mobilePatch(section: Section): SectionVisualPatch {
  if (section.kind === "hero") {
    return {
      layout: "stacked",
      density: "balanced",
      image_position: "center",
      image_treatment: "rounded",
      spacing: "standard",
      max_width: "standard",
      image_ratio: "16:9",
    };
  }

  if (["services", "benefits", "pricing"].includes(section.kind)) {
    return {
      layout: "stacked",
      density: "balanced",
      spacing: "standard",
      max_width: "standard",
    };
  }

  if (["gallery", "reviews"].includes(section.kind)) {
    return {
      layout: "stacked",
      density: "balanced",
      spacing: "standard",
      max_width: "standard",
      image_ratio: "4:3",
    };
  }

  return {
    layout: "centered",
    density: "balanced",
    spacing: "standard",
    max_width: "standard",
  };
}

export function isResponsiveRequest(instruction: string): boolean {
  return MOBILE_REQUEST.test(instruction);
}

export function findResponsiveFindings(
  context: AgentContext,
  instruction: string,
  limit = 12,
): ResponsiveFinding[] {
  if (!isResponsiveRequest(instruction)) return [];

  const findings: ResponsiveFinding[] = [];

  for (const page of context.pages) {
    if (!page.is_visible || page.noindex) continue;

    for (const section of page.sections) {
      const finding = riskForSection(section);
      if (!finding) continue;
      findings.push({ ...finding, pageId: page.id });
    }
  }

  return findings
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.pageId.localeCompare(b.pageId) ||
        a.sectionId.localeCompare(b.sectionId),
    )
    .slice(0, Math.min(24, Math.max(1, limit)));
}

export function compileResponsiveRepairs(
  context: AgentContext,
  instruction: string,
  limit = 8,
): AgentAction[] {
  const findings = findResponsiveFindings(context, instruction, limit);
  return findings.map((finding) => ({
    type: "set_section_visual",
    sectionId: finding.sectionId,
    patch: mobilePatch(
      context.pages
        .flatMap((page) => page.sections)
        .find((section) => section.id === finding.sectionId) ?? context.pages[0]!.sections[0],
    ),
  }));
}

export function responsiveSummary(findings: ResponsiveFinding[]): string {
  return findings.length
    ? `Responsive intelligence identified ${findings.length} high-value section${findings.length === 1 ? "" : "s"} for mobile refinement.`
    : "Responsive intelligence found no supported mobile refinements.";
}
