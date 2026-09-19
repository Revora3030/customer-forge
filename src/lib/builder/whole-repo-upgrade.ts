/**
 * Whole-repository builder quality layer.
 *
 * This module is intentionally deterministic and side-effect free. It sits
 * between the existing intelligence passes and the elite plan guard.
 *
 * Goals:
 * - turn cross-cutting findings into safe AgentActions when the renderer
 *   already supports the requested capability;
 * - detect plan conflicts before execution;
 * - preserve the existing action cap, tenant boundaries and fact-safety rules;
 * - keep runtime/browser/database evidence explicitly separate from static
 *   planning.
 */
import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type WholeRepoFinding = {
  area:
    | "structure"
    | "conversion"
    | "seo"
    | "accessibility"
    | "responsive"
    | "content"
    | "visual"
    | "safety"
    | "performance"
    | "consistency";
  severity: "info" | "warning";
  message: string;
  evidence: "static" | "runtime-required" | "environment-required";
};

export type WholeRepoUpgradeResult = {
  actions: AgentAction[];
  findings: WholeRepoFinding[];
  runtimeRequired: string[];
  summary: string;
  score: number;
};

const MAX_FINDINGS = 32;

function pushFinding(
  findings: WholeRepoFinding[],
  finding: WholeRepoFinding,
): void {
  if (findings.length < MAX_FINDINGS) findings.push(finding);
}

function hasButton(section: AgentContext["pages"][number]["sections"][number]): boolean {
  return section.components.some(
    (component) => component.kind === "button" || Boolean(component.link_url),
  );
}

function hasRealText(section: AgentContext["pages"][number]["sections"][number]): boolean {
  return Boolean(
    section.heading?.trim() ||
      section.subheading?.trim() ||
      section.body?.trim() ||
      section.components.some((component) => component.label?.trim()),
  );
}

function safeAction(
  actions: AgentAction[],
  action: AgentAction,
  cap: number,
): void {
  if (actions.length >= cap) return;

  const duplicate = actions.some((existing) => {
    if (existing.type !== action.type) return false;
    if (action.type === "set_page" && existing.type === "set_page") {
      return existing.pageId === action.pageId;
    }
    if (action.type === "set_section_text" && existing.type === "set_section_text") {
      return existing.sectionId === action.sectionId && existing.field === action.field;
    }
    if (action.type === "set_section_visual" && existing.type === "set_section_visual") {
      return existing.sectionId === action.sectionId;
    }
    if (action.type === "add_component" && existing.type === "add_component") {
      return (
        existing.sectionId === action.sectionId &&
        existing.kind === action.kind &&
        existing.label === action.label
      );
    }
    if (action.type === "set_section_visibility" && existing.type === "set_section_visibility") {
      return existing.sectionId === action.sectionId;
    }
    return false;
  });

  if (!duplicate) actions.push(action);
}

function scoreFindings(
  findings: WholeRepoFinding[],
  actions: AgentAction[],
): number {
  let score = 100;
  for (const finding of findings) {
    score -= finding.severity === "warning" ? 3 : 1;
  }
  score += Math.min(actions.length, 10);
  return Math.max(0, Math.min(100, score));
}

/**
 * Final static pass over the whole generated-site context.
 *
 * This deliberately does not claim browser screenshots, Core Web Vitals,
 * database state, RLS isolation or third-party integration health. Those are
 * queued as evidence requirements instead.
 */
