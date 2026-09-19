/**
 * REVORA QA AUTO-REPAIR INTELLIGENCE
 *
 * Converts safe deterministic QA findings into native builder actions.
 * Only source-derived repairs are emitted; ambiguous findings remain
 * findings for human/agent review.
 */

import { type AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import {
  runBrowserStyleQa,
  type BrowserQaFinding,
} from "./browser-qa-intelligence";

export type QaRepair = {
  finding: BrowserQaFinding;
  action: AgentAction;
};

const INTERNAL_DESTINATION = /^\/[A-Za-z0-9/_?&=.%#-]*$/;

function safeNavigationRepair(
  context: AgentContext,
  finding: BrowserQaFinding,
): AgentAction | null {
  if (finding.kind !== "navigation" || !finding.sectionId) return null;
  const match = finding.message.match(/destination (\/[A-Za-z0-9/_?&=.%#-]*) does not match/);
  const target = match?.[1];
  if (!target || !INTERNAL_DESTINATION.test(target)) return null;

  const page = context.pages.find((item) => item.id === finding.pageId);
  const section = page?.sections.find((item) => item.id === finding.sectionId);
  const component = section?.components.find((item) => item.link_url === target);
  if (!component) return null;

  return {
    type: "set_component",
    componentId: component.id,
    patch: { link_url: "/" },
  };
}

function safeSeoRepair(
  context: AgentContext,
  finding: BrowserQaFinding,
): AgentAction | null {
  if (finding.kind !== "seo") return null;
  const page = context.pages.find((item) => item.id === finding.pageId);
  if (!page) return null;

  if (!page.seo_title?.trim() && page.title?.trim()) {
    return {
      type: "set_page",
      pageId: page.id,
      patch: { seo_title: page.title.trim().slice(0, 60) },
    };
  }

  if (!page.seo_description?.trim() && page.title?.trim()) {
    return {
      type: "set_page",
      pageId: page.id,
      patch: { seo_description: page.title.trim().slice(0, 160) },
    };
  }

  return null;
}

function safeRepair(
  context: AgentContext,
  finding: BrowserQaFinding,
): AgentAction | null {
  return safeSeoRepair(context, finding) ?? safeNavigationRepair(context, finding);
}

export function compileQaAutoRepairs(
  context: AgentContext,
  instruction = "",
  limit = 8,
): QaRepair[] {
  const repairs: QaRepair[] = [];
  const seen = new Set<string>();
  const report = runBrowserStyleQa(context, instruction);

  for (const finding of report.findings) {
    if (finding.severity !== "warning") continue;
    const action = safeRepair(context, finding);
    if (!action) continue;

    const key = JSON.stringify(action);
    if (seen.has(key)) continue;
    seen.add(key);
    repairs.push({ finding, action });

    if (repairs.length >= Math.max(1, Math.min(limit, 12))) break;
  }

  return repairs;
}

export function qaRepairSummary(repairs: QaRepair[]): string {
  if (!repairs.length) {
    return "QA auto-repair: no deterministic safe repairs were identified.";
  }

  const kinds = [...new Set(repairs.map((repair) => repair.finding.kind))].join(", ");
  return `QA auto-repair: ${repairs.length} bounded repair(s) prepared for ${kinds} finding(s).`;
}
