/**
 * Section-level wording authority.
 *
 * The deterministic renderer supplies a *fillable* heading, subheading and body
 * for every section so a build is never blank. This pass hands that wording to
 * the premium tiers: Sol rewrites it section by section with the page it lives
 * on and the role it plays in view, Terra approves each section individually,
 * and every accepted string still passes the same fact gate as the first-build
 * copy — nothing may invent a price, a phone number, an email or a claim.
 *
 * When the paid lane is off, out of budget, unavailable, refused, or answers in
 * the wrong shape, the deterministic wording survives untouched.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import type { DnaFacts } from "@/lib/business-dna";
import { parseRefinement, parseReview, screenText } from "@/lib/builder/collective-copy";
import type { CollectivePassRecord } from "@/lib/builder/collective-first-build.server";

/** One section as stored, reduced to the text a model may improve. */
export type SectionWording = {
  id: string;
  /** Page slug the section belongs to, for context only. */
  page: string;
  /** Renderer role, e.g. `hero`, `services`, `cta`. Never changed by a model. */
  kind: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
};

export type SectionWordingPatch = {
  id: string;
  heading?: string;
  subheading?: string;
  body?: string;
};

export type SectionWordingReview = {
  accepted: SectionWordingPatch[];
  rejected: { field: string; reason: string }[];
};

const LIMITS = { heading: 120, subheading: 240, body: 900 } as const;

const trimmed = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length ? value.trim() : null;

/**
 * Validates a section-wording proposal. A section is only patched when it
 * exists in the build, was approved by the review pass, and every string it
 * changes is truthful against the owner's facts.
 */
export function reviewSectionWording(input: {
  proposal: Record<string, unknown> | null;
  facts: DnaFacts;
  baseline: SectionWording[];
  /** Section ids the reviewer approved; when given, others are dropped. */
  approvedIds?: string[] | null;
}): SectionWordingReview {
  const accepted: SectionWordingPatch[] = [];
  const rejected: { field: string; reason: string }[] = [];
  const proposal = input.proposal;
  if (!proposal) return { accepted, rejected: [{ field: "*", reason: "unreadable answer" }] };
  const raw = proposal["sections"];
  if (!Array.isArray(raw))
    return { accepted, rejected: [{ field: "sections", reason: "no section list was returned" }] };

  const byId = new Map(input.baseline.map((section) => [section.id, section]));
  const gate = input.approvedIds ? new Set(input.approvedIds) : null;

  for (const entry of raw) {
    const id = trimmed((entry as { id?: unknown })?.id);
    if (!id) {
      rejected.push({ field: "sections", reason: "a section was returned without its id" });
      continue;
    }
    const current = byId.get(id);
    if (!current) {
      rejected.push({ field: id, reason: "a section that is not part of this build" });
      continue;
    }
    if (gate && !gate.has(id)) {
      rejected.push({ field: id, reason: "not approved by the review pass" });
      continue;
    }
    const patch: SectionWordingPatch = { id };
    let blocked = false;
    for (const field of ["heading", "subheading", "body"] as const) {
      const value = trimmed((entry as Record<string, unknown>)[field]);
      if (value === null) continue;
      if (value === current[field]) continue;
      const problem = screenText(value, input.facts, LIMITS[field]);
      if (problem) {
        rejected.push({ field: `${id}.${field}`, reason: problem });
        blocked = true;
        continue;
      }
      patch[field] = value;
    }
    const changed = patch.heading ?? patch.subheading ?? patch.body;
    if (changed === undefined) {
      if (!blocked) rejected.push({ field: id, reason: "nothing improved on the current wording" });
      continue;
    }
    accepted.push(patch);
  }
  return { accepted, rejected };
}

function sectionSheet(sections: SectionWording[]): string {
  return JSON.stringify(
    sections.map((section) => ({
      id: section.id,
      page: section.page,
      role: section.kind,
      heading: section.heading,
      subheading: section.subheading,
      body: section.body,
    })),
    null,
    2,
  );
}

const RULES = [
  "You may only rewrite wording that already describes facts supplied below.",
  "Never invent a price, phone number, email address, award, review, guarantee, years in business or result.",
  "Never rename or reorder a section, and never change its role.",
  "Write like a senior brand copywriter: specific, confident, human, no filler, no placeholder text,",
  "no repeated phrases across sections, no truncated or half-finished sentences.",
].join(" ");

export type SectionWordingOutcome = {
  patches: SectionWordingPatch[];
  passes: CollectivePassRecord[];
  totalCostMicrocents: number;
};