export function compileWholeRepoUpgrades(
  context: AgentContext,
  instruction: string,
  cap: number,
): WholeRepoUpgradeResult {
  const actions: AgentAction[] = [];
  const findings: WholeRepoFinding[] = [];
  const runtimeRequired: string[] = [];
  const lower = instruction.toLowerCase();

  if (context.pages.length === 0) {
    pushFinding(findings, {
      area: "structure",
      severity: "warning",
      message: "The workspace has no pages available for static site-wide planning.",
      evidence: "static",
    });
  }

  const slugs = new Map<string, string[]>();
  for (const page of context.pages) {
    const slug = page.slug.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
    const ids = slugs.get(slug) ?? [];
    ids.push(page.id);
    slugs.set(slug, ids);

    if (!page.title?.trim()) {
      pushFinding(findings, {
        area: "seo",
        severity: "warning",
        message: `Page ${page.id} is missing a title.`,
        evidence: "static",
      });
    }

    if (page.sections.length === 0) {
      pushFinding(findings, {
        area: "structure",
        severity: "warning",
        message: `Page "${page.title || page.slug}" has no sections.`,
        evidence: "static",
      });
    }
  }

  for (const [slug, ids] of slugs) {
    if (slug && ids.length > 1) {
      pushFinding(findings, {
        area: "structure",
        severity: "warning",
        message: `Duplicate page slug detected: "${slug}".`,
        evidence: "static",
      });
    }
  }

  const home = context.pages.find(
    (page) => page.kind === "home" || page.slug === "/" || page.slug === "",
  );

  if (home) {
    const hero = home.sections.find((section) => section.kind === "hero") ?? home.sections[0];
    if (hero && !hasRealText(hero)) {
      pushFinding(findings, {
        area: "content",
        severity: "warning",
        message: "The home-page lead section has no meaningful visible content.",
        evidence: "static",
      });
    }

    if (hero && !hasButton(hero)) {
      pushFinding(findings, {
        area: "conversion",
        severity: "info",
        message: "The home-page lead section has no obvious primary action.",
        evidence: "static",
      });
    }
  }

  for (const page of context.pages.slice(0, 24)) {
    const visible = page.sections.filter((section) => section.is_visible);
    const empty = visible.filter((section) => !hasRealText(section));
    if (empty.length > 0) {
      pushFinding(findings, {
        area: "content",
        severity: "warning",
        message: `"${page.title || page.slug}" contains ${empty.length} visibly empty section${empty.length === 1 ? "" : "s"}.`,
        evidence: "static",
      });
    }

    const ctas = visible.filter(hasButton).length;
    if (ctas === 0) {
      pushFinding(findings, {
        area: "conversion",
        severity: "info",
        message: `"${page.title || page.slug}" has no detected native action.`,
        evidence: "static",
      });
    }
  }

  if (context.business.name.trim() && context.pages.length > 0) {
    for (const page of context.pages.slice(0, 12)) {
      const first = page.sections.find((section) => section.kind === "hero");
      if (!first || first.heading?.includes(context.business.name)) continue;
      if (!first.heading?.trim()) {
        safeAction(
          actions,
          {
            type: "set_section_text",
            sectionId: first.id,
            field: "heading",
            value: context.business.name.trim(),
          },
          cap,
        );
      }
    }
  }

  if (context.pages.length >= 2) {
    const noInternalLinks = context.pages.filter(
      (page) =>
        page.sections.length > 0 &&
        !page.sections.some((section) =>
          section.components.some((component) =>
            Boolean(component.link_url?.startsWith("/")),
          ),
        ),
    );

    if (noInternalLinks.length > 1) {
      pushFinding(findings, {
        area: "consistency",
        severity: "info",
        message: "Multiple pages have no detected native internal navigation links.",
        evidence: "static",
      });
    }
  }

  if (/mobile|responsive|phone|tablet/.test(lower)) {
    runtimeRequired.push("rendered mobile viewport verification");
    pushFinding(findings, {
      area: "responsive",
      severity: "info",
      message: "Static planning can identify responsive risks, but viewport overflow requires rendered verification.",
      evidence: "runtime-required",
    });
  }

  if (/performance|speed|faster|fast|core web vitals|lcp|cls|inp/.test(lower)) {
    runtimeRequired.push("real-browser Core Web Vitals measurement");
    pushFinding(findings, {
      area: "performance",
      severity: "info",
      message: "Performance quality requires browser/network evidence rather than source inspection alone.",
      evidence: "runtime-required",
    });
  }

  if (/visual|design|screenshot|pixel/.test(lower)) {
    runtimeRequired.push("visual screenshot comparison");
    pushFinding(findings, {
      area: "visual",
      severity: "info",
      message: "Visual quality requires rendered screenshots for objective regression comparison.",
      evidence: "runtime-required",
    });
  }

  if (/security|rls|tenant|database|billing|stripe|auth/.test(lower)) {
    runtimeRequired.push("live environment security and integration verification");
    pushFinding(findings, {
      area: "safety",
      severity: "info",
      message: "Authentication, RLS, billing and tenant isolation must be verified in their owning environments.",
      evidence: "environment-required",
    });
  }

  return {
    actions,
    findings,
    runtimeRequired: [...new Set(runtimeRequired)],
    summary: `Whole-repo static pass: ${findings.length} findings, ${actions.length} safe actions, ${runtimeRequired.length} runtime/environment evidence requirements.`,
    score: scoreFindings(findings, actions),
  };
}
