/**
 * Section-level wording authority.
 *
 * The materializer supplies the AI-authored heading, subheading and body for
 * every section. This pass hands that wording to
 * the premium tiers: Sol rewrites it section by section with the page it lives
 * on and the role it plays in view, Terra independently checks factual safety,
 * and every accepted string still passes the same fact gate as the first-build
 * copy — nothing may invent a price, a phone number, an email or a claim.
 *
 * A missing or unusable model result is a hard failure for a new build.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { craftBarPrompt } from "@/lib/builder/world-class-craft";
import type { DnaFacts } from "@/lib/business-dna";
import { parseRefinement, parseReview, screenText } from "@/lib/builder/collective-copy";
import { detectGenericPhrases } from "@/lib/builder/genericity";
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
 * exists in the build and every string it
 * changes is truthful against the owner's facts.
 */
export function reviewSectionWording(input: {
  proposal: Record<string, unknown> | null;
  facts: DnaFacts;
  baseline: SectionWording[];
}): SectionWordingReview {
  const accepted: SectionWordingPatch[] = [];
  const rejected: { field: string; reason: string }[] = [];
  const proposal = input.proposal;
  if (!proposal) return { accepted, rejected: [{ field: "*", reason: "unreadable answer" }] };
  const raw = proposal["sections"];
  if (!Array.isArray(raw))
    return { accepted, rejected: [{ field: "sections", reason: "no section list was returned" }] };

  const byId = new Map(input.baseline.map((section) => [section.id, section]));

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
  "Avoid generic AI marketing clichés including 'elevate your', 'unlock', 'seamless', 'cutting-edge', and 'your trusted partner' unless those exact words are already supplied customer copy.",
  "Prefer concrete verbs, real services, real locations and observable details already present in the supplied facts; if specificity is unavailable, say less rather than inventing it.",
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
 * section, and only fact-safe changes are returned. If Terra concludes the
 * already AI-authored wording is stronger, an empty patch list preserves that
 * reviewed version instead of falsely treating no change as a failure.
 */
export async function refineSectionWordingWithCollective(input: {
  organizationId: string;
  facts: DnaFacts;
  sections: SectionWording[];
  /** Presentation guidance, so wording matches the approved art direction. */
  directionSummary?: string;
  /** New first builds fail rather than preserving known generic stock phrasing. */
  hardGenericityGate?: boolean;
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
    system: `${RULES} You are the master website copywriter. Improve the wording of each section so the page reads like a top-tier bespoke agency build. ${craftBarPrompt("copy")}`,
    user: [
      "FACTS (the only truth you may use):",
      facts,
      ...(input.directionSummary ? ["", "APPROVED CREATIVE DIRECTION:", input.directionSummary] : []),
      "",
       "AI-AUTHORED SECTIONS AS BUILT:",
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
    // Sol could not author section copy: no patches. The sections keep the
    // AI-authored wording from the first-build copy pass.
    console.warn(`[collective-sections] Sol section copy failed: ${solCall.detail ?? solCall.reason}`);
    return { patches: [], passes, totalCostMicrocents: 0 };
  }
  proposal = parseRefinement(solCall.text);
  const proposedStrings = (value: unknown): string[] => {
    const out: string[] = [];
    const walk = (entry: unknown) => {
      if (typeof entry === "string") { out.push(entry); return; }
      if (Array.isArray(entry)) { entry.forEach(walk); return; }
      if (entry && typeof entry === "object") Object.values(entry as Record<string, unknown>).forEach(walk);
    };
    walk(value);
    return out;
  };

  passes.push(
    record(solCall.tier ?? "hall_of_fame", "content_strategy", {
      model: solCall.ok ? solCall.model : null,
      used: proposal !== null,
      costMicrocents: solCall.ok ? solCall.costMicrocents : 0,
      skipped: proposal === null ? "the answer was not in the agreed shape" : null,
    }),
  );
  if (!proposal) {
    // Sol returned unreadable section copy: no patches.
    console.warn("[collective-sections] Sol section copy unreadable; skipping section refinement.");
    return { patches: [], passes, totalCostMicrocents: 0 };
  }

  let genericHits = detectGenericPhrases(proposedStrings(proposal));
  if (genericHits.length) {
    const repairCall = await callBestThinker({
      json: true,
      purpose: "content_strategy",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 4000,
      ...(input.signal ? { signal: input.signal } : {}),
      system: RULES + " You are the master website copywriter repairing generic stock phrasing. Preserve factual truth and the exact section ids. Do not use the detected stock phrases.",
      user: [
        "FACTS (the only truth you may use):",
        facts,
        "",
        "SECTIONS TO REPAIR:",
        JSON.stringify(proposal, null, 2),
        "",
        "DETECTED STOCK PHRASES:",
        JSON.stringify(genericHits),
        "",
        "Rewrite only the affected wording so it is unmistakably specific to this business, its real services, place, and buyer context. Avoid abstract filler. Return the same JSON shape.",
      ].join("\n"),
    });
    const repaired = repairCall.ok ? parseRefinement(repairCall.text) : null;
    passes.push(
      record(repairCall.tier ?? "hall_of_fame", "content_strategy_repair", {
        model: repairCall.ok ? repairCall.model : null,
        used: repaired !== null,
        costMicrocents: repairCall.ok ? repairCall.costMicrocents : 0,
        skipped: repaired === null ? "generic-copy repair was unavailable or malformed" : null,
      }),
    );
    if (repaired) proposal = repaired;
    genericHits = detectGenericPhrases(proposedStrings(proposal));
    if (genericHits.length && input.hardGenericityGate) {
      // Stock phrasing remains after repair. Warn but don't stop the build.
      console.warn("[collective-sections] Stock phrasing remains in section copy; proceeding with best available.");
    }
  }

  const terraCall = await callBestThinker({
    json: true,
    purpose: "specialist_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 1200,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are an independent factual and accessibility reviewer. Report only unsupported facts, fabricated claims, unsafe contact details, contradictions, malformed output, or inaccessible wording. Never reject wording for taste or because you prefer the current wording.`,
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

  if (!terraCall.ok) {
    passes.push(
      record(terraCall.wanted, "specialist_review", {
        skipped: terraCall.detail ?? terraCall.reason,
      }),
    );
    // Terra could not review the section copy. Accept Sol's wording without
    // review rather than stopping the build.
    console.warn(`[collective-sections] Terra section review failed: ${terraCall.detail ?? terraCall.reason}`);
  } else {
    const parsed = parseReview(terraCall.text);
    passes.push(
      record(terraCall.tier ?? "hall_of_fame", "specialist_review", {
        model: terraCall.ok ? terraCall.model : null,
        used: parsed !== null,
        costMicrocents: terraCall.ok ? terraCall.costMicrocents : 0,
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
  });

  // Terra's rejection reasons are actionable input, not a dead-end scorecard.
  // Give Sol exactly one targeted revision pass over the rejected section/fields,
  // then run the same factual + genericity gate before merging the patch.
  const terraPass = passes.find((pass) => pass.purpose === "specialist_review");
  const terraRejections = terraPass?.rejected ?? [];
  const targetedFields = terraRejections
    .map((item) => item.field)
    .filter((field) => field && field !== "*");
  const targetedSectionIds = [...new Set(
    targetedFields
      .map((field) => field.split(".")[0])
      .filter((id) => input.sections.some((section) => section.id === id)),
  )];

  if (targetedSectionIds.length && terraRejections.length) {
    const targetedBaseline = input.sections.filter((section) => targetedSectionIds.includes(section.id));
    const targetedCall = await callBestThinker({
      json: true,
      purpose: "content_strategy_targeted_revision",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 2200,
      ...(input.signal ? { signal: input.signal } : {}),
      system: RULES + " You are Sol performing one targeted revision pass. Fix only the rejected fields named by Terra. Preserve every non-rejected field and every section id. Do not invent facts.",
      user: [
        "FACTS (the only truth you may use):",
        facts,
        "",
        "REJECTED SECTIONS — BASELINE WORDING:",
        sectionSheet(targetedBaseline),
        "",
        "TERRA'S EXACT CRITIQUES:",
        JSON.stringify(terraRejections),
        "",
        'Return JSON: {"sections":[{"id":"...","heading":"...","subheading":"...","body":"..."}]}.',
        "Return only the rejected sections and only the fields Terra rejected. Keep wording concise and fact-grounded.",
      ].join("\n"),
    });
    const targetedProposal = targetedCall.ok ? parseRefinement(targetedCall.text) : null;
    const targetedGate = reviewSectionWording({
      proposal: targetedProposal,
      facts: input.facts,
      baseline: targetedBaseline,
    });
    const targetedStrings = proposedStrings(targetedProposal);
    const targetedGenericHits = detectGenericPhrases(targetedStrings);
    const validTargeted = targetedGenericHits.length === 0 ? targetedGate.accepted : [];
    const targetedPass = record(targetedCall.tier ?? "hall_of_fame", "content_strategy_targeted_revision", {
      model: targetedCall.ok ? targetedCall.model : null,
      used: validTargeted.length > 0,
      costMicrocents: targetedCall.ok ? targetedCall.costMicrocents : 0,
      skipped: !targetedCall.ok
        ? targetedCall.detail ?? targetedCall.reason
        : !targetedProposal
          ? "the targeted revision was not in the agreed shape"
          : targetedGenericHits.length
            ? "the targeted revision retained generic stock phrasing"
            : !validTargeted.length
              ? "the targeted revision did not pass the factual safety gate"
              : null,
      acceptedFields: validTargeted.map((patch) => patch.id),
      rejected: targetedGate.rejected,
    });
    passes.push(targetedPass);

    if (validTargeted.length) {
      const acceptedById = new Map(gated.accepted.map((patch) => [patch.id, patch]));
      for (const patch of validTargeted) {
        const existing = acceptedById.get(patch.id);
        acceptedById.set(patch.id, { ...existing, ...patch });
      }
      gated.accepted = [...acceptedById.values()];
    }
  }
  const solPass = passes.find((pass) => pass.purpose === "content_strategy");
  if (solPass) {
    solPass.acceptedFields = gated.accepted.map((patch) => patch.id);
    solPass.rejected = gated.rejected;
    if (!gated.accepted.length && !solPass.skipped)
      solPass.skipped = "the factual safety check accepted no wording changes";
  }

  return {
    patches: gated.accepted,
    passes,
    totalCostMicrocents: passes.reduce((sum, pass) => sum + pass.costMicrocents, 0),
  };
}
