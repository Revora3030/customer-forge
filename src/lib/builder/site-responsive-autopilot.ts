import type { AgentAction, SectionVisualPatch } from "@/lib/site-agent";

const MOBILE_SAFE: Record<string, SectionVisualPatch> = {
  hero: { layout: "stacked", density: "airy", spacing: "generous", max_width: "standard" },
  services: { layout: "stacked", density: "balanced", spacing: "standard", max_width: "standard" },
  gallery: { layout: "stacked", density: "balanced", spacing: "standard", image_ratio: "4:3" },
  pricing: { layout: "stacked", density: "balanced", spacing: "standard", max_width: "standard" },
  contact: { layout: "stacked", density: "balanced", spacing: "standard", max_width: "standard" },
  booking: { layout: "stacked", density: "balanced", spacing: "standard", max_width: "standard" },
  quote: { layout: "stacked", density: "balanced", spacing: "standard", max_width: "standard" },
};

export function compileResponsiveAutopilot(sections: Array<{ id: string; kind: string }>, cap: number): AgentAction[] {
  const actions: AgentAction[] = [];
  for (const section of sections) {
    if (actions.length >= cap) break;
    const patch = MOBILE_SAFE[section.kind];
    if (patch) actions.push({ type: "set_section_visual", sectionId: section.id, patch });
  }
  return actions;
}
