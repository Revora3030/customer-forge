/**
 * The collective's contribution to a first build.
 *
 * Three passes, in order, each through the same credential gate, monthly cap
 * and usage ledger as every other paid call:
 *
 *  1. Sol proposes stronger wording for the page the deterministic engine
 *     already wrote — headline, introduction, story, service wording, answers.
 *  2. Terra reviews Sol's proposal adversarially and approves field by field.
 *  3. Luna tightens the search and sharing wording only.
 *
 * Nothing a model returns is trusted: every field passes the fact-locked gate in
 * `collective-copy.ts` before it can reach the page. When the paid lane is off,
 * unavailable, out of budget, refuses, or answers in the wrong shape, this
 * returns the deterministic copy completely unchanged and says so — the build
 * never depends on it.
 */
import { callCollective } from "@/lib/ai/luna.server";
import type { DnaFacts } from "@/lib/business-dna";
import { formatLocality } from "@/lib/locality";
import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief } from "@/lib/site-brief";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import {
  approvableFields,
  mergeRefinement,
  parseRefinement,
  parseReview,
  reviewRefinement,
  type RefinementRejection,
} from "@/lib/builder/collective-copy";

export type CollectivePassRecord = {
  tier: "sol" | "terra" | "luna";
  purpose: string;
  model: string | null;
  used: boolean;
  /** Plain-language reason when a pass contributed nothing. */
  skipped: string | null;
  costMicrocents: number;
  acceptedFields: string[];
  rejected: RefinementRejection[];
};

export type CollectiveFirstBuild = {
  copy: SiteCopy;
  /** True only when at least one model field survived the fact gate. */
  changed: boolean;
  passes: CollectivePassRecord[];
  totalCostMicrocents: number;
};

const RULES = [
  "You improve wording for a small business website.",
  "You may ONLY rephrase facts already given to you.",
  "Never invent or imply: prices, phone numbers, email addresses, years in business,",
  "review counts, star ratings, awards, certifications, guarantees, licences, staff numbers,",
  "response times, service areas or results.",
  "Never rename or reorder the business's services, and never add a new question.",
  "Write plainly, in the customer's language, no marketing clichés, no emoji.",
  "Answer with a single JSON object and nothing else.",
].join(" ");

function factSheet(facts: DnaFacts, brief: SiteBrief, creative: FirstBuildCreativeDirection) {
  return JSON.stringify(
    {
      business: facts.businessName ?? null,
      industry: facts.industry ?? null,
      description: facts.description ?? null,
      location: formatLocality(facts.city, facts.region) || null,
      serviceArea: facts.serviceArea ?? null,
      services: facts.services ?? [],
      hasPublishedPrices: Boolean(facts.hasPrices),
      hasTestimonials: (facts.testimonialCount ?? 0) > 0,
      audience: creative.audience,
      buyerGoal: brief.buyerGoal,
      primaryAction: brief.primaryAction,
      objections: creative.industry.objections,
      mustAvoid: creative.industry.avoid,
      unknownFacts: creative.unknowns,
    },
    null,
    2,
  );
}

function record(
  tier: CollectivePassRecord["tier"],
  purpose: string,
  partial: Partial<CollectivePassRecord>,
): CollectivePassRecord {
  return {
    tier,
    purpose,
    model: null,
    used: false,
    skipped: null,
    costMicrocents: 0,
    acceptedFields: [],
    rejected: [],
    ...partial,
  };
}