function record(
  tier: CollectivePassRecord["tier"],
  purpose: CollectivePassRecord["purpose"],
  extra: Partial<CollectivePassRecord>,
): CollectivePassRecord {
  return {
    tier,
    purpose,
    model: null,
    used: false,
    costMicrocents: 0,
    skipped: null,
    acceptedFields: [],
    rejected: [],
    ...extra,
  } as CollectivePassRecord;
}

/**
 * Sol rewrites every section's wording in one pass, Terra approves section by
 * section, and only fact-safe changes are returned. An empty patch list means
 * the deterministic wording stands.
 */
export async function refineSectionWordingWithCollective(input: {
  organizationId: string;
  facts: DnaFacts;
  sections: SectionWording[];
  /** Presentation guidance, so wording matches the approved art direction. */
  directionSummary?: string;
  signal?: AbortSignal;
}): Promise<SectionWordingOutcome> {
  const passes: CollectivePassRecord[] = [];
  if (!input.sections.length) return { patches: [], passes, totalCostMicrocents: 0 };

  const facts = JSON.stringify(input.facts, null, 2);
  const sheet = sectionSheet(input.sections);

  const solCall = await callBestThinker({
    json: true,
    purpose: "content_strategy",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 4000,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are the master website copywriter. Improve the wording of each section so the page reads like a top-tier bespoke agency build.`,
    user: [
      "FACTS (the only truth you may use):",
      facts,
      ...(input.directionSummary ? ["", "APPROVED CREATIVE DIRECTION:", input.directionSummary] : []),
      "",
      "SECTIONS AS BUILT (wording written by a deterministic renderer):",
      sheet,
      "",
      'Return JSON: {"sections":[{"id":"...","heading":"...","subheading":"...","body":"..."}]}',
      `Limits: heading ${LIMITS.heading} characters, subheading ${LIMITS.subheading}, body ${LIMITS.body}.`,
      "Include a section only when you genuinely improve it. Omit any field you cannot improve.",
      "Keep every id exactly as given.",
    ].join("\n"),
  });

  let proposal: Record<string, unknown> | null = null;
  if (!solCall.ok) {
    passes.push(
      record(solCall.wanted, "content_strategy", { skipped: solCall.detail ?? solCall.reason }),
    );
    return { patches: [], passes, totalCostMicrocents: 0 };
  }
  proposal = parseRefinement(solCall.text);
  passes.push(
    record(solCall.tier ?? "hall_of_fame", "content_strategy", {
      model: solCall.model,
      used: proposal !== null,
      costMicrocents: solCall.costMicrocents,
      skipped: proposal === null ? "the answer was not in the agreed shape" : null,
    }),
  );
  if (!proposal)
    return {
      patches: [],
      passes,
      totalCostMicrocents: passes.reduce((sum, pass) => sum + pass.costMicrocents, 0),
    };

  const terraCall = await callBestThinker({
    json: true,
    purpose: "specialist_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 1200,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are an adversarial reviewer. Approve a section only when the new wording is truthful, clearer and stronger than the current wording.`,
    user: [
      "FACTS:",
      facts,
      "",
      "SECTIONS AS BUILT:",
      sheet,
      "",
      "PROPOSED WORDING:",
      JSON.stringify(proposal, null, 2),
      "",
      '{"approvedFields": ["<section id>", "..."], "rejected": [{"field": "<section id>", "reason": "..."}]}',
    ].join("\n"),
  });

  let approvedIds: string[] | null = null;
  if (!terraCall.ok) {
    passes.push(
      record(terraCall.wanted, "specialist_review", {
        skipped: terraCall.detail ?? terraCall.reason,
      }),
    );
  } else {
    const parsed = parseReview(terraCall.text);
    approvedIds = parsed ? parsed.approvedFields : [];
    passes.push(
      record(terraCall.tier ?? "hall_of_fame", "specialist_review", {
        model: terraCall.model,
        used: parsed !== null,
        costMicrocents: terraCall.costMicrocents,
        skipped: parsed === null ? "the review was not in the agreed shape" : null,
        acceptedFields: parsed?.approvedFields ?? [],
        rejected: parsed?.notes ?? [],
      }),
    );
  }

  const gated = reviewSectionWording({
    proposal,
    facts: input.facts,
    baseline: input.sections,
    approvedIds,
  });
  const solPass = passes.find((pass) => pass.purpose === "content_strategy");
  if (solPass) {
    solPass.acceptedFields = gated.accepted.map((patch) => patch.id);
    solPass.rejected = gated.rejected;
    solPass.used = gated.accepted.length > 0;
    if (!gated.accepted.length && !solPass.skipped)
      solPass.skipped = "every proposed section was refused by the fact check";
  }

  return {
    patches: gated.accepted,
    passes,
    totalCostMicrocents: passes.reduce((sum, pass) => sum + pass.costMicrocents, 0),
  };
}
