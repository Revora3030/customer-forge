import type { AgentAction } from "@/lib/site-agent";

export type AccessibilitySignals = { unnamedMedia: number; unnamedButtons: number; emptyHeadings: number };

export function accessibilitySignals(sections: Array<{ heading?: string | null; components: Array<{ kind: string; label?: string | null; link_label?: string | null }> }>): AccessibilitySignals {
  let unnamedMedia = 0, unnamedButtons = 0, emptyHeadings = 0;
  for (const section of sections) {
    if (!String(section.heading ?? "").trim()) emptyHeadings++;
    for (const component of section.components) {
      if (["image", "gallery", "media", "photo"].includes(component.kind) && !String(component.label ?? "").trim()) unnamedMedia++;
      if (component.kind === "button" && !String(component.label ?? component.link_label ?? "").trim()) unnamedButtons++;
    }
  }
  return { unnamedMedia, unnamedButtons, emptyHeadings };
}

export function compileAccessibilityAutopilot(sections: Array<{ id: string; kind: string; components: Array<{ id: string; kind: string; label?: string | null; link_label?: string | null }> }>, businessName: string, cap: number): AgentAction[] {
  const actions: AgentAction[] = [];
  for (const section of sections) {
    for (const component of section.components) {
      if (actions.length >= cap) return actions;
      if (["image", "gallery", "media", "photo"].includes(component.kind)) {
        actions.push({ type: "set_component_visual", componentId: component.id, patch: { alt: String(component.label ?? "").trim().slice(0, 160) || businessName + " image" } });
      }
    }
  }
  return actions;
}
