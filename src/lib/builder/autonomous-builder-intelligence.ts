/**
 * REVORA COMPLETE AUTONOMOUS BUILDER INTELLIGENCE
 * ===============================================
 *
 * A deterministic orchestration layer that turns the builder's existing
 * specialist systems into one bounded quality pipeline:
 *
 * understand → plan → build → inspect → repair → re-test → report.
 *
 * This module intentionally does not execute writes. The existing Site Agent
 * remains the only execution boundary.
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import { browserQaSummary, runBrowserStyleQa, type BrowserQaReport } from "./browser-qa-intelligence";
import { scoreDesignQuality, type DesignQualityScore } from "./design-quality";
import { scoreMobileQuality, type MobileQualityScore } from "./mobile-quality";
import { buildSiteContextGraph, type SiteContextGraph } from "./context-graph";
import { buildExecutionBlueprint, type ExecutionBlueprint } from "./execution-blueprint";
import { compareVerification, type RetestDecision } from "./qa-retest-loop";

export type AutonomousPhase =
  | "understand"
  | "context"
  | "plan"
  | "execute"
  | "verify"
  | "repair"
  | "retest"
  | "report";

export type AutonomousTask = {
  id: string;
  phase: AutonomousPhase;
  title: string;
  dependsOn: string[];
  risk: "low" | "medium" | "high";
  status: "ready" | "pending" | "blocked";
};

export type BuilderCapability =
  | "agent-planning"
  | "context-targeting"
  | "sitewide-editing"
  | "design"
  | "hero"
  | "media"
  | "motion"
  | "responsive"
  | "accessibility"
  | "performance"
  | "seo"
  | "architecture"
  | "conversion"
  | "cro"
  | "qa"
  | "runtime"
  | "visual-regression"
  | "self-healing"
  | "production-safety";

export type AutonomousQualityReport = {
  score: number;
  capabilities: Record<BuilderCapability, "available" | "signal" | "requires-runtime">;
  browserQa: BrowserQaReport;
  design: DesignQualityScore;
  mobile: MobileQualityScore;
  context: SiteContextGraph;
  blueprint: ExecutionBlueprint;
  tasks: AutonomousTask[];
  repairCandidates: number;
  unresolvedCritical: number;
  summary: string;
};

const CAPABILITIES: BuilderCapability[] = [
  "agent-planning", "context-targeting", "sitewide-editing", "design", "hero",
  "media", "motion", "responsive", "accessibility", "performance", "seo",
  "architecture", "conversion", "cro", "qa", "runtime", "visual-regression",
  "self-healing", "production-safety",
];

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function buildAutonomousTaskPlan(
  actions: AgentAction[],
  instruction: string,
): AutonomousTask[] {
  const lower = instruction.toLowerCase();
  const wants = (terms: string[]) => terms.some((term) => lower.includes(term));

  const tasks: AutonomousTask[] = [
    { id: "understand", phase: "understand", title: "Interpret the request and preserve business facts", dependsOn: [], risk: "low", status: "ready" },
    { id: "context", phase: "context", title: "Build site-wide context and resolve targets", dependsOn: ["understand"], risk: "low", status: "ready" },
    { id: "plan", phase: "plan", title: "Create a bounded execution plan with dependencies", dependsOn: ["context"], risk: "low", status: "ready" },
    { id: "execute", phase: "execute", title: `Apply ${actions.length} validated native website action(s)`, dependsOn: ["plan"], risk: actions.some((a) => /delete_|set_business_fact/.test(a.type)) ? "high" : actions.length > 8 ? "medium" : "low", status: actions.length ? "ready" : "blocked" },
    { id: "verify", phase: "verify", title: "Inspect the result and identify regressions", dependsOn: ["execute"], risk: "low", status: actions.length ? "ready" : "blocked" },
    { id: "repair", phase: "repair", title: "Generate only safe repairs for verified failures", dependsOn: ["verify"], risk: "medium", status: "pending" },
    { id: "retest", phase: "retest", title: "Re-test repairs and compare quality before/after", dependsOn: ["repair"], risk: "low", status: "pending" },
    { id: "report", phase: "report", title: "Explain completed work and unresolved issues", dependsOn: ["verify", "retest"], risk: "low", status: "ready" },
  ];

  if (wants(["visual", "premium", "design", "hero"])) {
    tasks.push({ id: "design", phase: "execute", title: "Optimize visual hierarchy and premium composition", dependsOn: ["plan"], risk: "low", status: "ready" });
  }
  if (wants(["mobile", "responsive", "tablet", "phone"])) {
    tasks.push({ id: "responsive", phase: "execute", title: "Optimize mobile, tablet and responsive layout signals", dependsOn: ["plan"], risk: "low", status: "ready" });
  }
  if (wants(["seo", "search", "google", "local"])) {
    tasks.push({ id: "seo", phase: "execute", title: "Optimize page and site-wide search signals", dependsOn: ["plan"], risk: "low", status: "ready" });
  }
  if (wants(["accessibility", "accessible", "keyboard", "screen reader"])) {
    tasks.push({ id: "a11y", phase: "execute", title: "Audit accessibility structure and safe repairs", dependsOn: ["plan"], risk: "low", status: "ready" });
  }
  if (wants(["conversion", "cta", "lead", "booking", "contact"])) {
    tasks.push({ id: "conversion", phase: "execute", title: "Strengthen the conversion path", dependsOn: ["plan"], risk: "medium", status: "ready" });
  }

  return tasks;
}

export function compareRetestQuality(
  before: BrowserQaReport | null,
  after: BrowserQaReport | null,
  attempt: number,
): RetestDecision {
  if (!after) {
    return compareVerification(null, null, attempt);
  }

  const beforeVerification = before
    ? {
        checks: [],
        critical: 0,
        warnings: before.findings.filter((f) => f.severity !== "critical").length,
        passed: before.checksRun,
        score: before.score,
        categories: {
          content: { passed: 0, failed: 0 }, seo: { passed: 0, failed: 0 },
          accessibility: { passed: 0, failed: 0 }, conversion: { passed: 0, failed: 0 },
          technical: { passed: 0, failed: 0 }, security: { passed: 0, failed: 0 },
        },
        summary: browserQaSummary(before),
      }
    : null;

  const afterVerification = {
    checks: [],
    critical: 0,
    warnings: after.findings.filter((f) => f.severity !== "critical").length,
    passed: after.checksRun,
    score: after.score,
    categories: {
      content: { passed: 0, failed: 0 }, seo: { passed: 0, failed: 0 },
      accessibility: { passed: 0, failed: 0 }, conversion: { passed: 0, failed: 0 },
      technical: { passed: 0, failed: 0 }, security: { passed: 0, failed: 0 },
    },
    summary: browserQaSummary(after),
  };

  return compareVerification(beforeVerification, afterVerification, attempt);
}

export function auditAutonomousBuilder(
  context: AgentContext,
  actions: AgentAction[],
  instruction: string,
): AutonomousQualityReport {
  const browserQa = runBrowserStyleQa(context, instruction);
  const design = scoreDesignQuality(context);
  const mobile = scoreMobileQuality(context);
  const graph = buildSiteContextGraph(context);
  const blueprint = buildExecutionBlueprint(actions);
  const tasks = buildAutonomousTaskPlan(actions, instruction);

  const critical = browserQa.findings.filter((finding) => finding.severity === "critical").length;
  const issuePenalty = Math.min(35, critical * 12 + browserQa.findings.length * 3);
  const score = clamp(
    design.score * 0.25 +
      mobile.score * 0.15 +
      browserQa.score * 0.30 +
      (graph.orphanPages.length === 0 ? 100 : Math.max(0, 100 - graph.orphanPages.length * 15)) * 0.10 +
      (blueprint.risk === "low" ? 100 : blueprint.risk === "medium" ? 85 : 65) * 0.10 +
      (actions.length > 0 ? 100 : 50) * 0.10 -
      issuePenalty,
  );

  const capabilities = Object.fromEntries(
    CAPABILITIES.map((capability) => [
      capability,
      capability === "runtime" || capability === "visual-regression" ? "requires-runtime" : "available",
    ]),
  ) as Record<BuilderCapability, "available" | "signal" | "requires-runtime">;

  if (mobile.score < 70) capabilities.responsive = "signal";
  if (design.score < 70) capabilities.design = "signal";
  if (browserQa.findings.some((finding) => finding.kind === "seo")) capabilities.seo = "signal";
  if (browserQa.findings.some((finding) => finding.kind === "accessibility")) capabilities.accessibility = "signal";
  if (critical > 0) capabilities["self-healing"] = "signal";

  return {
    score,
    capabilities,
    browserQa,
    design,
    mobile,
    context: graph,
    blueprint,
    tasks,
    repairCandidates: browserQa.findings.filter((finding) => finding.severity !== "critical").length,
    unresolvedCritical: critical,
    summary: `Autonomous builder quality audit: ${score}/100; ${tasks.length} coordinated tasks, ${browserQa.findings.length} QA finding(s), ${critical} critical.`,
  };
}

export function autonomousAuditSummary(report: AutonomousQualityReport): string {
  return report.summary;
}