export async function refineFirstBuildWithCollective(input: {
  organizationId: string;
  facts: DnaFacts;
  brief: SiteBrief;
  copy: SiteCopy;
  creative: FirstBuildCreativeDirection;
  signal?: AbortSignal;
}): Promise<CollectiveFirstBuild> {
  const passes: CollectivePassRecord[] = [];
  const sheet = factSheet(input.facts, input.brief, input.creative);
  let copy = input.copy;
  let changed = false;

  /* -------------------------------- 1. Sol -------------------------------- */
  const solCall = await callCollective({
    purpose: "content_strategy",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 2400,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are the master content strategist for a first build.`,
    user: [
      "FACTS (the only truth you may use):",
      sheet,
      "",
      "CURRENT WORDING (written by a deterministic engine):",
      JSON.stringify(
        {
          heroHeadline: input.copy.heroHeadline,
          heroSubheadline: input.copy.heroSubheadline,
          intro: input.copy.intro,
          about: input.copy.about,
          areaCopy: input.copy.areaCopy,
          benefits: input.copy.benefits,
          serviceCards: input.copy.serviceCards,
          faqs: input.copy.faqs,
        },
        null,
        2,
      ),
      "",
      "Return JSON with any of these keys you can genuinely improve:",
      "heroHeadline, heroSubheadline, intro, about, areaCopy, benefits (array of strings),",
      "serviceCards (array of {name, copy} — names exactly as given, same order),",
      "faqs (array of {question, answer} — questions exactly as given).",
      "Omit a key rather than weaken it. Do not add keys.",
    ].join("\n"),
  });

  let solProposal: Record<string, unknown> | null = null;
  if (!solCall.ok) {
    passes.push(
      record(solCall.wanted, "content_strategy", {
        skipped: solCall.detail ?? solCall.reason,
      }),
    );
  } else {
    solProposal = parseRefinement(solCall.text);
    passes.push(
      record(solCall.tier, "content_strategy", {
        model: solCall.model,
        used: solProposal !== null,
        costMicrocents: solCall.costMicrocents,
        skipped: solProposal === null ? "the answer was not in the agreed shape" : null,
        acceptedFields: approvableFields(solProposal),
      }),
    );
  }

  /* ------------------------------- 2. Terra ------------------------------- */
  let approvedFields: string[] | null = null;
  if (solProposal) {
    const terraCall = await callCollective({
      purpose: "specialist_review",
      complexity: "medium",
      organizationId: input.organizationId,
      maxOutputTokens: 900,
      ...(input.signal ? { signal: input.signal } : {}),
      system: `${RULES} You are an adversarial reviewer. Approve a field only if it is truthful against the facts, clearer than the current wording, and free of invented detail.`,
      user: [
        "FACTS:",
        sheet,
        "",
        "CURRENT WORDING:",
        JSON.stringify(input.copy, null, 2),
        "",
        "PROPOSED WORDING:",
        JSON.stringify(solProposal, null, 2),
        "",
        'Return JSON: {"approvedFields": ["..."], "rejected": [{"field": "...", "reason": "..."}]}',
      ].join("\n"),
    });
    if (!terraCall.ok) {
      passes.push(
        record(terraCall.wanted, "specialist_review", {
          skipped: terraCall.detail ?? terraCall.reason,
        }),
      );
    } else {
      const parsed = parseReview(terraCall.text);
      approvedFields = parsed ? parsed.approvedFields : null;
      passes.push(
        record(terraCall.tier, "specialist_review", {
          model: terraCall.model,
          used: parsed !== null,
          costMicrocents: terraCall.costMicrocents,
          skipped: parsed === null ? "the review was not in the agreed shape" : null,
          acceptedFields: parsed?.approvedFields ?? [],
          rejected: parsed?.notes ?? [],
        }),
      );
      // A review that could not be read must not silently approve everything.
      if (parsed === null) approvedFields = [];
    }

    const gated = reviewRefinement({
      proposal: solProposal,
      facts: input.facts,
      baseline: copy,
      approvedFields,
    });
    const acceptedKeys = Object.keys(gated.accepted);
    if (acceptedKeys.length) {
      copy = mergeRefinement(copy, gated.accepted);
      changed = true;
    }
    const solPass = passes.find((pass) => pass.purpose === "content_strategy");
    if (solPass) {
      solPass.acceptedFields = acceptedKeys;
      solPass.rejected = gated.rejected;
      solPass.used = acceptedKeys.length > 0;
      if (!acceptedKeys.length && !solPass.skipped)
        solPass.skipped = "every proposed field was refused by the fact check";
    }
  }

  /* -------------------------------- 3. Luna ------------------------------- */
  const lunaCall = await callCollective({
    purpose: "metadata",
    complexity: "low",
    organizationId: input.organizationId,
    maxOutputTokens: 500,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You write search and sharing wording.`,
    user: [
      "FACTS:",
      sheet,
      "",
      "CURRENT:",
      JSON.stringify(
        {
          metaTitle: copy.metaTitle,
          metaDescription: copy.metaDescription,
          ogTitle: copy.ogTitle,
          ogDescription: copy.ogDescription,
        },
        null,
        2,
      ),
      "",
      "Return JSON with metaTitle (max 60 characters), metaDescription (max 155),",
      "ogTitle (max 70) and ogDescription (max 200). Omit any you cannot improve.",
    ].join("\n"),
  });

  if (!lunaCall.ok) {
    passes.push(record(lunaCall.wanted, "metadata", { skipped: lunaCall.detail ?? lunaCall.reason }));
  } else {
    const proposal = parseRefinement(lunaCall.text);
    const gated = reviewRefinement({ proposal, facts: input.facts, baseline: copy });
    const metaOnly = {
      ...(gated.accepted.metaTitle ? { metaTitle: gated.accepted.metaTitle } : {}),
      ...(gated.accepted.metaDescription
        ? { metaDescription: gated.accepted.metaDescription }
        : {}),
      ...(gated.accepted.ogTitle ? { ogTitle: gated.accepted.ogTitle } : {}),
      ...(gated.accepted.ogDescription ? { ogDescription: gated.accepted.ogDescription } : {}),
    };
    const acceptedKeys = Object.keys(metaOnly);
    if (acceptedKeys.length) {
      copy = mergeRefinement(copy, metaOnly);
      changed = true;
    }
    passes.push(
      record(lunaCall.tier, "metadata", {
        model: lunaCall.model,
        used: acceptedKeys.length > 0,
        costMicrocents: lunaCall.costMicrocents,
        skipped: acceptedKeys.length
          ? null
          : proposal === null
            ? "the answer was not in the agreed shape"
            : "nothing improved on the deterministic wording",
        acceptedFields: acceptedKeys,
        rejected: gated.rejected,
      }),
    );
  }

  return {
    copy,
    changed,
    passes,
    totalCostMicrocents: passes.reduce((sum, pass) => sum + pass.costMicrocents, 0),
  };
}
