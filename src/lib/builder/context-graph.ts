/**
 * REVORA SITE CONTEXT GRAPH
 * -------------------------
 * Pure structural intelligence for the autonomous builder.
 *
 * Turns the flat site map into a bounded graph of pages, sections and
 * components, plus deterministic relationships and semantic signals. This
 * gives planning/critique code a shared model of how a site is connected
 * without querying a database, calling an AI provider, or mutating anything.
 */

import type { AgentContext, SiteMapPage } from "@/lib/site-agent.server";

export type ContextNodeKind = "page" | "section" | "component";

export type ContextNode = {
  id: string;
  kind: ContextNodeKind;
  parentId: string | null;
  pageId: string;
  label: string;
  semanticKinds: string[];
  visible: boolean;
  noindex: boolean;
};

export type ContextEdgeKind = "contains" | "links_to" | "semantic";

export type ContextEdge = {
  from: string;
  to: string;
  kind: ContextEdgeKind;
};

export type PageContextSignal = {
  pageId: string;
  pageKind: string;
  title: string;
  slug: string;
  inboundLinks: number;
  outboundLinks: number;
  sectionKinds: string[];
  semanticKinds: string[];
  isEntryPoint: boolean;
  isConversionPage: boolean;
  isOrphan: boolean;
};

export type SiteContextGraph = {
  nodes: ContextNode[];
  edges: ContextEdge[];
  pages: PageContextSignal[];
  entryPoints: string[];
  conversionPages: string[];
  orphanPages: string[];
};

const normalise = (value: string): string =>
  value.toLowerCase().trim().replace(/^\/+|\/+$/g, "").replace(/\s+/g, " ");

const slug = (value: string): string =>
  normalise(value).replace(/[^a-z0-9\s-]/g, "").replace(/[\s-]+/g, "-");

const semanticKinds = (page: SiteMapPage): string[] => {
  const text = [
    page.title,
    page.slug,
    page.kind,
    ...page.sections.flatMap((section) => [
      section.kind,
      section.heading ?? "",
      ...section.components.map((component) => [
        component.kind,
        component.label ?? "",
        component.link_label ?? "",
      ].join(" ")),
    ]),
  ].join(" ").toLowerCase();

  const kinds: string[] = [];
  const add = (kind: string, pattern: RegExp) => {
    if (pattern.test(text)) kinds.push(kind);
  };

  add("conversion", /\b(book|booking|schedule|appointment|quote|estimate|contact|get started|request|call)\b/);
  add("services", /\b(service|services|offer|solutions|what we do)\b/);
  add("trust", /\b(review|reviews|testimonial|testimonials|trust|rating|feedback)\b/);
  add("seo", /\b(local|location|area|city|seo|search)\b/);
  add("pricing", /\b(price|pricing|cost|rate|package)\b/);
  add("content", /\b(blog|article|guide|faq|about|story)\b/);

  return [...new Set(kinds)];
};

const isConversionPage = (page: SiteMapPage): boolean =>
  semanticKinds(page).includes("conversion") ||
  /\b(book|booking|contact|quote|estimate|schedule)\b/i.test(
    [page.title, page.slug, page.kind].join(" "),
  );

const pageUrl = (page: SiteMapPage): string => {
  const value = normalise(page.slug);
  return value ? `/${value}` : "/";
};

function resolveInternalTarget(context: AgentContext, href: string): SiteMapPage | undefined {
  const clean = normalise(href.split("#")[0]?.split("?")[0] ?? "");
  if (!clean) return undefined;

  return context.pages.find((page) => {
    const candidate = pageUrl(page);
    return clean === candidate.slice(1) || clean === candidate || slug(clean) === slug(candidate);
  });
}

/**
 * Build a bounded graph. Duplicate links and self-links are ignored.
 */
