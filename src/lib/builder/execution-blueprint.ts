import type { AgentAction } from "@/lib/site-agent";

export type BlueprintPhase = "structure" | "content" | "visual" | "conversion" | "seo" | "verification";
export type BlueprintRisk = "low" | "medium" | "high";

export type BlueprintStep = {
  id: string;
  phase: BlueprintPhase;
  title: string;
  actionTypes: string[];
  dependsOn: string[];
  actionCount: number;
  risk: BlueprintRisk;
  impact: string;
  approvalRequired: boolean;
};

export type ExecutionBlueprint = {
  steps: BlueprintStep[];
  totalActions: number;
  phases: BlueprintPhase[];
  parallelizable: string[][];
  criticalPath: string[];
  requiresApproval: boolean;
  risk: BlueprintRisk;
  impactSummary: string;
  approvalCheckpoints: string[];
};

/**
 * Planning metadata only; the existing executor remains the mutation authority.
 *
 * v10 adds a real plan-mode contract: phase dependencies, risk, expected
 * impact, and approval checkpoints are computed before execution. Nothing in
 * this module mutates a site or changes executor authorization.
 */
export function buildExecutionBlueprint(actions: AgentAction[]): ExecutionBlueprint {
  const groups: Record<BlueprintPhase, AgentAction[]> = {
    structure: [], content: [], visual: [], conversion: [], seo: [], verification: [],
  };

  const classify = (action: AgentAction): BlueprintPhase => {
    switch (action.type) {
      case "add_page":
      case "delete_page":
      case "add_section":
      case "delete_section":
      case "reorder_sections":
        return "structure";
      case "set_section_text":
      case "set_component":
      case "add_component":
      case "delete_component":
        return "content";
      case "set_theme":
      case "set_section_variant":
      case "set_section_visual":
      case "set_ai_visual":
      case "set_ai_responsive":
      case "set_ai_component_visual":
      case "set_ai_component_responsive":
      case "set_component_visual":
      case "set_backdrop":
      case "set_section_effect":
        return "visual";
      case "set_business_fact":
      case "set_section_visibility":
        return "conversion";
      case "set_page":
        return "seo";
      default:
        return "verification";
    }
  };

  const riskOf = (action: AgentAction): BlueprintRisk => {
    switch (action.type) {
      case "delete_page":
      case "delete_section":
      case "delete_component":
      case "set_business_fact":
        return "high";
      case "add_page":
      case "add_section":
      case "set_page":
      case "set_section_visibility":
      case "reorder_sections":
        return "medium";
      default:
        return "low";
    }
  };

  const impactOf = (phase: BlueprintPhase): string => {
    switch (phase) {
      case "structure":
        return "Changes site structure or page composition.";
      case "content":
        return "Changes customer-facing copy or components.";
      case "visual":
        return "Changes presentation without changing business facts.";
      case "conversion":
        return "Changes business-facing facts or visibility and can affect customer journeys.";
      case "seo":
        return "Changes search metadata and indexing-facing signals.";
      case "verification":
        return "Keeps unsupported or future actions isolated for verification.";
    }
  };

  for (const action of actions) groups[classify(action)].push(action);

  const order: BlueprintPhase[] = ["structure", "content", "visual", "conversion", "seo", "verification"];
  const titles: Record<BlueprintPhase, string> = {
    structure: "Establish page and section structure",
    content: "Apply content and component changes",
    visual: "Apply visual and design changes",
    conversion: "Strengthen conversion paths",
    seo: "Apply search metadata changes",
    verification: "Leave the plan ready for verification",
  };

  const steps: BlueprintStep[] = [];
  for (const phase of order) {
    const items = groups[phase];
    if (!items.length) continue;

    const previous = steps[steps.length - 1];
    const risks = items.map(riskOf);
    const risk: BlueprintRisk = risks.includes("high")
      ? "high"
      : risks.includes("medium")
        ? "medium"
        : "low";

    steps.push({
      id: "phase-" + phase,
      phase,
      title: titles[phase],
      actionTypes: [...new Set(items.map((action) => action.type))],
      dependsOn: previous ? [previous.id] : [],
      actionCount: items.length,
      risk,
      impact: impactOf(phase),
      approvalRequired: risk !== "low",
    });
  }

  const parallelizable: string[][] = [];
  const content = steps.find((step) => step.phase === "content");
  const visual = steps.find((step) => step.phase === "visual");
  if (content && visual) parallelizable.push([content.id, visual.id]);

  const criticalPath = steps.map((step) => step.id);
  const requiresApproval = steps.some((step) => step.approvalRequired);
  const risk: BlueprintRisk = steps.some((step) => step.risk === "high")
    ? "high"
    : steps.some((step) => step.risk === "medium")
      ? "medium"
      : "low";

  const approvalCheckpoints = steps
    .filter((step) => step.approvalRequired)
    .map((step) => step.id);

  const impactSummary = steps.length
    ? steps.map((step) => step.impact).join(" ")
    : "No site changes are planned.";

  return {
    steps,
    totalActions: actions.length,
    phases: steps.map((step) => step.phase),
    parallelizable,
    criticalPath,
    requiresApproval,
    risk,
    impactSummary,
    approvalCheckpoints,
  };
}

export function blueprintTrace(blueprint: ExecutionBlueprint): string {
  if (!blueprint.steps.length) return "Autonomous Brain v10: no executable steps were produced.";

  const summary = blueprint.steps.map((step) => step.phase + ":" + step.actionCount).join(", ");
  return [
    `Autonomous Brain v10: built a ${blueprint.steps.length}-phase execution blueprint (${summary}).`,
    `Autonomous Brain v10: overall risk is ${blueprint.risk}; approval ${blueprint.requiresApproval ? "is required for one or more phases" : "is not required"}.`,
    blueprint.approvalCheckpoints.length
      ? `Autonomous Brain v10: approval checkpoints: ${blueprint.approvalCheckpoints.join(", ")}.`
      : "Autonomous Brain v10: no approval checkpoints were required.",
    blueprint.parallelizable.length
      ? `Autonomous Brain v10: identified ${blueprint.parallelizable.length} planning parallelism opportunity.`
      : "Autonomous Brain v10: no independent phase parallelism was inferred.",
  ].join(" ");
}
