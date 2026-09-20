/**
 * AI-composed site structure (free-AI only, deterministic-safe).
 *
 * Revora's deterministic engine assembles every site from the same proven
 * section order and a ranked palette library, so two businesses in one trade
 * can come out looking like cousins. This module closes that gap: it asks a
 * FREE provider (through the central router — no direct provider calls, no paid
 * model reachable) for two structural judgements only:
 *
 *   1. which visual direction from the existing library fits this business, and
 *   2. which sections each page should contain, in which order.
 *
 * The model never writes copy and never states a fact. Every answer is
 * validated against the real workspace (real page ids, allowlisted section
 * kinds, proof sections only when real reviews exist) and expressed as ordinary
 * AgentActions, so the existing apply / verify / QA / rollback pipeline keeps
 * guarding it. Any failure — no free provider, malformed answer, unknown ids —
 * returns null and the deterministic planner stands unchanged.
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext, SiteMapPage } from "@/lib/site-agent.server";
import type { ContentPage } from "@/lib/website-content";
import {
  DESIGN_DIRECTIONS,
  directionActions,
  recommendDirections,
  type DesignDirection,
} from "@/lib/design-directions";

export type ComposedSitePlan = {
  actions: AgentAction[];
  notes: string[];
  /** Which direction was installed, for the trace. */
  directionId: string;
  /** One short plain-language line explaining the structural choice. */
  because: string;
};

/** Sections that must never be proposed twice on one page. */
const MAX_SECTIONS_PER_PAGE = 10;

/** Structural kinds the model may never introduce (they need facts it lacks). */
const FACT_GATED_KINDS = new Set(["reviews", "testimonials", "pricing", "gallery", "portfolio"]);

type PageProposal = { pageId: string; order: string[] };

function visiblePages(context: AgentContext): SiteMapPage[] {
  return context.pages.filter((page) => page.is_visible !== false);
}

function brief(context: AgentContext, directions: DesignDirection[]): string {
  const business = context.business;
  return JSON.stringify(
    {
      business: {
        name: business.name,
        industry: business.industry,
        city: business.city,
        services: business.services.map((service) => service.name).slice(0, 12),
        hasRealReviews: business.publishedReviewCount > 0,
        photoCount: business.photoCount,
        hasPrices: business.services.some(
          (service) => service.price !== null || service.startingPrice !== null,
        ),
      },
      directions: directions.map((direction) => ({
        id: direction.id,
        name: direction.name,
        mood: direction.mood,
        bestFor: direction.bestFor,
      })),
      allowedSectionKinds: context.sectionKinds,
      pages: visiblePages(context).map((page) => ({
        pageId: page.id,
        title: page.title,
        kind: page.kind,
        sections: page.sections
          .filter((section) => section.is_visible)
          .map((section) => section.kind),
      })),
    },
    null,
    1,
  );
}

const SYSTEM = `You are a senior web art director composing a small business website.
You decide STRUCTURE ONLY. You never write copy, never state a fact, never
mention prices, reviews, awards or years in business.

Return ONLY this JSON:
{
  "directionId": "<one id from directions>",
  "pages": [{ "pageId": "<a pageId given to you>", "order": ["<section kind>", ...] }],
  "because": "<one short sentence, plain English, no jargon>"
}

Rules:
- Use ONLY section kinds from allowedSectionKinds, and ONLY pageIds given to you.
- Each page: at most ${MAX_SECTIONS_PER_PAGE} kinds, no duplicates, and it must start with "hero".
- Every page must end with a way to make contact ("cta", "contact", "booking" or "quote").
- Do NOT include "reviews" or "testimonials" unless hasRealReviews is true.
- Do NOT include "pricing" unless hasPrices is true, and do not include "gallery" or
  "portfolio" unless photoCount is above 2.
- Compose for THIS trade: order the page the way a buyer in that trade decides.
  Two different businesses should get genuinely different structures.
- Pick the direction that suits the trade and audience, not the safest one.`;

