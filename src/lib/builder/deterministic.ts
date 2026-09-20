/**
 * REVORA FREE-FIRST DETERMINISTIC BUILDER — MASTER ENGINE
 *
 * File: src/lib/builder/deterministic.ts
 *
 * PURPOSE
 * -------
 * Converts plain-English website requests into safe, deterministic
 * AgentAction plans without requiring a paid AI provider.
 *
 * PIPELINE
 * --------
 * REQUEST
 *   ↓
 * INTERPRET
 *   ↓
 * BUSINESS CONTEXT
 *   ↓
 * INDUSTRY PLAYBOOK
 *   ↓
 * DESIGN INTELLIGENCE
 *   ↓
 * PAGE / SECTION PLANNING
 *   ↓
 * COPY / SEO / CTA PLANNING
 *   ↓
 * ACTION DEDUPLICATION
 *   ↓
 * ACTION SAFETY / CAP
 *   ↓
 * SELF-CHECK
 *   ↓
 * DETERMINISTIC PLAN
 *
 * IMPORTANT
 * ---------
 * This file plans changes only.
 *
 * Execution, authorization, persistence, publishing, database access,
 * Stripe, Supabase, authentication, RLS and rollback remain in the
 * existing site-agent/site-engine infrastructure.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * - Free-first
 * - Deterministic
 * - No network calls
 * - No fabricated business facts
 * - No invented IDs
 * - No arbitrary generated markup
 * - Small safe actions
 * - Whole-site requests handled coherently
 * - Existing site structure preserved
 * - New pages are created complete, not empty
 * - Temporary references allow one request to create a page and populate it
 * - Duplicate actions are removed
 * - Action count is always bounded
 * - Existing customer data is never guessed
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";

import {
  interpret,
  type BuilderIntent,
} from "./interpreter";

import { readLiteralDirectives } from "./literal";


import {
  playbookFor,
  type IndustryPlaybook,
} from "./industry";

import {
  designDecision,
  hierarchySort,
} from "./design";

import {
  ctaTarget,
  faqQuestions,
  pageSeo,
  place,
  sectionCopy,
  type CopyFacts,
} from "./copy";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * These are the variants already understood by the existing site-agent
 * vocabulary. The renderer remains responsible for deciding exactly how
 * each variant looks.
 */
const HERO_LAYOUT = {
  full: "banner",
  standard: "split",
  compact: "stacked",
} as const;

/**
 * Keep this below the global site-agent MAX_ACTIONS limit.
 *
 * The previous implementation allowed a whole-site plan to grow beyond the
 * executor's normal action budget. That can produce plans that are silently
 * truncated later.
 *
 * This compiler therefore owns a conservative ceiling.
 */
const MAX_ACTIONS = 56;

/**
 * A very large request should still be bounded.
 *
 * This is intentionally the same practical ceiling used for normal execution.
 */
const MAX_ACTIONS_WHOLE_SITE = 56;

/**
 * We do not want hundreds of nearly identical changes on one page.
 */
const MAX_SECTIONS_PER_PAGE = 12;

/**
 * We only inspect a reasonable number of pages when performing broad
 * site-wide operations.
 */
const MAX_EXISTING_PAGES_FOR_BROAD_ACTIONS = 12;

/**
 * Maximum number of sections to inspect during normal copy repair.
 */
const MAX_COPY_SECTIONS = 12;

/**
 * Maximum number of FAQ entries inserted automatically.
 */
const MAX_FAQ_ITEMS = 5;

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

  /**
   * `full`
   *   The deterministic engine believes it handled the recognized request.
   *
   * `partial`
   *   Some work was recognized, but something could not be safely completed.
   *
   * `none`
   *   No executable website change was generated.
   */
  coverage: "full" | "partial" | "none";

  /**
   * Internal explanation of what the compiler understood.
   */
  trace: string[];

  /**
   * Parsed request.
   */
  intent: BuilderIntent;

  /**
   * Atomic work items.
   */
  tasks: BuilderTask[];

  /**
   * Dependency-aware planning metadata. Optional so existing plan consumers remain compatible.
   */
  blueprint?: import("./execution-blueprint").ExecutionBlueprint;

  /**
   * True only when an outside reasoning layer may genuinely be useful.
   *
   * This does NOT mean the customer must pay for AI.
   */
  requiresExternalReasoning: boolean;

  /**
   * Internal reason for optional external reasoning.
   */
  externalReason: string | null;
};

type Ctx = AgentContext;
type Page = Ctx["pages"][number];
type Section = Page["sections"][number];

