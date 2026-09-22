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

export type {
  BrandPreference,
  CompositionPreview,
} from "@/lib/builder/composition-preview";
import type {
  BrandPreference,
  CompositionPreview,
} from "@/lib/builder/composition-preview";


export type ComposedSitePlan = {
  actions: AgentAction[];
  notes: string[];
  /** Which direction was installed, for the trace. */
  directionId: string;
  /** One short plain-language line explaining the structural choice. */
  because: string;
  /** The approvable, previewable description of the same plan. */
  preview: CompositionPreview;
};

/** Sections that must never be proposed twice on one page. */
const MAX_SECTIONS_PER_PAGE = 10;

/** Structural kinds the model may never introduce (they need facts it lacks). */
const FACT_GATED_KINDS = new Set(["reviews", "testimonials", "pricing", "gallery", "portfolio"]);

type PageProposal = { pageId: string; order: string[] };

/** Owner-friendly names for the blocks shown in the preview. */
const BLOCK_LABELS: Record<string, string> = {
  hero: "First screen",
  trust_bar: "Trust strip",
  intro: "Introduction",
  services: "What you do",
  features: "Why choose you",
  benefits: "Benefits",
  process: "How it works",
  gallery: "Photos",
  portfolio: "Recent work",
  reviews: "Customer reviews",
  testimonials: "Customer reviews",
  pricing: "Prices",
  faq: "Questions answered",
  cta: "Call to action",
  contact: "Contact details",
  booking: "Booking",
  quote: "Get a price",
  about: "About you",
  team: "Your team",
  areas: "Areas covered",
};

export const blockLabel = (kind: string): string =>
  BLOCK_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());


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