function parseProposal(
  data: Record<string, unknown>,
  context: AgentContext,
  directions: DesignDirection[],
): { direction: DesignDirection; pages: PageProposal[]; because: string } | null {
  const directionId = typeof data['directionId'] === "string" ? data['directionId'] : "";
  const direction =
    directions.find((entry) => entry.id === directionId) ??
    DESIGN_DIRECTIONS.find((entry) => entry.id === directionId);
  if (!direction) return null;

  const allowedKinds = new Set(context.sectionKinds);
  const realPages = new Map(visiblePages(context).map((page) => [page.id, page]));
  const business = context.business;
  const rawPages = Array.isArray(data['pages']) ? data['pages'] : [];
  const pages: PageProposal[] = [];

  for (const entry of rawPages) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const pageId = typeof record['pageId'] === "string" ? record['pageId'] : "";
    if (!realPages.has(pageId)) continue;
    if (pages.some((page) => page.pageId === pageId)) continue;

    const order: string[] = [];
    for (const kind of Array.isArray(record['order']) ? record['order'] : []) {
      if (typeof kind !== "string") continue;
      if (!allowedKinds.has(kind)) continue;
      if (order.includes(kind)) continue;
      if (FACT_GATED_KINDS.has(kind)) {
        if (
          (kind === "reviews" || kind === "testimonials") &&
          business.publishedReviewCount <= 0
        )
          continue;
        if (
          kind === "pricing" &&
          !business.services.some(
            (service) => service.price !== null || service.startingPrice !== null,
          )
        )
          continue;
        if ((kind === "gallery" || kind === "portfolio") && business.photoCount <= 2) continue;
      }
      order.push(kind);
      if (order.length >= MAX_SECTIONS_PER_PAGE) break;
    }

    if (order.length < 3) continue;
    if (order[0] !== "hero") order.unshift("hero");
    pages.push({ pageId, order: order.slice(0, MAX_SECTIONS_PER_PAGE) });
  }

  if (!pages.length) return null;
  const because =
    typeof data['because'] === "string" && data['because'].trim().length > 3
      ? data['because'].trim().slice(0, 180)
      : `A layout composed for ${business.industry ?? "your trade"} rather than a template.`;

  return { direction, pages, because };
}

/**
 * Turns a validated proposal into real actions: reorder what already exists,
 * add only the missing kinds, and never delete or hide anything.
 */
function composeActions(
  context: AgentContext,
  proposal: { direction: DesignDirection; pages: PageProposal[] },
  cap: number,
): { actions: AgentAction[]; notes: string[] } {
  const actions: AgentAction[] = [];
  const notes: string[] = [];
  const pages = visiblePages(context);

  actions.push(
    ...directionActions(proposal.direction, pages as unknown as ContentPage[]).slice(0, cap),
  );

  for (const page of proposal.pages) {
    if (actions.length >= cap) break;
    const real = pages.find((entry) => entry.id === page.pageId);
    if (!real) continue;
    const existing = real.sections
      .filter((section) => section.is_visible)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    // Missing kinds become new sections at the position the director asked for.
    const present = new Set(existing.map((section) => section.kind));
    let added = 0;
    for (const [index, kind] of page.order.entries()) {
      if (present.has(kind)) continue;
      if (actions.length >= cap || added >= 3) break;
      actions.push({ type: "add_section", pageId: page.pageId, kind, position: index });
      present.add(kind);
      added += 1;
    }

    // Existing sections are resequenced into the composed order; anything the
    // director did not mention keeps its relative place at the end.
    const rank = new Map(page.order.map((kind, index) => [kind, index]));
    const ordered = existing
      .slice()
      .sort(
        (a, b) =>
          (rank.get(a.kind) ?? 500 + a.sort_order) - (rank.get(b.kind) ?? 500 + b.sort_order),
      );
    const changed = ordered.some((section, index) => existing[index]?.id !== section.id);
    if (changed && ordered.length > 1 && actions.length < cap) {
      actions.push({
        type: "reorder_sections",
        pageId: page.pageId,
        sectionIds: ordered.map((section) => section.id),
      });
    }
    if (added) notes.push(`${real.title}: added ${added} missing section(s).`);
  }

  return { actions: actions.slice(0, cap), notes };
}

/**
 * Asks a free provider to compose this specific site. Returns null whenever the
 * answer cannot be trusted, so the deterministic planner remains the floor.
 */
export async function proposeSiteComposition(
  context: AgentContext,
  options: {
    instruction: string;
    organizationId?: string | null;
    userId?: string | null;
    cap?: number;
  },
): Promise<ComposedSitePlan | null> {
  const { builderAiAvailable } = await import("@/lib/ai/availability");
  if (!builderAiAvailable()) return null;
  if (!visiblePages(context).length) return null;

  const directions = recommendDirections({
    businessName: context.business.name,
    industry: context.business.industry,
    services: context.business.services,
    city: context.business.city,
    currentFont: context.business.fontPreference,
    count: 8,
  });

  try {
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    const result = await generateStructuredOutput(
      {
        task: "site.compose",
        organizationId: options.organizationId ?? null,
        userId: options.userId ?? null,
      },
      {
        role: "primary",
        json: true,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `OWNER'S REQUEST (context only — do not write copy):\n${options.instruction}\n\nWORKSPACE:\n${brief(
              context,
              directions,
            )}`,
          },
        ],
      },
    );

    const proposal = parseProposal(result.data, context, directions);
    if (!proposal) return null;

    const composed = composeActions(context, proposal, options.cap ?? 40);
    if (!composed.actions.length) return null;

    return {
      actions: composed.actions,
      notes: composed.notes,
      directionId: proposal.direction.id,
      because: proposal.because,
    };
  } catch {
    // Free provider unavailable, rate limited, resting or unparseable: the
    // deterministic plan already covers this request.
    return null;
  }
}
