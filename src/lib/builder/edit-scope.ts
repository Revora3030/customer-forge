/**
 * Edit-intent scoping for chat-driven website changes.
 *
 * The AI planner is asked to declare the smallest scope its plan touches
 * (one block, some sections, whole pages, or the whole site). This module
 * turns that declaration — and the point-and-edit block id already embedded
 * in selected-block instructions — into a server-enforced boundary: actions
 * that target existing sections, components or pages OUTSIDE the declared
 * scope are dropped before the plan is applied, with a note explaining why.
 *
 * This is not the removed keyword gate: it never decides the plan from words
 * in the request. The model still authors every change; scoping only refuses
 * writes the plan itself said were out of bounds (or that lie outside the
 * block the owner literally pointed at). Anything whose target cannot be
 * proven out of scope — temp refs, unknown ids — is kept.
 */

/** Minimal structural view of the live website the scoper needs. */
export interface EditScopeContext {
  pages: {
    id: string;
    sections: { id: string; components: { id: string }[] }[];
  }[];
}

export interface DeclaredEditScope {
  breadth: "style" | "section" | "page" | "site";
  sectionIds: string[];
  pageIds: string[];
}

/** Point-and-edit instructions start with a selectionPrefix naming the block id. */
const SELECTION_BLOCK = /block \(id ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i;

/**
 * The section the owner pointed at, when the instruction carries the
 * selection prefix the builder adds. Only trusted near the start of the
 * instruction, and only when the id is a real section on the live site.
 */
export function selectionScopeFromInstruction(
  instruction: string,
  context: EditScopeContext,
): string | null {
  const head = instruction.slice(0, 240);
  const match = SELECTION_BLOCK.exec(head);
  const id = match?.[1]?.toLowerCase();
  if (!id) return null;
  const exists = context.pages.some((page) => page.sections.some((section) => section.id.toLowerCase() === id));
  return exists ? id : null;
}

/**
 * Reads the scope the planner declared in its reply. Only a well-formed
 * declaration with ids that exist on the live site is honored; a missing or
 * unusable declaration means no enforcement (the plan applies as before).
 */
export function declaredScopeFromProposal(
  proposal: Record<string, unknown> | null,
  context: EditScopeContext,
): DeclaredEditScope | null {
  const raw = proposal?.["scope"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const breadth = record["breadth"];
  if (breadth !== "style" && breadth !== "section" && breadth !== "page" && breadth !== "site") return null;
  if (breadth === "site") return { breadth, sectionIds: [], pageIds: [] };

  const knownSections = new Set(context.pages.flatMap((page) => page.sections.map((section) => section.id.toLowerCase())));
  const knownPages = new Set(context.pages.map((page) => page.id.toLowerCase()));
  const ids = (value: unknown, known: Set<string>) =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.toLowerCase())
          .filter((item) => known.has(item))
          .slice(0, 40)
      : [];

  const sectionIds = ids(record["sectionIds"], knownSections);
  const pageIds = ids(record["pageIds"], knownPages);
  // A narrow declaration with no surviving real ids cannot be enforced
  // safely — treating it as authoritative would delete the whole plan.
  if (!sectionIds.length && !pageIds.length) return null;
  return { breadth, sectionIds, pageIds };
}

const TEMP_REF = /^temp_/;

type Target = { sections: Set<string>; orgWide: boolean };

/**
 * Resolves which existing sections an action writes to. Unknown ids (temp
 * refs created inside the same plan, or anything not on the live site) are
 * not resolved, so they can never be used to prove an action out of scope.
 */
function actionTargets(action: unknown, sectionOfComponent: Map<string, string>, sectionsOfPage: Map<string, Set<string>>): Target {
  const record = (action ?? {}) as Record<string, unknown>;
  const type = typeof record["type"] === "string" ? record["type"] : "";
  const sections = new Set<string>();
  const addId = (value: unknown) => {
    if (typeof value !== "string" || !value || TEMP_REF.test(value)) return;
    sections.add(value.toLowerCase());
  };
  switch (type) {
    case "set_section_text":
    case "set_section_visibility":
    case "set_composition":
    case "delete_section":
    case "add_component":
      addId(record["sectionId"]);
      break;
    case "set_block_style": {
      const targetId = record["targetId"];
      if (typeof targetId === "string" && targetId && !TEMP_REF.test(targetId)) {
        if (record["target"] === "component") {
          const section = sectionOfComponent.get(targetId.toLowerCase());
          if (section) sections.add(section);
        } else {
          sections.add(targetId.toLowerCase());
        }
      }
      break;
    }
    case "set_component":
    case "set_component_visual":
    case "delete_component":
    case "generate_component_image": {
      const componentId = record["componentId"];
      if (typeof componentId === "string" && componentId && !TEMP_REF.test(componentId)) {
        const section = sectionOfComponent.get(componentId.toLowerCase());
        if (section) sections.add(section);
      }
      break;
    }
    case "add_section":
    case "reorder_sections":
    case "set_page": {
      const pageId = record["pageId"];
      if (typeof pageId === "string" && pageId && !TEMP_REF.test(pageId)) {
        const pageSections = sectionsOfPage.get(pageId.toLowerCase());
        // A page-level action writes the page itself, not each section:
        // represent it with a synthetic marker keyed on the page id.
        sections.add(`page:${pageId.toLowerCase()}`);
        void pageSections;
      }
      break;
    }
    case "add_page":
      // Creates a brand-new page; out of bounds for any scoped edit.
      return { sections, orgWide: true };
    case "set_theme":
    case "set_business_fact":
      return { sections, orgWide: true };
    default:
      break;
  }
  return { sections, orgWide: false };
}

/**
 * Drops actions that provably write outside the scope. Returns the surviving
 * actions plus owner-facing notes for everything removed. Fail-safe: if
 * enforcement would remove every action, the scope is ignored entirely — a
 * plan the model scoped wrong must still reach the owner unchanged rather
 * than silently becoming a no-op.
 */
export function applyEditScope(
  actions: unknown[],
  context: EditScopeContext,
  scope: { sectionIds: string[] } | { pageIds: string[] },
): { actions: unknown[]; notes: string[] } {
  const allowedSections = new Set<string>();
  const allowedPages = new Set<string>();
  if ("sectionIds" in scope) {
    for (const id of scope.sectionIds) allowedSections.add(id.toLowerCase());
  }
  if ("pageIds" in scope) {
    for (const id of scope.pageIds) allowedPages.add(id.toLowerCase());
    for (const page of context.pages) {
      if (allowedPages.has(page.id.toLowerCase())) {
        for (const section of page.sections) allowedSections.add(section.id.toLowerCase());
      }
    }
  }

  const sectionOfComponent = new Map<string, string>();
  const sectionsOfPage = new Map<string, Set<string>>();
  for (const page of context.pages) {
    const sectionIds = new Set<string>();
    for (const section of page.sections) {
      sectionIds.add(section.id.toLowerCase());
      for (const component of section.components) sectionOfComponent.set(component.id.toLowerCase(), section.id.toLowerCase());
    }
    sectionsOfPage.set(page.id.toLowerCase(), sectionIds);
  }

  const kept: unknown[] = [];
  const notes: string[] = [];
  let dropped = 0;
  for (const action of actions) {
    const target = actionTargets(action, sectionOfComponent, sectionsOfPage);
    const outOfScope = target.orgWide
      ? true
      : [...target.sections].some((section) =>
          section.startsWith("page:") ? !allowedPages.has(section.slice(5)) : !allowedSections.has(section),
        );
    if (outOfScope) {
      dropped += 1;
      continue;
    }
    kept.push(action);
  }

  if (dropped === 0) return { actions, notes };
  if (kept.length === 0) {
    return {
      actions,
      notes: ["The declared edit scope matched none of the planned changes, so the scope check was skipped rather than dropping the whole plan."],
    };
  }
  notes.push(
    dropped === 1
      ? "One change outside the requested block or page was left out to keep this edit focused."
      : `${dropped} changes outside the requested block or page were left out to keep this edit focused.`,
  );
  return { actions: kept, notes };
}
