/**
 * REVORA NAVIGATION INTELLIGENCE
 * ==============================
 *
 * Deterministic internal-link planning for the autonomous builder.
 *
 * It finds genuinely orphaned pages and proposes a small number of contextual
 * links from existing visible pages. It never invents a destination: every
 * target comes from the current tenant's page context.
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

export type NavigationRepair = {
  sourcePageId: string;
  sourceSectionId: string;
  targetPageId: string;
  targetUrl: string;
  label: string;
  score: number;
};

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/\/+$/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ");

const tokens = (value: string): Set<string> =>
  new Set(normalise(value).split(" ").filter((token) => token.length > 2));

const pageUrl = (page: AgentContext["pages"][number]): string => {
  const clean = page.slug.replace(/^\/+|\/+$/g, "").trim();
  return clean ? `/${clean}` : "/";
};

const pageText = (page: AgentContext["pages"][number]): string =>
  [
    page.title,
    page.slug,
    page.kind,
    ...page.sections.flatMap((section) => [
      section.kind,
      section.heading ?? "",
      section.subheading ?? "",
      ...section.components.map((component) =>
        [component.kind, component.label ?? "", component.body ?? ""].join(" "),
      ),
    ]),
  ].join(" ");

const isNavigationRequest = (instruction: string): boolean =>
  /\b(navigation|nav|menu|menus|link|links|internal link|connect pages|orphan|site structure|site architecture)\b/i.test(
    instruction,
  );

const hasInternalLinkTo = (
  page: AgentContext["pages"][number],
  targetUrl: string,
): boolean =>
  page.sections.some((section) =>
    section.components.some(
      (component) => component.link_url?.split("#")[0]?.split("?")[0] === targetUrl,
    ),
  );

const sectionScore = (kind: string): number => {
  if (/^(cta|hero)$/.test(kind)) return 5;
  if (/^(services|intro|benefits)$/.test(kind)) return 4;
  if (/^(footer|contact)$/.test(kind)) return 3;
  return 1;
};

/**
 * Finds up to four contextual repairs. Targets must be visible, indexable and
 * currently disconnected from the site's internal link graph.
 */
export function findNavigationRepairs(
  context: AgentContext,
  instruction: string,
  limit = 4,
): NavigationRepair[] {
  if (!isNavigationRequest(instruction)) return [];

  const visiblePages = context.pages.filter((page) => page.is_visible && !page.noindex);
  const inbound = new Map<string, number>();

  for (const page of visiblePages) inbound.set(page.id, 0);

  for (const page of visiblePages) {
    for (const section of page.sections) {
      for (const component of section.components) {
        const href = component.link_url?.split("#")[0]?.split("?")[0];
        if (!href?.startsWith("/")) continue;
        const target = visiblePages.find((candidate) => pageUrl(candidate) === href);
        if (target && target.id !== page.id) inbound.set(target.id, (inbound.get(target.id) ?? 0) + 1);
      }
    }
  }

  const orphans = visiblePages.filter(
    (page) =>
      (inbound.get(page.id) ?? 0) === 0 &&
      !/\b(home|index)\b/i.test([page.kind, page.slug, page.title].join(" ")),
  );

  const repairs: NavigationRepair[] = [];

  for (const target of orphans) {
    const targetTokens = tokens(pageText(target));
    const candidates = visiblePages
      .filter((source) => source.id !== target.id && !hasInternalLinkTo(source, pageUrl(target)))
      .map((source) => {
        const sourceTokens = tokens(pageText(source));
        let score = 0;
        for (const token of targetTokens) {
          if (sourceTokens.has(token)) score += 2;
        }
        if (source.kind === "home") score += 3;
        if (source.kind === target.kind) score += 1;

        const section = [...source.sections]
          .sort((a, b) => sectionScore(b.kind) - sectionScore(a.kind))[0];

        return { source, section, score };
      })
      .filter((candidate) => Boolean(candidate.section))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.source.title.localeCompare(b.source.title) ||
          (a.section?.sort_order ?? 0) - (b.section?.sort_order ?? 0),
      );

    const best = candidates[0];
    if (!best?.section) continue;

    repairs.push({
      sourcePageId: best.source.id,
      sourceSectionId: best.section.id,
      targetPageId: target.id,
      targetUrl: pageUrl(target),
      label: target.title || target.kind || "Learn more",
      score: best.score,
    });

    if (repairs.length >= limit) break;
  }

  return repairs;
}

/**
 * Compile repairs into native executor actions. The action vocabulary stays
 * unchanged, so existing validation, authorization and rollback still apply.
 */
export function compileNavigationRepairs(
  context: AgentContext,
  instruction: string,
  cap: number,
): { actions: AgentAction[]; repairs: NavigationRepair[] } {
  const repairs = findNavigationRepairs(context, instruction);
  const actions: AgentAction[] = [];

  for (const repair of repairs) {
    if (actions.length >= cap) break;

    actions.push({
      type: "add_component",
      sectionId: repair.sourceSectionId,
      kind: "link",
      label: repair.label,
      link_url: repair.targetUrl,
      link_label: repair.label,
    });
  }

  return { actions, repairs };
}
