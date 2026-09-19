import { MAX_ACTIONS, type AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

type KnownIds = {
  pages: Set<string>;
  sections: Set<string>;
  components: Set<string>;
};

function ids(context: AgentContext): KnownIds {
  const pages = new Set(context.pages.map((page) => page.id));
  const sections = new Set<string>();
  const components = new Set<string>();

  for (const page of context.pages) {
    for (const section of page.sections) {
      sections.add(section.id);
      for (const component of section.components) components.add(component.id);
    }
  }

  return { pages, sections, components };
}

function knownOrTemp(value: string, known: Set<string>): boolean {
  return known.has(value) || /^temp_[a-z0-9_]{1,30}$/i.test(value);
}

function key(action: AgentAction): string {
  switch (action.type) {
    case "set_section_text":
      return `${action.type}:${action.sectionId}:${action.field}`;
    case "set_section_visibility":
    case "set_section_variant":
    case "set_section_visual":
    case "set_section_effect":
    case "delete_section":
      return `${action.type}:${action.sectionId}`;
    case "set_component":
    case "set_component_visual":
    case "delete_component":
      return `${action.type}:${action.componentId}`;
    case "add_section":
      return `${action.type}:${action.pageId}:${action.ref ?? action.kind}`;
    case "add_component":
      return `${action.type}:${action.sectionId}:${action.kind}:${action.label ?? ""}`;
    case "reorder_sections":
      return `${action.type}:${action.pageId}`;
    case "add_page":
      return `${action.type}:${action.ref ?? action.slug}`;
    case "set_page":
    case "delete_page":
      return `${action.type}:${action.pageId}`;
    case "set_theme":
      return action.type;
    case "set_backdrop":
      return action.type;
    case "set_business_fact":
      return `${action.type}:${action.field}`;
  }
}

function safeAction(action: AgentAction, known: KnownIds): boolean {
  switch (action.type) {
    case "set_section_text":
    case "set_section_visibility":
    case "set_section_variant":
    case "set_section_visual":
    case "delete_section":
    case "set_section_effect":
      return knownOrTemp(action.sectionId, known.sections);

    case "set_component":
    case "set_component_visual":
    case "delete_component":
      return known.components.has(action.componentId);

    case "add_section":
      return knownOrTemp(action.pageId, known.pages) && knownOrTemp(action.ref ?? "", new Set());

    case "add_component":
      return knownOrTemp(action.sectionId, known.sections);

    case "reorder_sections":
      return knownOrTemp(action.pageId, known.pages) &&
        action.sectionIds.every((id) => knownOrTemp(id, known.sections));

    case "add_page":
      return !action.ref || /^temp_[a-z0-9_]{1,30}$/i.test(action.ref);

    case "set_page":
    case "delete_page":
      return knownOrTemp(action.pageId, known.pages);

    case "set_theme":
    case "set_backdrop":
    case "set_business_fact":
      return true;
  }
}

export type GuardResult = {
  actions: AgentAction[];
  dropped: number;
  duplicates: number;
  unsafe: number;
};

export function guardBuilderPlan(
  context: AgentContext,
  actions: AgentAction[],
  cap = MAX_ACTIONS,
): GuardResult {
  const known = ids(context);
  const seen = new Set<string>();
  const output: AgentAction[] = [];
  let duplicates = 0;
  let unsafe = 0;

  for (const action of actions) {
    if (output.length >= Math.min(cap, MAX_ACTIONS)) break;

    if (!safeAction(action, known)) {
      unsafe += 1;
      continue;
    }

    const signature = key(action);
    if (seen.has(signature)) {
      duplicates += 1;
      continue;
    }

    seen.add(signature);
    output.push(action);

    if (action.type === "add_page" && action.ref) known.pages.add(action.ref);
    if (action.type === "add_section" && action.ref) known.sections.add(action.ref);
  }

  return {
    actions: output,
    dropped: actions.length - output.length,
    duplicates,
    unsafe,
  };
}