export function buildSiteContextGraph(context: AgentContext): SiteContextGraph {
  const nodes: ContextNode[] = [];
  const edges: ContextEdge[] = [];
  const pageSignals = new Map<string, PageContextSignal>();
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();

  for (const page of context.pages) {
    const pageKinds = semanticKinds(page);
    nodes.push({
      id: page.id,
      kind: "page",
      parentId: null,
      pageId: page.id,
      label: page.title || page.slug || "Untitled page",
      semanticKinds: pageKinds,
      visible: page.is_visible,
      noindex: page.noindex,
    });
    inbound.set(page.id, 0);
    outbound.set(page.id, 0);

    for (const section of page.sections) {
      nodes.push({
        id: section.id,
        kind: "section",
        parentId: page.id,
        pageId: page.id,
        label: section.heading || section.kind,
        semanticKinds: [section.kind],
        visible: section.is_visible,
        noindex: false,
      });
      edges.push({ from: page.id, to: section.id, kind: "contains" });

      for (const component of section.components) {
        nodes.push({
          id: component.id,
          kind: "component",
          parentId: section.id,
          pageId: page.id,
          label: component.label || component.kind,
          semanticKinds: [component.kind],
          visible: true,
          noindex: false,
        });
        edges.push({ from: section.id, to: component.id, kind: "contains" });
      }
    }
  }

  for (const page of context.pages) {
    const linkedTargets = new Set<string>();

    for (const section of page.sections) {
      for (const component of section.components) {
        const target = component.link_url?.startsWith("/")
          ? resolveInternalTarget(context, component.link_url)
          : undefined;

        if (!target || target.id === page.id || linkedTargets.has(target.id)) continue;

        linkedTargets.add(target.id);
        edges.push({ from: page.id, to: target.id, kind: "links_to" });
        outbound.set(page.id, (outbound.get(page.id) ?? 0) + 1);
        inbound.set(target.id, (inbound.get(target.id) ?? 0) + 1);
      }
    }
  }

  const entryPoints = context.pages
    .filter((page) => page.is_visible && !page.noindex)
    .filter((page) => (inbound.get(page.id) ?? 0) === 0)
    .map((page) => page.id);

  const conversionPages = context.pages.filter(isConversionPage).map((page) => page.id);

  for (const page of context.pages) {
    const kinds = semanticKinds(page);
    const signal: PageContextSignal = {
      pageId: page.id,
      pageKind: page.kind,
      title: page.title,
      slug: page.slug,
      inboundLinks: inbound.get(page.id) ?? 0,
      outboundLinks: outbound.get(page.id) ?? 0,
      sectionKinds: [...new Set(page.sections.map((section) => section.kind))],
      semanticKinds: kinds,
      isEntryPoint: entryPoints.includes(page.id),
      isConversionPage: conversionPages.includes(page.id),
      isOrphan:
        page.is_visible &&
        !page.noindex &&
        (inbound.get(page.id) ?? 0) === 0 &&
        !/\b(home|index)\b/i.test([page.kind, page.slug, page.title].join(" ")),
    };
    pageSignals.set(page.id, signal);

    for (const kind of kinds) {
      edges.push({ from: page.id, to: `semantic:${kind}`, kind: "semantic" });
    }
  }

  const orphanPages = [...pageSignals.values()]
    .filter((page) => page.isOrphan)
    .map((page) => page.pageId);

  return {
    nodes,
    edges,
    pages: [...pageSignals.values()],
    entryPoints,
    conversionPages,
    orphanPages,
  };
}

/**
 * Deterministically rank pages for a request. Exact page hints still win
 * elsewhere; this is only used when the request needs contextual targeting.
 */
export function rankPagesForIntent(
  context: AgentContext,
  instruction: string,
): PageContextSignal[] {
  const graph = buildSiteContextGraph(context);
  const text = normalise(instruction);
  const tokens = new Set(text.split(/[^a-z0-9-]+/).filter((token) => token.length > 2));

  return [...graph.pages]
    .map((page) => {
      let score = 0;
      const searchable = [
        page.title,
        page.slug,
        page.pageKind,
        ...page.sectionKinds,
        ...page.semanticKinds,
      ].join(" ").toLowerCase();

      for (const token of tokens) {
        if (searchable.includes(token)) score += 1;
      }
      if (page.isConversionPage && /\b(book|quote|lead|conversion|contact|call)\b/.test(text)) score += 3;
      if (page.isEntryPoint && /\b(home|landing|first|start)\b/.test(text)) score += 2;
      if (page.isOrphan && /\b(find|connect|navigation|link|orphan)\b/.test(text)) score += 2;

      return { page, score };
    })
    .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))
    .map(({ page }) => page);
}

/** Compact planner-facing summary, safe to attach to trace/notes. */
export function contextGraphSummary(context: AgentContext): string {
  const graph = buildSiteContextGraph(context);
  return [
    `${graph.pages.length} pages`,
    `${graph.nodes.length} graph nodes`,
    `${graph.edges.length} relationships`,
    `${graph.orphanPages.length} orphan pages`,
    `${graph.conversionPages.length} conversion pages`,
  ].join(" · ");
}