export function parseProposal(
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
export function composeActions(
  context: AgentContext,
  proposal: { direction: DesignDirection; pages: PageProposal[] },
  cap: number,
): {
  actions: AgentAction[];
  notes: string[];
  pages: { pageId: string; title: string; blocks: string[]; added: string[] }[];
} {
  const actions: AgentAction[] = [];
  const notes: string[] = [];
  const preview: { pageId: string; title: string; blocks: string[]; added: string[] }[] = [];
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
    const addedKinds: string[] = [];
    for (const [index, kind] of page.order.entries()) {
      if (present.has(kind)) continue;
      if (actions.length >= cap || addedKinds.length >= 3) break;
      actions.push({ type: "add_section", pageId: page.pageId, kind, position: index });
      present.add(kind);
      addedKinds.push(kind);
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
    if (addedKinds.length)
      notes.push(`${real.title}: added ${addedKinds.length} missing section(s).`);

    // What the page will look like once this plan runs, in owner-friendly words.
    const finalKinds = page.order.filter((kind) => present.has(kind));
    for (const section of ordered) if (!finalKinds.includes(section.kind)) finalKinds.push(section.kind);
    preview.push({
      pageId: page.pageId,
      title: real.title,
      blocks: finalKinds.map(blockLabel),
      added: addedKinds.map(blockLabel),
    });
  }

  return { actions: actions.slice(0, cap), notes, pages: preview };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Folds the owner's own brand choices over the chosen direction.
 *
 * Their colours and font win for ordinary edits. When the request itself asks
 * for a new look ("redesign", "make it premium", "pick colours that suit my
 * industry"), the chosen palette wins instead — otherwise a redesign made
 * dozens of changes and left the site looking identical. A stated "keep my
 * colours" always wins over both. The previous palette is still in the restore
 * history, so one undo brings it back.
 */
export function applyBrandPreference(
  direction: DesignDirection,
  brand?: BrandPreference | null,
  mode: "keep_owner_colours" | "restyle" = "keep_owner_colours",
): { direction: DesignDirection; locked: boolean } {
  if (!brand) return { direction, locked: false };
  const next = { ...direction };
  let locked = false;
  if (mode !== "restyle") {
    if (brand.primaryColor && HEX.test(brand.primaryColor)) {
      next.primary = brand.primaryColor;
      locked = true;
    }
    if (brand.secondaryColor && HEX.test(brand.secondaryColor)) {
      next.secondary = brand.secondaryColor;
      locked = true;
    }
    if (brand.accentColor && HEX.test(brand.accentColor)) {
      next.accent = brand.accentColor;
      locked = true;
    }
  }
  // A font the owner explicitly chose is a typed decision, not a palette, so
  // it survives a restyle unless they also asked for new type.
  if (brand.font && brand.font.trim().length > 1) {
    next.font = brand.font.trim().slice(0, 60);
    next.fontNote = "chosen by you";
    locked = true;
  }
  return { direction: next, locked };
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
    /** The owner's style, colour and font choices, made before composing. */
    brand?: BrandPreference | null;
  },
): Promise<ComposedSitePlan | null> {
  const { builderAiAvailable } = await import("@/lib/ai/availability");
  if (!builderAiAvailable()) return null;
  if (!visiblePages(context).length) return null;

  const brand = options.brand ?? null;
  const { brandLockMode, brandLockNote } = await import("./brand-lock");
  const lockMode = brandLockMode(options.instruction);
  // Each request draws a fresh set of candidate identities, so the same
  // business asking twice is never handed the same look twice.
  const refresh = hashText(`${options.instruction}|${new Date().toISOString().slice(0, 13)}`);
  const tone = brand?.tone && brand.tone !== "any" ? brand.tone : undefined;
  const chosen = brand?.directionId
    ? DESIGN_DIRECTIONS.find((entry) => entry.id === brand.directionId)
    : undefined;
  const directions = recommendDirections({
    businessName: context.business.name,
    industry: context.business.industry,
    services: context.business.services,
    city: context.business.city,
    currentFont: brand?.font ?? context.business.fontPreference,
    count: 8,
    refresh,
    ...(tone ? { tone } : {}),
  });
  const candidates = chosen
    ? [chosen, ...directions.filter((entry) => entry.id !== chosen.id)]
    : directions;

  const userBrief = `OWNER'S REQUEST (context only — do not write copy):\n${options.instruction}\n\n${
    chosen
      ? `The owner already chose the look "${chosen.name}" (id ${chosen.id}). Use that directionId.\n\n`
      : ""
  }WORKSPACE:\n${brief(context, candidates)}`;

  try {
    // MULTI-MODEL FIRST. Several verified free models independently propose a
    // direction and a section order; identical proposals are one vote each and
    // the proposal the most models arrived at wins. Every proposal is validated
    // against the real workspace first, so a consensus can only ever be reached
    // between answers that were already safe.
    const ensembleProof = await composeByEnsemble(context, candidates, userBrief, options);
    const proposal =
      ensembleProof?.winner ??
      (await composeBySingleModel(context, candidates, userBrief, options));
    if (!proposal) return null;
    const ensembleNotes = [
      ...(ensembleProof ? [proofSummaryLine(ensembleProof)] : []),
      brandLockNote(lockMode),
    ];

    // The colours the design team chose are used exactly as chosen. Nothing
    // shifts them afterwards, so what the models decide is what the site shows.
    const personalised: DesignDirection = chosen ?? proposal.direction;

    // The owner's own choices are final for ordinary edits; a request that asks
    // for a new look installs the chosen palette instead.
    const branded = applyBrandPreference(personalised, brand, lockMode);
    const composed = composeActions(
      context,
      { direction: branded.direction, pages: proposal.pages },
      options.cap ?? 40,
    );
    if (!composed.actions.length) return null;

    const { directionTone } = await import("@/lib/design-directions");
    return {
      actions: composed.actions,
      notes: [...composed.notes, ...ensembleNotes],
      directionId: branded.direction.id,
      because: proposal.because,
      preview: {
        styleName: branded.direction.name,
        mood: branded.direction.mood,
        tone: directionTone(branded.direction),
        font: branded.direction.font,
        fontNote: branded.direction.fontNote,
        colors: {
          primary: branded.direction.primary,
          secondary: branded.direction.secondary,
          accent: branded.direction.accent,
        },
        because: proposal.because,
        pages: composed.pages,
        brandLocked: branded.locked,
      },
    };
  } catch {
    // Free provider unavailable, rate limited, resting or unparseable: the
    // deterministic plan already covers this request.
    return null;
  }
}

/** Small stable hash, used only to vary the candidate set per request. */
function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100000;
}


/* --------------------------- multi-model composition ----------------------- */

type ValidatedProposal = { direction: DesignDirection; pages: PageProposal[]; because: string };

type ComposeOptions = {
  instruction: string;
  organizationId?: string | null;
  userId?: string | null;
};

/**
 * Every specialist seat that can judge structure and look-and-feel. The whole
 * agency sits on a composition now, not just the design seats, so accessibility,
 * mobile, fact protection and QA opinions shape the layout before it is voted
 * on. Lanes whose capability no verified free model covers simply drop out.
 */
const COMPOSITION_LANES = [
  "architect",
  "frontend",
  "uiux",
  "visual",
  "brand",
  "cro",
  "seo",
  "accessibility",
  "mobile",
  "performance",
  "copy",
  "facts",
  "navigation",
  "qa",
  "regression",
  "critic",
  "synthesizer",
] as const;

/**
 * Asks every compatible verified free model — across every configured free
 * provider — to compose this site, then takes the consensus. Each answer is
 * validated against the real workspace before it can vote, so an invalid or
 * fact-inventing answer is discarded rather than argued with.
 *
 * Returns null when no free model is reachable, and the single-model path (and
 * ultimately the deterministic planner) still stands.
 */
async function composeByEnsemble(
  context: AgentContext,
  candidates: DesignDirection[],
  userBrief: string,
  options: ComposeOptions,
) {
  try {
    const { ensembleModeFor, runEnsemble } = await import("@/lib/ai/ensemble.server");
    const proof = await runEnsemble<ValidatedProposal>(
      {
        task: "site.compose",
        organizationId: options.organizationId ?? null,
        userId: options.userId ?? null,
      },
      {
        mode: ensembleModeFor(options.instruction),
        lanes: [...COMPOSITION_LANES],
        // The owner is waiting. Once three models have independently agreed on
        // the same look and page order, that is the decision — the rest of the
        // pool repeating it only adds waiting time.
        settleWhenAgreed: 2,
        // Soft settle: as soon as three seats have produced a valid, fact-checked
        // proposal and 10s have passed, decide on those instead of waiting for
        // the whole pool. Full agreement still settles instantly.
        softSettleAfterMs: 10_000,
        softSettleMinValid: 3,
        deadlineMs: 30_000,
        timeoutMsPerCall: 15_000,
        role: "design",
        prompt: ({ lane }) => [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `YOUR SEAT ON THE TEAM: ${lane.title}. Judge this site from that seat.\n\n${userBrief}`,
          },
        ],
        // The existing validator is the gate: unknown ids, banned section kinds
        // and fact-gated blocks without the facts are all rejected here.
        parse: ({ data }) => parseProposal(data, context, candidates),
        consensusKey: (value) =>
          `${value.direction.id}|${value.pages
            .map((page) => `${page.pageId}:${page.order.join(",")}`)
            .sort()
            .join("|")}`,
      },
    );
    return proof.verdict === "PASS" ? proof : null;
  } catch {
    return null;
  }
}

function proofSummaryLine(proof: { mode: string; attempted: unknown[]; providers: string[]; succeeded: number; failed: number; distinct: number; agreement: number }) {
  return `Composed by ${proof.succeeded} of ${proof.attempted.length} free models across ${proof.providers.length} provider(s); ${proof.agreement} agreed on this layout (${proof.distinct} distinct proposals, ${proof.failed} did not answer).`;
}

/** The original single-call path, kept as the ensemble's backstop. */
async function composeBySingleModel(
  context: AgentContext,
  candidates: DesignDirection[],
  userBrief: string,
  options: ComposeOptions,
): Promise<ValidatedProposal | null> {
  const { generateStructuredOutput } = await import("@/lib/ai/router.server");
  const result = await generateStructuredOutput(
    {
      task: "site.compose",
      organizationId: options.organizationId ?? null,
      userId: options.userId ?? null,
    },
    {
      // Look-and-feel and page composition are creative judgement, so this
      // runs on the strongest free model available, not the cheapest.
      role: "design",
      json: true,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userBrief },
      ],
    },
  );
  return parseProposal(result.data, context, candidates);
}
