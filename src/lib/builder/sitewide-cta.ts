/**
 * REVORA SITE-WIDE CTA INTELLIGENCE
 * =================================
 *
 * Finds visible pages that participate in the conversion journey but lack a
 * clear native CTA. It never invents destinations: the caller supplies the
 * already-resolved safe CTA target.
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type SitewideCtaRepair = {
  pageId: string;
  sectionId: string;
  label: string;
  targetUrl: string;
};

const CTA_REQUEST = /\b(cta|call[- ]?to[- ]?action|conversion|convert|lead|leads|booking|book|appointment|quote|estimate|contact|customers?|sales)\b/i;

function hasCta(section: AgentContext["pages"][number]["sections"][number], targetUrl: string): boolean {
  return section.components.some(
    (component) =>
      component.kind === "button" ||
      component.link_url === targetUrl ||
      /\b(book|quote|estimate|contact|get started|schedule)\b/i.test(
        `${component.label ?? ""} ${component.link_label ?? ""}`,
      ),
  );
}

/** Build bounded CTA repairs using only existing visible/indexable pages. */
export function findSitewideCtaRepairs(
  context: AgentContext,
  instruction: string,
  targetUrl: string,
  label: string,
  limit = 8,
): SitewideCtaRepair[] {
  if (!CTA_REQUEST.test(instruction)) return [];

  const repairs: SitewideCtaRepair[] = [];

  for (const page of context.pages) {
    if (!page.is_visible || page.noindex) continue;

    const sections = [...page.sections].sort((a, b) => {
      const priority = (kind: string) =>
        kind === "hero" ? 100 : kind === "cta" ? 90 : kind === "offer" ? 80 : kind === "contact" ? 70 : 40;
      return priority(b.kind) - priority(a.kind);
    });

    const host = sections.find((section) => !hasCta(section, targetUrl));
    if (!host) continue;

    repairs.push({ pageId: page.id, sectionId: host.id, label: label.slice(0, 80), targetUrl });
    if (repairs.length >= Math.max(1, Math.min(limit, 12))) break;
  }

  return repairs;
}

export function compileSitewideCtaRepairs(
  context: AgentContext,
  instruction: string,
  targetUrl: string,
  label: string,
  limit = 8,
): AgentAction[] {
  return findSitewideCtaRepairs(context, instruction, targetUrl, label, limit).map((repair) => ({
    type: "add_component",
    sectionId: repair.sectionId,
    kind: "button",
    label: repair.label,
    link_url: repair.targetUrl,
    link_label: repair.label,
  }));
}

export function sitewideCtaSummary(actions: AgentAction[]): string {
  const count = actions.filter((action) => action.type === "add_component" && action.kind === "button").length;
  return count
    ? `Site-wide CTA intelligence prepared ${count} missing page-level CTA${count === 1 ? "" : "s"}.`
    : "Site-wide CTA intelligence found no safe missing CTA to add.";
}
