import type { AgentAction } from "@/lib/site-agent";

export type BlueprintPhase = "structure" | "content" | "visual" | "conversion" | "seo" | "verification";

export type BlueprintStep = {
  id: string;
  phase: BlueprintPhase;
  title: string;
  actionTypes: string[];
  dependsOn: string[];
  actionCount: number;
};

export type ExecutionBlueprint = {
  steps: BlueprintStep[];
  totalActions: number;
  phases: BlueprintPhase[];
  parallelizable: string[][];
};

/** Planning metadata only; the existing executor remains the mutation authority. */
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
      case "set_component_visual":
      case "set_backdrop":
      case "set_section_effect":
        return "visual";
      case "set_business_fact":
      case "set_section_visibility":
      case "set_component":
        return "conversion";
      case "set_page":
        return "seo";
      default:
        return "verification";
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
    steps.push({
      id: "phase-" + phase,
      phase,
      title: titles[phase],
      actionTypes: [...new Set(items.map((action) => action.type))],
      dependsOn: previous ? [previous.id] : [],
      actionCount: items.length,
    });
  }

  const parallelizable: string[][] = [];
  const content = steps.find((step) => step.phase === "content");
  const visual = steps.find((step) => step.phase === "visual");
  if (content && visual) parallelizable.push([content.id, visual.id]);

  return {
    steps,
    totalActions: actions.length,
    phases: steps.map((step) => step.phase),
    parallelizable,
  };
}

export function blueprintTrace(blueprint: ExecutionBlueprint): string {
  if (!blueprint.steps.length) return "Autonomous Brain v9: no executable steps were produced.";
  const summary = blueprint.steps.map((step) => step.phase + ":" + step.actionCount).join(", ");
  return [
    `Autonomous Brain v9: built a ${blueprint.steps.length}-phase execution blueprint (${summary}).`,
    blueprint.parallelizable.length
      ? `Autonomous Brain v9: identified ${blueprint.parallelizable.length} planning parallelism opportunity.`
      : "Autonomous Brain v9: no independent phase parallelism was inferred.",
  ].join(" ");
}
