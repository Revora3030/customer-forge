import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type ConsistencyFinding = {
  pageId: string;
  kind: "cta" | "title";
  message: string;
  severity: "low" | "medium";
  expected: string;
};

export function findCrossPageConsistencyFindings(
  context: AgentContext,
  expectedCtaUrl: string,
  expectedTitle: string,
): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  for (const page of context.pages.filter((item) => item.is_visible && !item.noindex)) {
    const buttons = page.sections.flatMap((section) => section.components)
      .filter((component) => component.kind === "button");
    if (buttons.length > 0 && !buttons.some((button) => button.link_url === expectedCtaUrl)) {
      findings.push({
        pageId: page.id,
        kind: "cta",
        message: `Page ${page.title || page.slug} uses a CTA destination different from the resolved primary destination.`,
        severity: "low",
        expected: expectedCtaUrl,
      });
    }
    if (!page.seo_title?.trim()) {
      findings.push({
        pageId: page.id,
        kind: "title",
        message: `Page ${page.title || page.slug} is missing an SEO title.`,
        severity: "medium",
        expected: expectedTitle,
      });
    }
  }
  return findings.slice(0, 24);
}

export function compileCrossPageConsistencyRepairs(
  context: AgentContext,
  expectedCtaUrl: string,
  expectedTitle: string,
): { findings: ConsistencyFinding[]; actions: AgentAction[] } {
  const findings = findCrossPageConsistencyFindings(context, expectedCtaUrl, expectedTitle);
  const actions: AgentAction[] = [];
  for (const finding of findings) {
    if (finding.kind !== "title" || actions.length >= 12) continue;
    actions.push({ type: "set_page", pageId: finding.pageId, patch: { seo_title: finding.expected.slice(0, 120) } });
  }
  return { findings, actions };
}

export function consistencySummary(findings: ConsistencyFinding[]): string {
  return findings.length
    ? `Cross-page consistency found ${findings.length} bounded finding${findings.length === 1 ? "" : "s"}.`
    : "Cross-page consistency found no bounded findings.";
}
