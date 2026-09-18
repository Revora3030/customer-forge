/**
 * REVORA MASTER BUILDER ENGINE
 * ============================
 *
 * Free-first deterministic website compiler.
 *
 * Responsibilities:
 * - Convert interpreted natural-language intent into safe AgentAction plans.
 * - Coordinate industry, design, copy, SEO, conversion and page structure.
 * - Preserve existing execution, authorization, database, billing,
 *   publishing and tenant boundaries.
 *
 * This file DOES NOT:
 * - call an AI provider
 * - make network requests
 * - write to Supabase
 * - execute database mutations
 * - bypass validation
 * - invent business facts
 *
 * Execution remains owned by the existing site-agent/site-engine pipeline.
 */

import { MAX_ACTIONS, type AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

import { interpret, type BuilderIntent } from "./interpreter";
import { buildSiteContextGraph, contextGraphSummary, rankPagesForIntent } from "./context-graph";

import { playbookFor } from "./industry";

import { designDecision, hierarchySort } from "./design";

import { ctaTarget, faqQuestions, pageSeo, place, sectionCopy, type CopyFacts } from "./copy";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const MASTER_MAX_ACTIONS = MAX_ACTIONS;
export const MASTER_MAX_WHOLE_SITE_ACTIONS = MAX_ACTIONS;

/* -------------------------------------------------------------------------- */
/* Public contracts                                                           */
/* -------------------------------------------------------------------------- */

export type BuilderTask = {
  title: string;
  done: boolean;
};

export type DeterministicPlan = {
  reply: string;
  summary: string;
  actions: AgentAction[];
  questions: string[];
  notes: string[];
  coverage: "full" | "partial" | "none";
  trace: string[];
  intent: BuilderIntent;
  tasks: BuilderTask[];
  requiresExternalReasoning: boolean;
  externalReason: string | null;
};

export type BuilderOptions = {
  history?: string[];
  attachments?: {
    kind: string;
    name: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Context aliases                                                            */
/* -------------------------------------------------------------------------- */

type Page = AgentContext["pages"][number];
type Section = Page["sections"][number];

/* -------------------------------------------------------------------------- */
/* Business facts                                                             */
/* -------------------------------------------------------------------------- */

function factsOf(context: AgentContext): CopyFacts {
  return {
    name: context.business.name,
    industry: context.business.industry,
    tagline: context.business.tagline,
    description: context.business.description,
    city: context.business.city,
    state: context.business.state,
    serviceArea: context.business.serviceArea,
    phone: context.business.phone,
    email: context.business.email,
    services: context.business.services.map((service) => ({
      name: service.name,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Safe string helpers                                                        */
/* -------------------------------------------------------------------------- */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 120);
}

function normaliseSlug(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Page intelligence                                                          */
/* -------------------------------------------------------------------------- */

function pageKindFromLabel(label: string, slug: string): string {
  const text = `${label} ${slug}`.toLowerCase();

  if (/\b(price|pricing|cost|rate|rates|package|packages)\b/.test(text)) {
    return "pricing";
  }

  if (/\b(book|booking|schedule|scheduled|appointment|calendar)\b/.test(text)) {
    return "book";
  }

  if (/\b(quote|quotes|estimate|estimates|contact)\b/.test(text)) {
    return "contact";
  }

  if (/\b(about|story|team)\b/.test(text)) {
    return "about";
  }

  if (/\b(review|reviews|testimonial|testimonials|feedback)\b/.test(text)) {
    return "reviews";
  }

  if (/\b(gallery|portfolio|work|photos|photo|projects|project)\b/.test(text)) {
    return "gallery";
  }

  if (/\b(service|services|what we do|what-we-do|offer|offers)\b/.test(text)) {
    return "services";
  }

  return "custom";
}

function pageSections(kind: string, playbook: ReturnType<typeof playbookFor>): string[] {
  if (kind === "pricing") {
    return ["hero", "pricing", "faq", "cta", "contact"];
  }

  if (kind === "book") {
    return ["hero", "booking", "benefits", "faq", "cta"];
  }

  if (kind === "about") {
    return ["hero", "intro", "benefits", "area", "cta"];
  }

  if (kind === "contact") {
    return ["hero", "contact", "area", "cta"];
  }

  if (kind === "gallery") {
    return ["hero", "gallery", "services", "cta"];
  }

  if (kind === "reviews") {
    return ["hero", "reviews", "cta"];
  }

  if (kind === "services") {
    return [...playbook.servicePageSections];
  }

  return [...playbook.homeSections];
}

function findSection(page: Page | null, kind: string): Section | undefined {
  return page?.sections.find((section) => section.kind === kind);
}

function targetPage(context: AgentContext, intent: BuilderIntent): Page | null {
  for (const hint of intent.pageHints) {
    const wanted = normaliseSlug(hint);

    const match = context.pages.find((page) => {
      const pageSlug = normaliseSlug(page.slug);

      return (
        pageSlug === wanted ||
        page.kind.toLowerCase() === wanted ||
        page.title.toLowerCase() === wanted
      );
    });

    if (match) {
      return match;
    }
  }

  if (!intent.wholeSite) {
    const ranked = rankPagesForIntent(context, intent.original);
    if (ranked[0]) {
      return context.pages.find((page) => page.id === ranked[0].pageId) ?? null;
    }
  }

  return (
    context.pages.find((page) => page.kind === "home") ??
    context.pages.find(
      (page) => normaliseSlug(page.slug) === "" || normaliseSlug(page.slug) === "home",
    ) ??
    context.pages[0] ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* Intent scoping                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Keep verbs and goals attached to the section they were actually associated
 * with. This prevents:
 *
 * "remove pricing and add booking"
 *
 * from becoming:
 *
 * "remove + add" applied to both pricing AND booking.
 */
function sectionOperations(intent: BuilderIntent): Array<{
  kind: string;
  verbs: string[];
  goals: string[];
  moods: string[];
  raw: string;
}> {
  const scoped = intent.operations
    .filter((operation) => operation.sectionKinds.length > 0)
    .flatMap((operation) =>
      operation.sectionKinds.map((kind) => ({
        kind,
        verbs: operation.verbs,
        goals: operation.goals,
        moods: operation.moods,
        raw: operation.raw,
      })),
    );

  if (scoped.length > 0) {
    return scoped;
  }

  return intent.sectionKinds.map((kind) => ({
    kind,
    verbs: intent.verbs,
    goals: intent.goals,
    moods: intent.moods,
    raw: intent.original,
  }));
}

/* -------------------------------------------------------------------------- */
/* Action safety / deduplication                                              */
/* -------------------------------------------------------------------------- */

function actionExists(
  actions: AgentAction[],
  predicate: (action: AgentAction) => boolean,
): boolean {
  return actions.some(predicate);
}

function pushUnique(actions: AgentAction[], action: AgentAction, cap: number): void {
  if (actions.length >= cap) {
    return;
  }

  if (
    action.type === "set_section_effect" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "set_section_effect" && existing.sectionId === action.sectionId,
    )
  ) {
    return;
  }

  if (
    action.type === "set_section_text" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "set_section_text" &&
        existing.sectionId === action.sectionId &&
        existing.field === action.field,
    )
  ) {
    return;
  }

  if (
    action.type === "set_section_variant" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "set_section_variant" && existing.sectionId === action.sectionId,
    )
  ) {
    return;
  }

  if (
    action.type === "set_section_visibility" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "set_section_visibility" && existing.sectionId === action.sectionId,
    )
  ) {
    return;
  }

  if (
    action.type === "add_section" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "add_section" &&
        existing.pageId === action.pageId &&
        existing.kind === action.kind,
    )
  ) {
    return;
  }

  if (
    action.type === "add_component" &&
    actionExists(
      actions,
      (existing) =>
        existing.type === "add_component" &&
        existing.sectionId === action.sectionId &&
        existing.kind === action.kind &&
        existing.label === action.label,
    )
  ) {
    return;
  }

  if (
    action.type === "set_page" &&
    actionExists(
      actions,
      (existing) => existing.type === "set_page" && existing.pageId === action.pageId,
    )
  ) {
    return;
  }

  actions.push(action);
}

/* -------------------------------------------------------------------------- */
/* Section creation                                                           */
/* -------------------------------------------------------------------------- */

function addSection(
  actions: AgentAction[],
  pageId: string,
  kind: string,
  context: AgentContext,
  facts: CopyFacts,
  playbook: ReturnType<typeof playbookFor>,
  position: number,
  cap: number,
): boolean {
  if (!context.sectionKinds.includes(kind)) {
    return false;
  }

  const copy = sectionCopy(kind, facts, playbook);

  pushUnique(
    actions,
    {
      type: "add_section",
      pageId,
      kind,
      heading: copy.heading || undefined,
      subheading: copy.subheading || undefined,
      body: copy.body || undefined,
      position,
    },
    cap,
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/* Page creation                                                              */
/* -------------------------------------------------------------------------- */

function buildPage(
  actions: AgentAction[],
  ref: string,
  title: string,
  kind: string,
  context: AgentContext,
  facts: CopyFacts,
  playbook: ReturnType<typeof playbookFor>,
  cap: number,
): void {
  const safeSlug = slugify(title) || `page-${ref.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const actualKind = context.pageKinds.includes(kind)
    ? kind
    : context.pageKinds.includes("custom")
      ? "custom"
      : (context.pageKinds[0] ?? "custom");

  pushUnique(
    actions,
    {
      type: "add_page",
      kind: actualKind,
      title: title.trim().slice(0, 120),
      slug: safeSlug,
      ref,
    },
    cap,
  );

  let position = 0;

  for (const sectionKind of pageSections(kind, playbook)) {
    if (position >= 10) {
      break;
    }

    if (addSection(actions, ref, sectionKind, context, facts, playbook, position, cap)) {
      position += 1;
    }
  }

  pushUnique(
    actions,
    {
      type: "set_page",
      pageId: ref,
      patch: pageSeo(title, facts, playbook),
    },
    cap,
  );
}

/* -------------------------------------------------------------------------- */
/* Existing-page improvement                                                  */
/* -------------------------------------------------------------------------- */

function improveExistingPage(
  actions: AgentAction[],
  page: Page,
  context: AgentContext,
  facts: CopyFacts,
  playbook: ReturnType<typeof playbookFor>,
  intent: BuilderIntent,
  cap: number,
): void {
  const sections = [...page.sections].sort((a, b) => a.sort_order - b.sort_order);

  const existingKinds = new Set(sections.map((section) => section.kind));

  /* ---------------------------------------------------------------------- */
  /* Complete missing conversion structure                                  */
  /* ---------------------------------------------------------------------- */

  const desiredSections = playbook.homeSections.slice(0, 10);

  let nextPosition = sections.length;

  for (const kind of desiredSections) {
    if (!existingKinds.has(kind) && context.sectionKinds.includes(kind)) {
      addSection(actions, page.id, kind, context, facts, playbook, nextPosition, cap);

      nextPosition += 1;
      existingKinds.add(kind);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Fill genuinely empty copy only                                         */
  /* ---------------------------------------------------------------------- */

  for (const section of sections.slice(0, 12)) {
    if (actions.length >= cap) {
      break;
    }

    const copy = sectionCopy(section.kind, facts, playbook);

    if (!section.heading && copy.heading) {
      pushUnique(
        actions,
        {
          type: "set_section_text",
          sectionId: section.id,
          field: "heading",
          value: copy.heading,
        },
        cap,
      );
    }

    if (!section.subheading && copy.subheading) {
      pushUnique(
        actions,
        {
          type: "set_section_text",
          sectionId: section.id,
          field: "subheading",
          value: copy.subheading,
        },
        cap,
      );
    }

    if (!section.body && copy.body) {
      pushUnique(
        actions,
        {
          type: "set_section_text",
          sectionId: section.id,
          field: "body",
          value: copy.body,
        },
        cap,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* SEO                                                                     */
  /* ---------------------------------------------------------------------- */

  if (intent.goals.includes("seo") || intent.verbs.includes("seo") || intent.wholeSite) {
    pushUnique(
      actions,
      {
        type: "set_page",
        pageId: page.id,
        patch: pageSeo(page.title || "Home", facts, playbook),
      },
      cap,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Section hierarchy                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    intent.verbs.includes("hierarchy") ||
    intent.goals.includes("conversion") ||
    intent.wholeSite
  ) {
    const sorted = hierarchySort(sections);

    const changed = sorted.some((section, index) => section.id !== sections[index]?.id);

    if (changed) {
      pushUnique(
        actions,
        {
          type: "reorder_sections",
          pageId: page.id,
          sectionIds: sorted.map((section) => section.id),
        },
        cap,
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Primary CTA                                                             */
  /* ---------------------------------------------------------------------- */

  if (
    intent.verbs.includes("cta") ||
    intent.goals.some((goal) => ["conversion", "leads", "booking", "calls"].includes(goal)) ||
    intent.wholeSite
  ) {
    const target = ctaTarget(facts);

    const host = page.sections.find((section) => section.kind === "hero") ?? page.sections[0];

    if (host) {
      const hasButton = host.components.some(
        (component) => component.kind === "button" || component.link_url === target?.url,
      );

      if (!hasButton) {
        const label = playbook.ctaLabels.primary;

        pushUnique(
          actions,
          {
            type: "add_component",
            sectionId: host.id,
            kind: "button",
            label,
            link_url: target?.url ?? "/contact",
            link_label: label,
          },
          cap,
        );
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* FAQ enrichment                                                         */
  /* ---------------------------------------------------------------------- */

  const faq = page.sections.find((section) => section.kind === "faq");

  if (faq && (intent.wholeSite || intent.sectionKinds.includes("faq"))) {
    const existingQuestions = new Set(
      faq.components
        .map((component) => component.label?.trim())
        .filter((value): value is string => Boolean(value)),
    );

    for (const question of faqQuestions(playbook).slice(0, 5)) {
      if (!existingQuestions.has(question)) {
        pushUnique(
          actions,
          {
            type: "add_component",
            sectionId: faq.id,
            kind: "faq",
            label: question,
          },
          cap,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Main compiler                                                              */
/* -------------------------------------------------------------------------- */

export function buildDeterministicPlan(
  context: AgentContext,
  instruction: string,
  options: BuilderOptions = {},
): DeterministicPlan {
  const intent = interpret(instruction, options.history ?? []);

  const facts = factsOf(context);

  const playbook = intent.industry ?? playbookFor(context.business.industry, instruction);

  const page = targetPage(context, intent);

  const allowedSections = new Set(context.sectionKinds);

  const cap = intent.wholeSite ? MASTER_MAX_WHOLE_SITE_ACTIONS : MASTER_MAX_ACTIONS;

  const actions: AgentAction[] = [];
  const tasks: BuilderTask[] = [];
  const notes: string[] = [];
  const questions: string[] = [];
  const trace: string[] = [];
  const completed = new Set<string>();

  const addTask = (title: string, task: () => boolean): void => {
    const before = actions.length;
    let claimed = false;

    try {
      claimed = task();
    } catch {
      claimed = false;
    }

    tasks.push({
      title,
      done: claimed || actions.length > before,
    });
  };

  trace.push(
    `Master builder selected ${playbook.label} intelligence and a deterministic free-first plan.`,
  );

  const graphSummary = contextGraphSummary(context);
  trace.push(`Context graph: ${graphSummary}.`);

  const graph = buildSiteContextGraph(context);
  const graphOrphans = graph.orphanPages.length;

  if (graphOrphans > 0 && (intent.wholeSite || intent.goals.includes("seo") || intent.goals.includes("conversion"))) {
    notes.push(`Site context graph found ${graphOrphans} pages eligible for contextual navigation analysis.`);
  }

  /* ---------------------------------------------------------------------- */
  /* Design system                                                           */
  /* ---------------------------------------------------------------------- */

  const designRequested =
    intent.wholeSite ||
    intent.verbs.includes("restyle") ||
    intent.moods.length > 0 ||
    intent.visualIntensity > 0 ||
    intent.goals.includes("visual") ||
    intent.goals.includes("redesign");

  if (designRequested) {
    addTask("Create one coordinated visual direction", () => {
      const design = designDecision(
        playbook,
        intent.moods,
        [
          context.business.name,
          context.business.city ?? "",
          context.business.state ?? "",
          page?.id ?? "",
        ].join("|"),
      );

      pushUnique(
        actions,
        {
          type: "set_theme",
          patch: design.theme,
        },
        cap,
      );

      pushUnique(
        actions,
        {
          type: "set_backdrop",
          backdrop: design.backdrop,
        },
        cap,
      );

      const hero = page?.sections.find((section) => section.kind === "hero") ?? page?.sections[0];

      if (hero) {
        pushUnique(
          actions,
          {
            type: "set_section_effect",
            sectionId: hero.id,
            effect: design.heroEffect,
          },
          cap,
        );

        if (hero.kind === "hero") {
          const variant =
            design.density === "full"
              ? "banner"
              : design.density === "compact"
                ? "stacked"
                : "split";

          pushUnique(
            actions,
            {
              type: "set_section_variant",
              sectionId: hero.id,
              variant,
            },
            cap,
          );
        }
      }

      if (design.bodyEffect !== "none" && page) {
        const bodySections = page.sections
          .filter((section) => section.kind !== "hero")
          .slice(0, intent.visualIntensity >= 2 ? 4 : 2);

        for (const section of bodySections) {
          pushUnique(
            actions,
            {
              type: "set_section_effect",
              sectionId: section.id,
              effect: design.bodyEffect,
            },
            cap,
          );
        }
      }

      notes.push(...design.rationale.slice(1));

      completed.add("design");

      return true;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Whole-site build                                                        */
  /* ---------------------------------------------------------------------- */

  if (intent.wholeSite) {
    addTask("Finish the site's missing pages", () => {
      let created = false;
      let index = 0;

      for (const wanted of playbook.pages) {
        if (actions.length >= cap) {
          break;
        }

        const slug = slugify(wanted.slug || wanted.title);

        if (!slug) {
          continue;
        }

        const exists = context.pages.some(
          (existingPage) => normaliseSlug(existingPage.slug) === slug,
        );

        if (exists) {
          continue;
        }

        const ref = `temp_master_page_${index++}`;

        buildPage(actions, ref, wanted.title, wanted.kind, context, facts, playbook, cap);

        created = true;
      }

      if (created) {
        completed.add("pages");
      }

      return created;
    });

    if (page) {
      addTask("Upgrade the home page into a complete conversion journey", () => {
        const before = actions.length;

        improveExistingPage(actions, page, context, facts, playbook, intent, cap);

        completed.add("structure");
        completed.add("conversion");

        return actions.length > before;
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Explicit section operations                                            */
  /* ---------------------------------------------------------------------- */

  for (const operation of sectionOperations(intent)) {
    if (!allowedSections.has(operation.kind) || !page) {
      continue;
    }

    const existing = findSection(page, operation.kind);

    /* Remove */
    if (operation.verbs.includes("remove") && existing) {
      pushUnique(
        actions,
        {
          type: "delete_section",
          sectionId: existing.id,
        },
        cap,
      );

      completed.add("sections");
      continue;
    }

    /* Hide */
    if (operation.verbs.includes("hide") && existing) {
      pushUnique(
        actions,
        {
          type: "set_section_visibility",
          sectionId: existing.id,
          visible: false,
        },
        cap,
      );

      completed.add("sections");
      continue;
    }

    /* Show */
    if (operation.verbs.includes("show") && existing) {
      pushUnique(
        actions,
        {
          type: "set_section_visibility",
          sectionId: existing.id,
          visible: true,
        },
        cap,
      );

      completed.add("sections");
      continue;
    }

    /* Resize */
    if (operation.verbs.includes("resize") && existing) {
      const bigger = /\b(bigger|larger|taller|full[\s-]?screen)\b/i.test(operation.raw);

      if (existing.kind === "hero") {
        pushUnique(
          actions,
          {
            type: "set_section_variant",
            sectionId: existing.id,
            variant: bigger ? "banner" : "stacked",
          },
          cap,
        );

        if (bigger) {
          pushUnique(
            actions,
            {
              type: "set_section_effect",
              sectionId: existing.id,
              effect: "rise",
            },
            cap,
          );
        }
      }

      completed.add("layout");
      continue;
    }

    /* Rewrite / restyle */
    if ((operation.verbs.includes("rewrite") || operation.verbs.includes("restyle")) && existing) {
      const copy = sectionCopy(operation.kind, facts, playbook);

      if (copy.heading) {
        pushUnique(
          actions,
          {
            type: "set_section_text",
            sectionId: existing.id,
            field: "heading",
            value: copy.heading,
          },
          cap,
        );
      }

      if (copy.subheading) {
        pushUnique(
          actions,
          {
            type: "set_section_text",
            sectionId: existing.id,
            field: "subheading",
            value: copy.subheading,
          },
          cap,
        );
      }

      if (copy.body) {
        pushUnique(
          actions,
          {
            type: "set_section_text",
            sectionId: existing.id,
            field: "body",
            value: copy.body,
          },
          cap,
        );
      }

      completed.add("copy");
      continue;
    }

    /* Add missing section */
    if (
      !existing &&
      operation.verbs.some((verb) => ["add", "build", "show", "rewrite", "restyle"].includes(verb))
    ) {
      addSection(
        actions,
        page.id,
        operation.kind,
        context,
        facts,
        playbook,
        page.sections.length,
        cap,
      );

      completed.add("sections");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Explicit new pages                                                      */
  /* ---------------------------------------------------------------------- */

  let namedPageIndex = 0;

  for (const label of intent.newPages) {
    if (actions.length >= cap) {
      break;
    }

    const slug = slugify(label);

    if (!slug) {
      continue;
    }

    const exists = context.pages.some((existingPage) => normaliseSlug(existingPage.slug) === slug);

    if (exists) {
      continue;
    }

    const guessedKind = pageKindFromLabel(label, slug);

    const kind = context.pageKinds.includes(guessedKind)
      ? guessedKind
      : context.pageKinds.includes("custom")
        ? "custom"
        : (context.pageKinds[0] ?? "custom");

    buildPage(
      actions,
      `temp_named_page_${namedPageIndex++}`,
      titleCase(label),
      kind,
      context,
      facts,
      playbook,
      cap,
    );

    completed.add("pages");
  }

  /* ---------------------------------------------------------------------- */
  /* Explicit target-page rewrite                                           */
  /* ---------------------------------------------------------------------- */

  if (intent.verbs.includes("rewrite") && page && !intent.sectionKinds.length) {
    addTask("Rewrite weak page sections", () => {
      const before = actions.length;

      for (const section of page.sections.slice(0, 12)) {
        const copy = sectionCopy(section.kind, facts, playbook);

        if (!section.heading && copy.heading) {
          pushUnique(
            actions,
            {
              type: "set_section_text",
              sectionId: section.id,
              field: "heading",
              value: copy.heading,
            },
            cap,
          );
        }

        if (!section.subheading && copy.subheading) {
          pushUnique(
            actions,
            {
              type: "set_section_text",
              sectionId: section.id,
              field: "subheading",
              value: copy.subheading,
            },
            cap,
          );
        }

        if (!section.body && copy.body) {
          pushUnique(
            actions,
            {
              type: "set_section_text",
              sectionId: section.id,
              field: "body",
              value: copy.body,
            },
            cap,
          );
        }
      }

      completed.add("copy");

      return actions.length > before;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Sitewide SEO                                                            */
  /* ---------------------------------------------------------------------- */

  if (intent.verbs.includes("seo") || intent.goals.includes("seo") || intent.wholeSite) {
    addTask("Strengthen search metadata", () => {
      const before = actions.length;

      for (const candidate of context.pages.slice(0, 20)) {
        pushUnique(
          actions,
          {
            type: "set_page",
            pageId: candidate.id,
            patch: pageSeo(candidate.title || "Home", facts, playbook),
          },
          cap,
        );
      }

      completed.add("seo");

      return actions.length > before;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Conversion system                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    page &&
    (intent.verbs.includes("cta") ||
      intent.goals.some((goal) => ["conversion", "leads", "booking", "calls"].includes(goal)) ||
      intent.wholeSite)
  ) {
    addTask("Strengthen the primary action", () => {
      const target = ctaTarget(facts);

      const candidates = intent.everyPage || intent.wholeSite ? context.pages.slice(0, 12) : [page];

      const before = actions.length;

      for (const candidate of candidates) {
        const host =
          candidate.sections.find((section) => section.kind === "hero") ?? candidate.sections[0];

        if (!host) {
          continue;
        }

        const label = playbook.ctaLabels.primary;

        const alreadyHasCTA = host.components.some(
          (component) => component.kind === "button" || component.link_url === target?.url,
        );

        if (alreadyHasCTA) {
          continue;
        }

        pushUnique(
          actions,
          {
            type: "add_component",
            sectionId: host.id,
            kind: "button",
            label,
            link_url: target?.url ?? "/contact",
            link_label: label,
          },
          cap,
        );
      }

      completed.add("conversion");

      return actions.length > before;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Mobile                                                                   */
  /* ---------------------------------------------------------------------- */

  if (intent.verbs.includes("mobile") || intent.goals.includes("mobile") || intent.wholeSite) {
    addTask("Harden the mobile journey", () => {
      if (!page) {
        return false;
      }

      if (!allowedSections.has("sticky_cta")) {
        notes.push(
          "Mobile responsiveness is handled by the existing renderer; no unsupported mobile-only section was invented.",
        );

        completed.add("mobile");

        return true;
      }

      const alreadyExists = page.sections.some((section) => section.kind === "sticky_cta");

      if (!alreadyExists) {
        const copy = sectionCopy("sticky_cta", facts, playbook);

        pushUnique(
          actions,
          {
            type: "add_section",
            pageId: page.id,
            kind: "sticky_cta",
            heading: copy.heading || undefined,
            subheading: copy.subheading || undefined,
            body: copy.body || undefined,
            position: page.sections.length,
          },
          cap,
        );
      }

      completed.add("mobile");

      return true;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Missing factual information                                             */
  /* ---------------------------------------------------------------------- */

  if (intent.locationHint) {
    const currentPlace = place(facts);

    const town = intent.locationHint.split(",")[0]?.trim().toLowerCase() ?? "";

    if (!currentPlace || !currentPlace.toLowerCase().includes(town)) {
      questions.push(
        currentPlace
          ? `You mentioned "${intent.locationHint}". Should that replace your current service area "${currentPlace}" or only apply to this page?`
          : `You mentioned "${intent.locationHint}". Should I use that as your service area across the site?`,
      );
    }
  } else if (
    !place(facts) &&
    (intent.goals.includes("local_seo") || intent.verbs.includes("seo"))
  ) {
    questions.push("What city, town or service area should the website target?");
  }

  /* ---------------------------------------------------------------------- */
  /* Real reviews only                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    (intent.sectionKinds.includes("reviews") ||
      /\breviews?\b|\btestimonials?\b/i.test(instruction)) &&
    context.business.publishedReviewCount === 0
  ) {
    questions.push(
      "Send the real reviews or review source you want displayed; I will not invent reviews.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Real pricing only                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    (intent.sectionKinds.includes("pricing") ||
      /\bprices?\b|\bpricing\b|\brates?\b/i.test(instruction)) &&
    context.business.services.every(
      (service) => service.price == null && service.startingPrice == null,
    )
  ) {
    questions.push("What prices or starting prices should be shown?");
  }

  /* ---------------------------------------------------------------------- */
  /* Audience                                                                */
  /* ---------------------------------------------------------------------- */

  if (intent.audienceHint) {
    notes.push(
      `Audience detected: ${intent.audienceHint}. Copy should be written for that audience without inventing business facts.`,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Attachments                                                             */
  /* ---------------------------------------------------------------------- */

  if (options.attachments?.length) {
    notes.push(
      `Kept ${options.attachments.length} attachment${
        options.attachments.length === 1 ? "" : "s"
      } in context. Visual/content claims are not invented from filenames alone.`,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Fact protection                                                         */
  /* ---------------------------------------------------------------------- */

  if (intent.keepFacts || intent.constraints.includes("no_invention")) {
    notes.push(
      "Business facts are treated as source-of-truth data. The builder will not manufacture reviews, prices, credentials, guarantees or results.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Coverage                                                                 */
  /* ---------------------------------------------------------------------- */

  const recognised =
    intent.verbs.length > 0 ||
    intent.sectionKinds.length > 0 ||
    intent.moods.length > 0 ||
    intent.goals.length > 0 ||
    intent.newPages.length > 0;

  let coverage: DeterministicPlan["coverage"];

  if (actions.length === 0) {
    coverage = "none";
  } else if (recognised && intent.unrecognised.length === 0) {
    coverage = "full";
  } else {
    coverage = "partial";
  }

  /* ---------------------------------------------------------------------- */
  /* External reasoning flag                                                 */
  /* ---------------------------------------------------------------------- */

  const requiresExternalReasoning = actions.length === 0;

  let externalReason: string | null = null;

  if (actions.length === 0) {
    if (
      options.attachments?.some(
        (attachment) =>
          attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio",
      )
    ) {
      externalReason =
        "The uploaded content must be interpreted before safe edits can be selected.";
    } else {
      externalReason = "The request did not map to a supported website change.";
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Empty-plan protection                                                   */
  /* ---------------------------------------------------------------------- */

  if (actions.length === 0) {
    notes.push("No destructive or speculative change was generated.");
  }

  /* ---------------------------------------------------------------------- */
  /* Summary                                                                 */
  /* ---------------------------------------------------------------------- */

  const summaryBits = Array.from(completed);

  const summary =
    summaryBits.length > 0
      ? `Master builder improved ${summaryBits.join(", ")} using your existing business data.`
      : "No safe website change was generated from this request.";

  const reply =
    actions.length > 0
      ? `I understood the request and prepared ${actions.length} website update${
          actions.length === 1 ? "" : "s"
        } across ${summaryBits.join(", ") || "your site"}.`
      : "I could not safely turn that request into a website change without guessing.";

  /* ---------------------------------------------------------------------- */
  /* Final deterministic plan                                                */
  /* ---------------------------------------------------------------------- */

  return {
    reply,
    summary,
    actions,
    questions: [...new Set(questions)].slice(0, 1),
    notes: [...new Set(notes)].slice(0, 10),
    coverage,
    trace,
    intent,
    tasks,
    requiresExternalReasoning,
    externalReason,
  };
}

/* -------------------------------------------------------------------------- */
/* Public helper                                                              */
/* -------------------------------------------------------------------------- */

export const isFullyHandled = (plan: DeterministicPlan): boolean => plan.coverage === "full";
