/**
 * Which part of the website a planned change touches, so the chat can offer
 * "Show in preview". Only real row ids count: a section or component the plan
 * is about to create has a temporary reference, which points at nothing yet.
 */
export type StepTarget = { sectionId?: string; componentId?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const real = (value: unknown): string | undefined => (typeof value === "string" && UUID.test(value) ? value : undefined);

const SECTION_ACTIONS = new Set(["set_section_text", "set_section_visibility", "set_custom_block", "set_composition", "add_component", "reorder_components", "delete_section"]);
const COMPONENT_ACTIONS = new Set(["set_component", "set_component_visual", "generate_component_image", "delete_component"]);

export function stepTargetOf(action: unknown): StepTarget | null {
  if (!action || typeof action !== "object") return null;
  const a = action as Record<string, unknown>;
  const type = typeof a["type"] === "string" ? a["type"] : "";
  if (SECTION_ACTIONS.has(type)) {
    const sectionId = real(a["sectionId"]);
    return sectionId ? { sectionId } : null;
  }
  if (COMPONENT_ACTIONS.has(type)) {
    const componentId = real(a["componentId"]);
    return componentId ? { componentId } : null;
  }
  if (type === "set_block_style") {
    const id = real(a["targetId"]);
    if (!id) return null;
    return a["target"] === "section" ? { sectionId: id } : { componentId: id };
  }
  return null;
}

/** The section a target points at, finding a component's section through the page tree. */
export function sectionOfTarget(
  target: StepTarget | null | undefined,
  pages: readonly { sections: readonly { id: string; components?: readonly { id: string }[] }[] }[],
): string | null {
  if (!target) return null;
  if (target.sectionId) return target.sectionId;
  if (!target.componentId) return null;
  for (const page of pages) for (const section of page.sections) if (section.components?.some((c) => c.id === target.componentId)) return section.id;
  return null;
}

/** The id of the page a section is on, or null. */
export function pageOfSection(pages: readonly { id: string; sections: readonly { id: string }[] }[], sectionId: string): string | null {
  return pages.find((page) => page.sections.some((section) => section.id === sectionId))?.id ?? null;
}

/**
 * The section to scroll to and pulse once a request has landed: the first applied
 * step that points at a real section, else the block the owner had tagged.
 */
export function changedSectionOf(
  steps: readonly { included?: boolean; target?: StepTarget | null }[] | null | undefined,
  pages: Parameters<typeof sectionOfTarget>[1],
  taggedId: string | null,
): string | null {
  for (const step of steps ?? []) {
    if (step.included === false) continue;
    const id = sectionOfTarget(step.target ?? null, pages);
    if (id) return id;
  }
  return taggedId;
}
