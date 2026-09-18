import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import type { IndustryPlaybook } from "./industry";
import { pageSeo, type CopyFacts } from "./copy";

export type SeoFinding = {
  pageId: string;
  kind: "missing_title" | "title_length" | "duplicate_title" | "missing_description" | "description_length";
  message: string;
  severity: "low" | "medium";
};

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

export function findGlobalSeoFindings(context: AgentContext): SeoFinding[] {
  const pages = context.pages.filter((page) => page.is_visible && !page.noindex);
  const titles = new Map<string, number>();
  for (const page of pages) {
    const title = page.seo_title?.trim().toLowerCase();
    if (title) titles.set(title, (titles.get(title) ?? 0) + 1);
  }

  const findings: SeoFinding[] = [];
  for (const page of pages) {
    const title = page.seo_title?.trim() ?? "";
    const description = page.seo_description?.trim() ?? "";
    if (!title) findings.push({ pageId: page.id, kind: "missing_title", message: "Page is missing an SEO title.", severity: "medium" });
    else if (title.length > TITLE_MAX) findings.push({ pageId: page.id, kind: "title_length", message: "SEO title exceeds the builder's 60-character target.", severity: "low" });
    if (title && (titles.get(title.toLowerCase()) ?? 0) > 1) findings.push({ pageId: page.id, kind: "duplicate_title", message: "SEO title is duplicated on another indexable page.", severity: "low" });
    if (!description) findings.push({ pageId: page.id, kind: "missing_description", message: "Page is missing an SEO description.", severity: "medium" });
    else if (description.length > DESCRIPTION_MAX) findings.push({ pageId: page.id, kind: "description_length", message: "SEO description exceeds the builder's 160-character target.", severity: "low" });
  }
  return findings.slice(0, 32);
}

export function compileGlobalSeoRepairs(
  context: AgentContext,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
  limit = 20,
): { findings: SeoFinding[]; actions: AgentAction[] } {
  const findings = findGlobalSeoFindings(context);
  const actions: AgentAction[] = [];
  for (const page of context.pages.filter((item) => item.is_visible && !item.noindex)) {
    if (actions.length >= limit) break;
    const generated = pageSeo(page.title || "Home", facts, playbook);
    const needsTitle = !page.seo_title?.trim() || (page.seo_title?.length ?? 0) > TITLE_MAX;
    const needsDescription = !page.seo_description?.trim() || (page.seo_description?.length ?? 0) > DESCRIPTION_MAX;
    if (!needsTitle && !needsDescription) continue;
    actions.push({
      type: "set_page",
      pageId: page.id,
      patch: {
        seo_title: needsTitle ? generated.seo_title : page.seo_title,
        seo_description: needsDescription ? generated.seo_description : page.seo_description,
      },
    });
  }
  return { findings, actions };
}

export function globalSeoSummary(findings: SeoFinding[], actions: AgentAction[]): string {
  return `Global SEO intelligence found ${findings.length} finding${findings.length === 1 ? "" : "s"} and prepared ${actions.length} safe metadata repair${actions.length === 1 ? "" : "s"}.`;
}