export type BuilderOptions = {
  /**
   * Previous owner messages, oldest first.
   *
   * Used by the interpreter to understand references such as:
   * "make it bigger"
   * "change that"
   * "do the same on the other page"
   */
  history?: string[];

  /**
   * Files/photos/uploads attached to the request.
   */
  attachments?: {
    kind: string;
    name: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Business facts                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert the workspace context into the exact fact contract expected by
 * copy.ts.
 *
 * IMPORTANT:
 * Nothing is inferred here.
 * Nothing is fabricated here.
 */
const factsOf = (context: Ctx): CopyFacts => ({
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
});

/* -------------------------------------------------------------------------- */
/* String helpers                                                             */
/* -------------------------------------------------------------------------- */

const cleanText = (value: unknown): string =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";

const lower = (value: string): string =>
  cleanText(value).toLowerCase();

const slugify = (value: string): string =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const titleCase = (value: string): string =>
  cleanText(value)
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 120);

const unique = <T>(values: T[]): T[] =>
  [...new Set(values)];

const hasText = (value: string | null | undefined): boolean =>
  Boolean(cleanText(value));

/* -------------------------------------------------------------------------- */
/* Page resolution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Find the page explicitly requested by the owner.
 *
 * Matching is intentionally conservative.
 * We never manufacture a page ID.
 */
function targetPage(
  context: Ctx,
  intent: BuilderIntent,
): Page | null {
  const hints = intent.pageHints
    .map((hint) => lower(hint))
    .filter(Boolean);

  for (const hint of hints) {
    const match = context.pages.find((page) => {
      const slug = lower(page.slug).replace(/^\/+/, "");
      const title = lower(page.title);
      const kind = lower(page.kind);

      return (
        slug === hint ||
        slug === hint.replace(/^\/+/, "") ||
        title === hint ||
        kind === hint
      );
    });

    if (match) return match;
  }

  return (
    context.pages.find((page) => lower(page.kind) === "home") ??
    context.pages.find((page) => {
      const slug = lower(page.slug).replace(/^\/+/, "");
      return slug === "" || slug === "home";
    }) ??
    context.pages[0] ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* Section helpers                                                            */
/* -------------------------------------------------------------------------- */

const sectionsOf = (
  page: Page | null,
): Section[] => page?.sections ?? [];

const findSection = (
  page: Page | null,
  kind: string,
): Section | undefined =>
  sectionsOf(page).find(
    (section) => lower(section.kind) === lower(kind),
  );

const findSections = (
  page: Page | null,
  kind: string,
): Section[] =>
  sectionsOf(page).filter(
    (section) => lower(section.kind) === lower(kind),
  );

/**
 * Avoid creating duplicate sections when a page already contains the same
 * semantic block.
 */
const hasSectionKind = (
  page: Page | null,
  kind: string,
): boolean =>
  Boolean(findSection(page, kind));

/* -------------------------------------------------------------------------- */
/* Page planning                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decide which sections a page should receive.
 *
 * The industry's playbook is preferred over a generic template.
 * Generic fallback exists only because custom industries/pages may not have
 * a dedicated page recipe.
 */
function pageSectionPlan(
  kind: string,
  playbook: IndustryPlaybook,
): string[] {
  const normalized = lower(kind);

  if (normalized === "services") {
    return unique([
      ...playbook.servicePageSections,
      "faq",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (normalized === "about") {
    return unique([
      "hero",
      "intro",
      "benefits",
      "area",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (normalized === "contact") {
    return unique([
      "hero",
      "contact",
      "area",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (normalized === "pricing") {
    return unique([
      "hero",
      "pricing",
      "faq",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (
    normalized === "book" ||
    normalized === "booking"
  ) {
    return unique([
      "hero",
      "booking",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (normalized === "gallery") {
    return unique([
      "hero",
      "gallery",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  if (normalized === "reviews") {
    return unique([
      "hero",
      "reviews",
      "cta",
    ]).slice(0, MAX_SECTIONS_PER_PAGE);
  }

  return unique([
    "hero",
    "intro",
    "services",
    "benefits",
    "faq",
    "cta",
  ]).slice(0, MAX_SECTIONS_PER_PAGE);
}

/**
 * Infer a page kind from an owner-created page name.
 */
function pageKindFromLabel(
  label: string,
  slug: string,
): string {
  const text = `${label} ${slug}`.toLowerCase();

  const map: Array<[RegExp, string]> = [
    [/price|pricing|cost|rate|package/, "pricing"],
    [/book|schedul|appoint|calendar/, "book"],
    [/quote|estimate/, "contact"],
    [/contact|get in touch|reach/, "contact"],
    [/about|story|team|who we are/, "about"],
    [/review|testimonial|feedback/, "reviews"],
    [/gallery|portfolio|work|photo|project/, "gallery"],
    [/service|what we do|offer/, "services"],
    [/faq|question/, "services"],
  ];

  for (const [pattern, kind] of map) {
    if (pattern.test(text)) return kind;
  }

  return "custom";
}

/* -------------------------------------------------------------------------- */
/* Action identity / safety                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Convert an action into a stable semantic key.
 *
 * JSON.stringify is safe here because AgentAction is a plain discriminated
 * union with deterministic property order produced by this compiler.
 */
const actionKey = (action: AgentAction): string =>
  JSON.stringify(action);

/**
 * Push an action only once.
 *
 * This is important because several planning passes can legitimately discover
 * the same required change.
 */
function createActionCollector(cap: number) {
  const actions: AgentAction[] = [];
  const seen = new Set<string>();

  const push = (
    action: AgentAction,
  ): boolean => {
    if (actions.length >= cap) return false;

    const key = actionKey(action);

    if (seen.has(key)) return false;

    seen.add(key);
    actions.push(action);
    return true;
  };

  return {
    actions,
    push,
    has: (action: AgentAction) =>
      seen.has(actionKey(action)),
  };
}

/* -------------------------------------------------------------------------- */
/* Temporary references                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Temporary page/section references are supported by site-agent.ts.
 *
 * Keeping generation and population inside one plan means a newly-created
 * page does not appear as a blank page after generation.
 */
function tempPageRef(index: number): string {
  return `temp_page_${index}`;
}

function tempSectionRef(
  pageIndex: number,
  sectionIndex: number,
): string {
  return `temp_section_${pageIndex}_${sectionIndex}`;
}

/* -------------------------------------------------------------------------- */
/* Section operations                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Preserve the interpreter's clause-aware behavior.
 *
 * Example:
 *
 * "Remove pricing and add booking"
 *
 * must NOT become:
 *
 * remove pricing
 * remove booking
 * add pricing
 * add booking
 *
 * Each section is paired with the verbs belonging to its clause.
 */
function sectionOperations(
  intent: BuilderIntent,
): {
  kind: string;
  verbs: BuilderIntent["verbs"];
}[] {
  const clauseOperations = intent.operations
    .filter(
      (operation) =>
        operation.sectionKinds.length > 0,
    )
    .flatMap((operation) =>
      operation.sectionKinds.map((kind) => ({
        kind,
        verbs: operation.verbs,
      })),
    );

  if (clauseOperations.length) {
    return clauseOperations;
  }

  return intent.sectionKinds.map((kind) => ({
    kind,
    verbs: intent.verbs,
  }));
}

/* -------------------------------------------------------------------------- */
/* Existing page checks                                                       */
/* -------------------------------------------------------------------------- */

function pageAlreadyExists(
  context: Ctx,
  slug: string,
): boolean {
  const normalized = slug.replace(/^\/+/, "");

  return context.pages.some(
    (page) =>
      page.slug
        .replace(/^\/+/, "")
        .toLowerCase() === normalized.toLowerCase(),
  );
}

function pageIsVisible(
  page: Page,
): boolean {
  /**
   * The AgentContext contract does not guarantee an `is_visible` property
   * on the page object in every version of the application.
   *
   * Therefore this compiler intentionally does not assume one.
   *
   * Visibility changes remain explicit AgentActions only.
   */
  return true;
}

/* -------------------------------------------------------------------------- */
/* Copy helpers                                                               */
/* -------------------------------------------------------------------------- */

function sectionTextActions(
  push: (action: AgentAction) => boolean,
  section: Section,
  facts: CopyFacts,
  playbook: IndustryPlaybook,
): number {
  const copy = sectionCopy(
    section.kind,
    facts,
    playbook,
  );

  let count = 0;

  if (
    copy.heading &&
    cleanText(copy.heading) !==
      cleanText(section.heading)
  ) {
    if (
      push({
        type: "set_section_text",
        sectionId: section.id,
        field: "heading",
        value: copy.heading,
      })
    ) {
      count++;
    }
  }

  if (
    copy.subheading &&
    cleanText(copy.subheading) !==
      cleanText(section.subheading)
  ) {
    if (
      push({
        type: "set_section_text",
        sectionId: section.id,
        field: "subheading",
        value: copy.subheading,
      })
    ) {
      count++;
    }
  }

  if (
    copy.body &&
    cleanText(copy.body) !==
      cleanText(section.body)
  ) {
    if (
      push({
        type: "set_section_text",
        sectionId: section.id,
        field: "body",
        value: copy.body,
      })
    ) {
      count++;
    }
  }

  return count;
}

/* -------------------------------------------------------------------------- */
/* Main compiler                                                              */
/* -------------------------------------------------------------------------- */

export function buildDeterministicPlan(
  context: Ctx,
  instruction: string,
  options: BuilderOptions = {},
): DeterministicPlan {
  const originalInstruction = cleanText(instruction);

  const intent = interpret(
    originalInstruction,
    options.history ?? [],
  );

  const playbook =
    intent.industry ??
    playbookFor(
      context.business.industry,
      originalInstruction,
    );

  const facts = factsOf(context);

  const wholeSite = Boolean(intent.wholeSite);

  const cap = wholeSite
    ? MAX_ACTIONS_WHOLE_SITE
    : MAX_ACTIONS;

  const collector = createActionCollector(cap);

  const actions = collector.actions;
  const push = collector.push;

  const notes: string[] = [];
  const questions: string[] = [];
  const trace: string[] = [];
  const tasks: BuilderTask[] = [];

  const completedAreas = new Set<string>();

  const page = targetPage(
    context,
    intent,
  );

  const allowedSections =
    new Set(context.sectionKinds);

  const attachments =
    options.attachments ?? [];

  trace.push(
    `Parsed the request locally using Revora's deterministic builder.`,
  );

  trace.push(
    `Selected the ${playbook.label} industry playbook.`,
  );

  if (wholeSite) {
    trace.push(
      "Whole-site mode enabled because the request explicitly describes a site-wide build or redesign.",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Task helper                                                              */
  /* ------------------------------------------------------------------------ */

  const task = (
    title: string,
    work: () => boolean,
  ) => {
    const before = actions.length;

    let completed = false;

    try {
      completed = work();
    } catch (error) {
      /**
       * The compiler must never take down the builder because one optional
       * planning branch failed.
       */
      notes.push(
        `${title} could not be planned safely and was skipped.`,
      );

      trace.push(
        `Planner branch recovered from an internal planning error: ${String(
          error instanceof Error
            ? error.message
            : error,
        ).slice(0, 180)}`,
      );
    }

    const changed =
      completed ||
      actions.length > before;

    tasks.push({
      title,
      done: changed,
    });

    return changed;
  };

  /* ------------------------------------------------------------------------ */
  /* DESIGN                                                                   */
  /* ------------------------------------------------------------------------ */

  const wantsDesign =
    wholeSite ||
    intent.verbs.includes("restyle") ||
    intent.moods.length > 0;

  const design = designDecision(
    playbook,
    intent.moods,
    [
      context.business.name,
      context.business.city ?? "",
      context.business.state ?? "",
      playbook.slug,
    ].join("|"),
  );

  if (wantsDesign) {
    task(
      "Set one coordinated design direction",
      () => {
        let changed = false;

        if (
          push({
            type: "set_theme",
            patch: design.theme,
          })
        ) {
          changed = true;
        }

        if (
          push({
            type: "set_backdrop",
            backdrop: design.backdrop,
          })
        ) {
          changed = true;
        }

        const hero =
          findSection(page, "hero") ??
          sectionsOf(page)[0];

        if (hero) {
          if (
            push({
              type: "set_section_effect",
              sectionId: hero.id,
              effect: design.heroEffect,
            })
          ) {
            changed = true;
          }

          if (
            hero.kind === "hero" &&
            design.density !== "standard"
          ) {
            const variant =
              HERO_LAYOUT[design.density];

            if (
              push({
                type: "set_section_variant",
                sectionId: hero.id,
                variant,
              })
            ) {
              changed = true;
            }
          }
        }

        /**
         * Keep body motion restrained.
         *
         * Premium does not mean every block gets an animation.
         */
        if (
          design.bodyEffect !== "none" &&
          page
        ) {
          for (
            const section of sectionsOf(page).slice(1, 5)
          ) {
            if (
              push({
                type: "set_section_effect",
                sectionId: section.id,
                effect: design.bodyEffect,
              })
            ) {
              changed = true;
            }
          }
        }

        if (design.rationale.length) {
          notes.push(
            ...design.rationale.slice(0, 4),
          );
        }

        trace.push(
          "Applied one coordinated visual direction instead of unrelated style changes.",
        );

        if (changed) {
          completedAreas.add("design");
        }

        return changed;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* WHOLE SITE                                                               */
  /* ------------------------------------------------------------------------ */

  if (wholeSite) {
    task(
      "Build the site's essential pages",
      () => {
        let changed = false;
        let pageIndex = 0;

        for (
          const wanted of playbook.pages
        ) {
          if (actions.length >= cap) break;

          const slug = slugify(
            wanted.slug ||
              wanted.title,
          );

          if (!slug) continue;

          if (
            pageAlreadyExists(
              context,
              slug,
            )
          ) {
            continue;
          }

          const requestedKind =
            cleanText(wanted.kind) ||
            "custom";

          const kind =
            context.pageKinds.includes(
              requestedKind,
            )
              ? requestedKind
              : context.pageKinds.includes(
                    "custom",
                  )
                ? "custom"
                : context.pageKinds[0] ??
                  "custom";

          const ref =
            tempPageRef(pageIndex++);

          if (
            push({
              type: "add_page",
              kind,
              title:
                cleanText(wanted.title) ||
                titleCase(slug),
              slug,
              ref,
            })
          ) {
            changed = true;
          }

          const sectionPlan =
            pageSectionPlan(
              requestedKind,
              playbook,
            );

          let position = 0;
          let sectionIndex = 0;

          for (
            const sectionKind of sectionPlan
          ) {
            if (
              actions.length >= cap
            ) {
              break;
            }

            if (
              !allowedSections.has(
                sectionKind,
              )
            ) {
              continue;
            }

            const copy =
              sectionCopy(
                sectionKind,
                facts,
                playbook,
              );

            const sectionRef =
              tempSectionRef(
                pageIndex,
                sectionIndex++,
              );

            if (
              push({
                type: "add_section",
                pageId: ref,
                ref: sectionRef,
                kind: sectionKind,
                heading:
                  copy.heading ||
                  undefined,
                subheading:
                  copy.subheading ||
                  undefined,
                body:
                  copy.body ||
                  undefined,
                position: position++,
              })
            ) {
              changed = true;
            }

            /**
             * FAQ questions are safe to add because they are questions,
             * not fabricated answers or reviews.
             */
            if (
              sectionKind === "faq"
            ) {
              for (
                const question of faqQuestions(
                  playbook,
                ).slice(
                  0,
                  MAX_FAQ_ITEMS,
                )
              ) {
                if (
                  actions.length >= cap
                ) {
                  break;
                }

                push({
                  type: "add_component",
                  sectionId:
                    sectionRef,
                  kind: "faq",
                  label: question,
                });
              }
            }
          }

          const seo =
            pageSeo(
              wanted.title ||
                titleCase(slug),
              facts,
              playbook,
            );

          if (
            push({
              type: "set_page",
              pageId: ref,
              patch: seo,
            })
          ) {
            changed = true;
          }
        }

        if (changed) {
          completedAreas.add(
            "pages",
          );

          trace.push(
            "Created missing industry pages as complete page experiences rather than empty shells.",
          );
        }

        return changed;
      },
    );

    /* ---------------------------------------------------------------------- */
    /* HOME PAGE                                                              */
    /* ---------------------------------------------------------------------- */

    task(
      "Complete the home page",
      () => {
        if (!page) return false;

        let changed = false;

        let position =
          sectionsOf(page).length;

        for (
          const sectionKind of playbook.homeSections
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          if (
            position >=
            MAX_SECTIONS_PER_PAGE
          ) {
            break;
          }

          if (
            !allowedSections.has(
              sectionKind,
            )
          ) {
            continue;
          }

          if (
            hasSectionKind(
              page,
              sectionKind,
            )
          ) {
            continue;
          }

          const copy =
            sectionCopy(
              sectionKind,
              facts,
              playbook,
            );

          if (
            push({
              type: "add_section",
              pageId: page.id,
              kind: sectionKind,
              heading:
                copy.heading ||
                undefined,
              subheading:
                copy.subheading ||
                undefined,
              body:
                copy.body ||
                undefined,
              position,
            })
          ) {
            changed = true;
            position++;
          }
        }

        if (changed) {
          completedAreas.add(
            "sections",
          );

          trace.push(
            "Completed missing home-page sections using the industry's buyer decision order.",
          );
        }

        return changed;
      },
    );

    /* ---------------------------------------------------------------------- */
    /* HOME COPY                                                              */
    /* ---------------------------------------------------------------------- */

    task(
      "Repair missing home-page copy",
      () => {
        if (!page) return false;

        let changed = false;

        for (
          const section of sectionsOf(
            page,
          ).slice(
            0,
            MAX_COPY_SECTIONS,
          )
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          const added =
            sectionTextActions(
              push,
              section,
              facts,
              playbook,
            );

          if (added > 0) {
            changed = true;
          }
        }

        if (changed) {
          completedAreas.add(
            "copy",
          );

          trace.push(
            "Filled weak or missing section copy from the business's own stored facts.",
          );
        }

        return changed;
      },
    );

    /* ---------------------------------------------------------------------- */
    /* FAQ                                                                    */
    /* ---------------------------------------------------------------------- */

    task(
      "Add useful customer questions",
      () => {
        if (!page) return false;

        const faq =
          findSection(
            page,
            "faq",
          );

        if (!faq) {
          return false;
        }

        const existing = new Set(
          faq.components
            .map(
              (component) =>
                cleanText(
                  component.label,
                ).toLowerCase(),
            )
            .filter(Boolean),
        );

        let changed = false;

        for (
          const question of faqQuestions(
            playbook,
          ).slice(
            0,
            MAX_FAQ_ITEMS,
          )
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          const normalized =
            cleanText(
              question,
            ).toLowerCase();

          if (
            existing.has(
              normalized,
            )
          ) {
            continue;
          }

          if (
            push({
              type: "add_component",
              sectionId: faq.id,
              kind: "faq",
              label: question,
            })
          ) {
            existing.add(
              normalized,
            );
            changed = true;
          }
        }

        if (changed) {
          completedAreas.add(
            "faq",
          );
        }

        return changed;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* EXPLICIT SECTION OPERATIONS                                              */
  /* ------------------------------------------------------------------------ */

  for (
    const operation of sectionOperations(
      intent,
    )
  ) {
    if (
      actions.length >= cap
    ) {
      break;
    }

    const kind =
      cleanText(operation.kind);

    if (!kind) continue;

    if (
      !allowedSections.has(kind)
    ) {
      notes.push(
        `The "${kind}" section is not supported by the current site section library, so it was not invented.`,
      );
      continue;
    }

    const existing =
      findSection(
        page,
        kind,
      );

    const verbs =
      operation.verbs;

    /* ---------------------------------------------------------------------- */
    /* REMOVE                                                                 */
    /* ---------------------------------------------------------------------- */

    if (
      verbs.includes("remove")
    ) {
      if (existing) {
        push({
          type: "delete_section",
          sectionId:
            existing.id,
        });

        completedAreas.add(
          "sections",
        );
      }

      continue;
    }

    /* ---------------------------------------------------------------------- */
    /* HIDE                                                                   */
    /* ---------------------------------------------------------------------- */

    if (
      verbs.includes("hide")
    ) {
      if (existing) {
        push({
          type: "set_section_visibility",
          sectionId:
            existing.id,
          visible: false,
        });

        completedAreas.add(
          "visibility",
        );
      }

      continue;
    }

    /* ---------------------------------------------------------------------- */
    /* SHOW                                                                   */
    /* ---------------------------------------------------------------------- */

    if (
      verbs.includes("show")
    ) {
      if (existing) {
        push({
          type: "set_section_visibility",
          sectionId:
            existing.id,
          visible: true,
        });

        completedAreas.add(
          "visibility",
        );
      }

      continue;
    }

    /* ---------------------------------------------------------------------- */
    /* RESIZE                                                                 */
    /* ---------------------------------------------------------------------- */

    if (
      verbs.includes("resize")
    ) {
      if (
        existing?.kind ===
        "hero"
      ) {
        const bigger =
          /\b(bigger|larger|taller|full[\s-]?screen|huge)\b/i.test(
            intent.original,
          );

        const variant =
          bigger
            ? HERO_LAYOUT.full
            : HERO_LAYOUT.compact;

        push({
          type: "set_section_variant",
          sectionId:
            existing.id,
          variant,
        });

        if (
          bigger
        ) {
          push({
            type: "set_section_effect",
            sectionId:
              existing.id,
            effect: "rise",
          });
        }

        completedAreas.add(
          "layout",
        );
      }

      continue;
    }

    /* ---------------------------------------------------------------------- */
    /* REWRITE                                                                */
    /* ---------------------------------------------------------------------- */

    if (
      verbs.includes("rewrite")
    ) {
      if (existing) {
        const added =
          sectionTextActions(
            push,
            existing,
            facts,
            playbook,
          );

        if (added > 0) {
          completedAreas.add(
            "copy",
          );
        }
      }

      continue;
    }

    /* ---------------------------------------------------------------------- */
    /* ADD                                                                    */
    /* ---------------------------------------------------------------------- */

    if (
      !existing &&
      page
    ) {
      const copy =
        sectionCopy(
          kind,
          facts,
          playbook,
        );

      push({
        type: "add_section",
        pageId: page.id,
        kind,
        heading:
          copy.heading ||
          undefined,
        subheading:
          copy.subheading ||
          undefined,
        body:
          copy.body ||
          undefined,
        position:
          sectionsOf(page)
            .length,
      });

      completedAreas.add(
        "sections",
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* WHOLE-PAGE REWRITE                                                       */
  /* ------------------------------------------------------------------------ */

  if (
    intent.verbs.includes(
      "rewrite",
    ) &&
    intent.sectionKinds.length ===
      0 &&
    page
  ) {
    task(
      "Rewrite the page around the business's own facts",
      () => {
        let changed = false;

        for (
          const section of sectionsOf(
            page,
          ).slice(
            0,
            MAX_COPY_SECTIONS,
          )
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          const added =
            sectionTextActions(
              push,
              section,
              facts,
              playbook,
            );

          if (added > 0) {
            changed = true;
          }
        }

        if (changed) {
          completedAreas.add(
            "copy",
          );
        }

        return changed;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* HIERARCHY                                                               */
  /* ------------------------------------------------------------------------ */

  if (
    intent.verbs.includes(
      "hierarchy",
    ) &&
    page &&
    sectionsOf(page).length >
      2
  ) {
    task(
      "Improve the page's visual decision order",
      () => {
        const current =
          sectionsOf(page);

        const sorted =
          hierarchySort(
            current,
          );

        const changed =
          sorted.some(
            (
              section,
              index,
            ) =>
              section.id !==
              current[index]?.id,
          );

        if (!changed) {
          return false;
        }

        if (
          push({
            type: "reorder_sections",
            pageId: page.id,
            sectionIds:
              sorted.map(
                (section) =>
                  section.id,
              ),
          })
        ) {
          completedAreas.add(
            "hierarchy",
          );

          trace.push(
            "Reordered the page around visitor decision-making instead of arbitrary section order.",
          );

          return true;
        }

        return false;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* OWNER-NAMED PAGES                                                        */
  /* ------------------------------------------------------------------------ */

  let namedPageIndex = 0;

  for (
    const label of intent.newPages
  ) {
    if (
      actions.length >= cap
    ) {
      break;
    }

    const cleanLabel =
      cleanText(label);

    const slug =
      slugify(cleanLabel);

    if (!slug) continue;

    if (
      pageAlreadyExists(
        context,
        slug,
      )
    ) {
      notes.push(
        `The /${slug} page already exists, so Revora left the existing page intact.`,
      );
      continue;
    }

    const guessedKind =
      pageKindFromLabel(
        cleanLabel,
        slug,
      );

    const kind =
      context.pageKinds.includes(
        guessedKind,
      )
        ? guessedKind
        : context.pageKinds.includes(
              "custom",
            )
          ? "custom"
          : context.pageKinds[0] ??
            "custom";

    const title =
      titleCase(
        cleanLabel,
      );

    const pageRef =
      `temp_named_page_${namedPageIndex++}`;

    push({
      type: "add_page",
      kind,
      title,
      slug,
      ref: pageRef,
    });

    const sections =
      pageSectionPlan(
        guessedKind,
        playbook,
      );

    let position = 0;
    let sectionIndex = 0;

    for (
      const sectionKind of sections
    ) {
      if (
        actions.length >= cap
      ) {
        break;
      }

      if (
        !allowedSections.has(
          sectionKind,
        )
      ) {
        continue;
      }

      const copy =
        sectionCopy(
          sectionKind,
          facts,
          playbook,
        );

      const sectionRef =
        tempSectionRef(
          namedPageIndex,
          sectionIndex++,
        );

      push({
        type: "add_section",
        pageId: pageRef,
        ref: sectionRef,
        kind: sectionKind,
        heading:
          copy.heading ||
          undefined,
        subheading:
          copy.subheading ||
          undefined,
        body:
          copy.body ||
          undefined,
        position: position++,
      });

      if (
        sectionKind ===
        "faq"
      ) {
        for (
          const question of faqQuestions(
            playbook,
          ).slice(
            0,
            MAX_FAQ_ITEMS,
          )
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          push({
            type: "add_component",
            sectionId:
              sectionRef,
            kind: "faq",
            label: question,
          });
        }
      }
    }

    push({
      type: "set_page",
      pageId: pageRef,
      patch: pageSeo(
        title,
        facts,
        playbook,
      ),
    });

    notes.push(
      `Created /${slug} as a complete page plan instead of leaving it as an empty shell.`,
    );

    completedAreas.add(
      "pages",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* CTA                                                                      */
  /* ------------------------------------------------------------------------ */

  if (
    intent.verbs.includes("cta") ||
    wholeSite
  ) {
    task(
      "Strengthen the primary visitor next step",
      () => {
        const target =
          ctaTarget(facts);

        if (!target) {
          return false;
        }

        const candidates =
          intent.everyPage ||
          wholeSite
            ? context.pages.slice(
                0,
                MAX_EXISTING_PAGES_FOR_BROAD_ACTIONS,
              )
            : page
              ? [page]
              : [];

        let changed = false;

        for (
          const candidate of candidates
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          const host =
            findSection(
              candidate,
              "hero",
            ) ??
            sectionsOf(
              candidate,
            )[0];

          if (!host) {
            continue;
          }

          const alreadyHasButton =
            host.components.some(
              (component) =>
                component.kind ===
                  "button" ||
                component.link_url ===
                  target.url,
            );

          if (
            alreadyHasButton
          ) {
            continue;
          }

          if (
            push({
              type: "add_component",
              sectionId:
                host.id,
              kind: "button",
              label:
                playbook
                  .ctaLabels
                  .primary,
              link_url:
                target.url,
              link_label:
                playbook
                  .ctaLabels
                  .primary,
            })
          ) {
            changed = true;
          }
        }

        if (
          !facts.phone &&
          !facts.email
        ) {
          questions.push(
            "What phone number or email should visitors use for the main contact action?",
          );

          notes.push(
            "No phone or email is stored, so Revora keeps the CTA pointed at the existing contact route rather than inventing contact information.",
          );
        }

        if (changed) {
          completedAreas.add(
            "buttons",
          );

          trace.push(
            "Added conversion actions without inventing contact information.",
          );
        }

        return changed;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* SEO                                                                      */
  /* ------------------------------------------------------------------------ */

  if (
    intent.verbs.includes("seo") ||
    wholeSite
  ) {
    task(
      "Complete missing page SEO",
      () => {
        let changed = false;

        for (
          const candidate of context.pages.slice(
            0,
            MAX_EXISTING_PAGES_FOR_BROAD_ACTIONS,
          )
        ) {
          if (
            actions.length >= cap
          ) {
            break;
          }

          /**
           * Only repair missing metadata.
           *
           * Explicit SEO requests can safely regenerate metadata, but
           * ordinary whole-site generation should avoid needlessly replacing
           * existing custom SEO written by the owner.
           */
          const needsSeo =
            !hasText(
              candidate.seo_title,
            ) ||
            !hasText(
              candidate.seo_description,
            );

          if (
            !needsSeo &&
            !intent.verbs.includes(
              "seo",
            )
          ) {
            continue;
          }

          const seo =
            pageSeo(
              candidate.title ||
                "Home",
              facts,
              playbook,
            );

          if (
            push({
              type: "set_page",
              pageId:
                candidate.id,
              patch: seo,
            })
          ) {
            changed = true;
          }
        }

        if (changed) {
          completedAreas.add(
            "seo",
          );

          trace.push(
            "Generated deterministic SEO metadata from real business facts only.",
          );
        }

        return changed;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* MOBILE                                                                   */
  /* ------------------------------------------------------------------------ */

  if (
    intent.verbs.includes(
      "mobile",
    ) ||
    wholeSite
  ) {
    task(
      "Improve mobile conversion access",
      () => {
        if (!page) {
          return false;
        }

        /**
         * The section renderer already owns responsive layout.
         * We do not fabricate CSS or inject arbitrary mobile markup here.
         *
         * A sticky CTA is therefore the only deterministic mobile enhancement
         * this planner can safely request when the section library supports it.
         */
        const sticky =
          findSection(
            page,
            "sticky_cta",
          );

        if (
          sticky ||
          !allowedSections.has(
            "sticky_cta",
          )
        ) {
          notes.push(
            "Responsive behavior remains owned by the existing renderer; no unsafe mobile markup was injected.",
          );

          return false;
        }

        const copy =
          sectionCopy(
            "sticky_cta",
            facts,
            playbook,
          );

        if (
          push({
            type: "add_section",
            pageId: page.id,
            kind: "sticky_cta",
            heading:
              copy.heading ||
              undefined,
            subheading:
              copy.subheading ||
              undefined,
            body:
              copy.body ||
              undefined,
            position:
              sectionsOf(page)
                .length,
          })
        ) {
          completedAreas.add(
            "mobile",
          );

          notes.push(
            "Added the existing sticky CTA section so the primary action remains easy to reach on phones.",
          );

          return true;
        }

        return false;
      },
    );
  }

  /* ------------------------------------------------------------------------ */
  /* ATTACHMENTS                                                              */
  /* ------------------------------------------------------------------------ */

  if (
    attachments.length >
    0
  ) {
    const kinds =
      unique(
        attachments
          .map(
            (item) =>
              cleanText(
                item.kind,
              ),
          )
          .filter(Boolean),
      );

    notes.push(
      `Kept ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} associated with this request${kinds.length ? ` (${kinds.join(", ")})` : ""}.`,
    );

    trace.push(
      "Attachments were not sent to an outside provider automatically.",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* MISSING BUSINESS FACTS                                                   */
  /* ------------------------------------------------------------------------ */

  const currentPlace =
    place(facts);

  if (
    intent.locationHint
  ) {
    const hint =
      cleanText(
        intent.locationHint,
      );

    const hintTown =
      hint
        .split(",")[0]
        ?.trim()
        .toLowerCase() ??
      "";

    const stored =
      currentPlace
        ?.toLowerCase()
        .includes(
          hintTown,
        ) ??
      false;

    if (
      hintTown &&
      !stored
    ) {
      questions.unshift(
        currentPlace
          ? `You mentioned "${hint}" — should that replace the current service area "${currentPlace}", or was it only for this request?`
          : `You mentioned "${hint}" — should that become the business's service area?`,
      );
    }
  } else if (
    !currentPlace &&
    (
      wholeSite ||
      intent.verbs.includes(
        "seo",
      )
    )
  ) {
    questions.push(
      "Which town or service area should the website use?",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* BUSINESS DATA SAFETY                                                     */
  /* ------------------------------------------------------------------------ */

  /**
   * Do not manufacture missing phone/email information.
   *
   * This check exists as an explicit compiler invariant.
   */
  if (
    !facts.phone &&
    !facts.email
  ) {
    trace.push(
      "No contact details were invented; the existing contact route remains the fallback CTA.",
    );
  }

  /**
   * Do not claim reviews exist merely because a reviews section exists.
   */
  if (
    context.business.publishedReviewCount ===
      0 &&
    page &&
    findSection(
      page,
      "reviews",
    )
  ) {
    notes.push(
      "A reviews section is present, but no published review count is stored, so no review text or ratings were invented.",
    );
  }

  /**
   * Same rule for galleries.
   */
  if (
    context.business.photoCount ===
      0 &&
    page &&
    findSection(
      page,
      "gallery",
    )
  ) {
    notes.push(
      "A gallery section is present, but no business photos are stored, so no fake project imagery or project claims were created.",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* FINAL PLAN SELF-CHECK                                                    */
  /* ------------------------------------------------------------------------ */

  const uniqueActions =
    unique(
      actions.map(
        (action) =>
          actionKey(action),
      ),
    );

  /**
   * The collector already deduplicates, but this invariant makes the contract
   * explicit and protects the plan if future planning branches change.
   */
  if (
    uniqueActions.length !==
    actions.length
  ) {
    trace.push(
      "Removed duplicate actions during final plan validation.",
    );
  }

  /**
   * Never exceed the executor's safe ceiling.
   */
  if (
    actions.length >
    cap
  ) {
    actions.splice(
      cap,
    );

    notes.push(
      "The request was larger than one safe execution batch; the highest-priority deterministic changes were retained.",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Recognition / coverage                                                   */
  /* ------------------------------------------------------------------------ */

  const recognized =
    intent.verbs.length > 0 ||
    intent.sectionKinds.length >
      0 ||
    intent.newPages.length >
      0 ||
    intent.moods.length > 0;

  /**
   * If we recognized meaningful website work and generated actions, it is
   * handled deterministically unless the interpreter explicitly reported
   * unsupported work.
   */
  const coverage: DeterministicPlan["coverage"] =
    actions.length === 0
      ? "none"
      : intent.unrecognised.length ===
          0
        ? "full"
        : "partial";

  /* ------------------------------------------------------------------------ */
  /* Optional external reasoning                                              */
  /* ------------------------------------------------------------------------ */

  let externalReason:
    | string
    | null = null;

  /**
   * IMPORTANT:
   *
   * A request does NOT require an external AI call simply because the user
   * used natural language.
   *
   * External reasoning is only considered when:
   *
   * 1. There is no deterministic website action, OR
   * 2. An attachment genuinely needs semantic inspection.
   */
  if (
    actions.length ===
      0 &&
    attachments.length >
      0
  ) {
    externalReason =
      "An attachment may need semantic inspection before a safe website change can be planned.";
  } else if (
    actions.length ===
      0 &&
    !recognized
  ) {
    externalReason =
      "No supported website operation was confidently recognized.";
  }

  /* ------------------------------------------------------------------------ */
  /* Summary                                                                  */
  /* ------------------------------------------------------------------------ */

  const summaryAreas =
    [...completedAreas];

  const summary =
    summaryAreas.length > 0
      ? `Updated your ${summaryAreas.join(", ")}.`
      : "No safe website changes were generated.";

  const reply =
    actions.length > 0
      ? `I understood the request and prepared ${actions.length} safe website update${actions.length === 1 ? "" : "s"} across ${summaryAreas.join(", ") || "your site"}.`
      : "I could not safely map that request to a website change yet.";

  /* ------------------------------------------------------------------------ */
  /* Final trace                                                              */
  /* ------------------------------------------------------------------------ */

  trace.push(
    `Final plan contains ${actions.length} unique action${actions.length === 1 ? "" : "s"}.`,
  );

  trace.push(
    `Coverage: ${coverage}.`,
  );

  if (
    externalReason
  ) {
    trace.push(
      `Optional reasoning reason: ${externalReason}`,
    );
  } else {
    trace.push(
      "The request can be handled without an external AI provider.",
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Return                                                                  */
  /* ------------------------------------------------------------------------ */

  return {
    reply,

    summary,

    actions,

    /**
     * Keep customer-facing questions short and useful.
     */
    questions:
      unique(
        questions
          .map(cleanText)
          .filter(Boolean),
      ).slice(0, 2),

    notes:
      unique(
        notes
          .map(cleanText)
          .filter(Boolean),
      ).slice(0, 10),

    coverage,

    trace:
      unique(
        trace
          .map(cleanText)
          .filter(Boolean),
      ),

    intent,

    tasks,

    requiresExternalReasoning:
      externalReason !== null,

    externalReason,
  };
}

/* -------------------------------------------------------------------------- */
/* Public helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * True only when the deterministic engine considers the request fully handled.
 */
export const isFullyHandled = (
  plan: DeterministicPlan,
): boolean =>
  plan.coverage === "full";

/**
 * Useful for callers that need to know whether a plan actually changes
 * anything before attempting execution.
 */
export const hasDeterministicActions = (
  plan: DeterministicPlan,
): boolean =>
  plan.actions.length > 0;

/**
 * Useful for the agent layer when deciding whether a plan is safe to execute.
 */
export const actionCount = (
  plan: DeterministicPlan,
): number =>
  plan.actions.length;

/**
 * Human-readable internal diagnostics.
 *
 * This is intentionally pure and has no database/network side effects.
 */
export function deterministicPlanSummary(
  plan: DeterministicPlan,
): string {
  return [
    `coverage=${plan.coverage}`,
    `actions=${plan.actions.length}`,
    `tasks=${plan.tasks.length}`,
    `questions=${plan.questions.length}`,
    `requiresExternalReasoning=${plan.requiresExternalReasoning}`,
  ].join(" | ");
}