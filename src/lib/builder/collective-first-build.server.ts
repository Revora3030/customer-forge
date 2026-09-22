/**
 * The collective's contribution to a first build.
 *
 * Four passes, in order, each through the same credential gate, monthly cap
 * and usage ledger as every other paid call:
 *
 *  1. Sol proposes a bounded creative direction that can change the real
 *     fingerprint, brief, image briefs and page composition.
 *  2. Terra reviews Sol's creative proposal adversarially, field by field.
 *  3. Sol proposes stronger wording for the deterministic copy.
 *  4. Terra reviews Sol's copy proposal, then Luna tightens metadata only.
 *
 * Nothing a model returns is trusted: creative choices are mapped onto closed
 * renderer vocabularies and copy passes through the fact gate before it can
 * reach the page. When the paid lane is off, unavailable, out of budget,
 * refuses, or answers in the wrong shape, this returns the deterministic build
 * completely unchanged and says so — the build never depends on paid AI.
 */
import { callCollective } from "@/lib/ai/luna.server";
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import { formatLocality } from "@/lib/locality";
import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief } from "@/lib/site-brief";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import type { CreativeBrief } from "@/lib/builder/creative-brief";
import {
  BACKGROUND_SYSTEMS,
  CARD_SYSTEMS,
  COLOR_SYSTEMS,
  CTA_SYSTEMS,
  DESIGN_FAMILIES,
  FAQ_LAYOUTS,
  FOOTER_SYSTEMS,
  GALLERY_LAYOUTS,
  HERO_COMPOSITIONS,
  IMAGE_TREATMENTS,
  MOTION_PATTERNS,
  NAV_SYSTEMS,
  PAGE_SHELLS,
  PRICING_LAYOUTS,
  PROOF_LAYOUTS,
  SECTION_COMPOSITIONS,
  SECTION_TRANSITIONS,
  STATS_LAYOUTS,
  TIMELINE_LAYOUTS,
  TYPE_SYSTEMS,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import { alignCreativeBriefToFingerprint } from "@/lib/builder/screenshot-reference";
import {
  approvableFields,
  mergeRefinement,
  parseRefinement,
  parseReview,
  reviewRefinement,
  type RefinementRejection,
} from "@/lib/builder/collective-copy";
import { creativeQualityPrompt } from "@/lib/builder/creative-quality-matrix";

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
  creative: FirstBuildCreativeDirection;
  /** True only when at least one model field survived a safety gate. */
  changed: boolean;
  creativeChanged: boolean;
  copyChanged: boolean;
  passes: CollectivePassRecord[];
  totalCostMicrocents: number;
};

type CreativeFingerprintPatch = Partial<
  Pick<
    DesignFingerprint,
    | "family"
    | "heroComposition"
    | "backgroundSystem"
    | "sectionRhythm"
    | "navSystem"
    | "ctaSystem"
    | "cardSystem"
    | "proofLayout"
    | "pricingLayout"
    | "faqLayout"
    | "galleryLayout"
    | "statsLayout"
    | "timelineLayout"
    | "footerSystem"
    | "typeSystem"
    | "colorSystem"
    | "sectionTransition"
    | "pageShell"
    | "imageTreatment"
    | "motionPattern"
    | "motionLevel"
    | "density"
  >
>;

type CreativeBriefPatch = Partial<
  Pick<
    CreativeBrief,
    | "personality"
    | "heroComposition"
    | "sectionRhythm"
    | "cardLanguage"
    | "ctaLanguage"
    | "backgroundTreatment"
    | "mobileStrategy"
    | "conversionStrategy"
    | "industryConventions"
  >
> & {
  photography?: Partial<CreativeBrief["photography"]>;
};

export type CreativeRefinement = {
  fingerprint?: CreativeFingerprintPatch;
  brief?: CreativeBriefPatch;
};

const RULES = [
  "You improve wording for a business website.",
  "You may ONLY rephrase facts already given to you.",
  "Never invent or imply: prices, phone numbers, email addresses, years in business,",
  "review counts, star ratings, awards, certifications, guarantees, licences, staff numbers,",
  "response times, service areas or results.",
  "Never rename or reorder the business's services, and never add a new question.",
  "Write plainly, in the customer's language, no marketing clichés, no emoji.",
  "Answer with a single JSON object and nothing else.",
].join(" ");

const CREATIVE_RULES = [
  "You are shaping presentation only for a first website build.",
  "Do not write visitor-facing copy, claims, testimonials, review language, guarantees, badges or proof.",
  "Do not invent prices, credentials, locations, service results, staff, response times or customer facts.",
  "Choose only from the supplied design vocabulary. Omit uncertain fields.",
  "Respect owner photos: generated images are marketing visuals, never proof of work.",
  "Return a single JSON object and nothing else.",
].join(" ");

const FINGERPRINT_FIELDS = {
  family: DESIGN_FAMILIES,
  heroComposition: HERO_COMPOSITIONS,
  backgroundSystem: BACKGROUND_SYSTEMS,
  sectionRhythm: SECTION_COMPOSITIONS,
  navSystem: NAV_SYSTEMS,
  ctaSystem: CTA_SYSTEMS,
  cardSystem: CARD_SYSTEMS,
  proofLayout: PROOF_LAYOUTS,
  pricingLayout: PRICING_LAYOUTS,
  faqLayout: FAQ_LAYOUTS,
  galleryLayout: GALLERY_LAYOUTS,
  statsLayout: STATS_LAYOUTS,
  timelineLayout: TIMELINE_LAYOUTS,
  footerSystem: FOOTER_SYSTEMS,
  typeSystem: TYPE_SYSTEMS,
  colorSystem: COLOR_SYSTEMS,
  sectionTransition: SECTION_TRANSITIONS,
  pageShell: PAGE_SHELLS,
  imageTreatment: IMAGE_TREATMENTS,
  motionPattern: MOTION_PATTERNS,
  motionLevel: ["none", "subtle", "expressive"] as const,
  density: ["compact", "balanced", "airy"] as const,
} as const;

const BRIEF_TEXT_LIMITS = {
  personality: 90,
  heroComposition: 140,
  sectionRhythm: 140,
  cardLanguage: 140,
  ctaLanguage: 140,
  backgroundTreatment: 140,
} as const;

const PHOTOGRAPHY_LIMITS = {
  language: 180,
  lighting: 120,
  environment: 120,
  treatment: 160,
} as const;

const PROOF_SHAPED_TEXT = /\b(review|testimonial|five[- ]?star|award|certified|licensed|guarantee|before\/?after|proven result|#\s?1|best in|customer logo|case study)\b/i;

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

function creativeSheet(creative: FirstBuildCreativeDirection) {
  return JSON.stringify(
    {
      currentFingerprint: creative.fingerprint,
      currentBrief: {
        archetype: creative.brief.archetype,
        personality: creative.brief.personality,
        heroComposition: creative.brief.heroComposition,
        sectionRhythm: creative.brief.sectionRhythm,
        cardLanguage: creative.brief.cardLanguage,
        ctaLanguage: creative.brief.ctaLanguage,
        backgroundTreatment: creative.brief.backgroundTreatment,
        mobileStrategy: creative.brief.mobileStrategy,
        conversionStrategy: creative.brief.conversionStrategy,
        photography: creative.brief.photography,
        imageInventory: creative.brief.imageInventory.map((item) => ({
          slot: item.slot,
          label: item.label,
          purpose: item.purpose,
          subject: item.subject,
          framing: item.framing,
          mobileCrop: item.mobileCrop,
          evidenceTag: item.evidenceTag,
        })),
        qualityMatrix: creative.brief.qualityMatrix,
      },
      imageStatus: creative.imagery.status,
      plannedShots: creative.imagery.shots.map((shot) => ({
        slot: shot.slot,
        label: shot.label,
        placement: shot.placement,
        aspect: shot.aspect,
      })),
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

const objectAt = (value: unknown, key: string): Record<string, unknown> | null => {
  const raw = (value as Record<string, unknown> | null)?.[key];
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
};

const textAt = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
};

const listAt = (value: unknown, maxItems: number, maxLength: number): string[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => textAt(item, maxLength))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);

const dottedAllowed = (gate: Set<string> | null, field: string) =>
  !gate || gate.has(field) || gate.has(field.split(".")[0] ?? field);

function visualTextProblem(text: string, facts: DnaFacts): string | null {
  if (PROOF_SHAPED_TEXT.test(text)) return "it tries to turn design guidance into unsupported proof";
  const claims = screenClaims(text, facts);
  if (claims.length) return `unsupported ${claims[0]?.reason ?? "claim"}`;
  return null;
}

export function parseCreativeProposal(text: string): Record<string, unknown> | null {
  return parseRefinement(text);
}

export function reviewCreativeProposal(input: {
  proposal: Record<string, unknown> | null;
  facts: DnaFacts;
  baseline: FirstBuildCreativeDirection;
  approvedFields?: string[] | null;
}): { accepted: CreativeRefinement; rejected: RefinementRejection[] } {
  const accepted: CreativeRefinement = {};
  const rejected: RefinementRejection[] = [];
  if (!input.proposal) return { accepted, rejected: [{ field: "creative", reason: "unreadable answer" }] };
  const gate = input.approvedFields ? new Set(input.approvedFields) : null;
  const fingerprintRaw = objectAt(input.proposal, "fingerprint");
  if (fingerprintRaw) {
    const patch: CreativeFingerprintPatch = {};
    for (const field of Object.keys(FINGERPRINT_FIELDS) as (keyof typeof FINGERPRINT_FIELDS)[]) {
      const value = textAt(fingerprintRaw[field], 60);
      const dotted = `fingerprint.${field}`;
      if (!value) continue;
      if (!dottedAllowed(gate, dotted)) {
        rejected.push({ field: dotted, reason: "not approved by the review pass" });
        continue;
      }
      if (!(FINGERPRINT_FIELDS[field] as readonly string[]).includes(value)) {
        rejected.push({ field: dotted, reason: "not in the supported design vocabulary" });
        continue;
      }
      if (value === String(input.baseline.fingerprint[field])) continue;
      (patch as Record<string, string>)[field] = value;
    }
    if (Object.keys(patch).length) accepted.fingerprint = patch;
  }

  const briefRaw = objectAt(input.proposal, "brief");
  if (briefRaw) {
    const brief: CreativeBriefPatch = {};
    for (const [field, max] of Object.entries(BRIEF_TEXT_LIMITS) as [keyof typeof BRIEF_TEXT_LIMITS, number][]) {
      const dotted = `brief.${field}`;
      const value = textAt(briefRaw[field], max);
      if (!value) continue;
      if (!dottedAllowed(gate, dotted)) {
        rejected.push({ field: dotted, reason: "not approved by the review pass" });
        continue;
      }
      const problem = visualTextProblem(value, input.facts);
      if (problem) {
        rejected.push({ field: dotted, reason: problem });
        continue;
      }
      if (value !== String(input.baseline.brief[field])) (brief as Record<string, unknown>)[field] = value;
    }
    for (const field of ["mobileStrategy", "conversionStrategy", "industryConventions"] as const) {
      const dotted = `brief.${field}`;
      const values = listAt(briefRaw[field], field === "conversionStrategy" ? 5 : 4, 140);
      if (!values.length) continue;
      if (!dottedAllowed(gate, dotted)) {
        rejected.push({ field: dotted, reason: "not approved by the review pass" });
        continue;
      }
      const problem = values.map((value) => visualTextProblem(value, input.facts)).find(Boolean);
      if (problem) {
        rejected.push({ field: dotted, reason: problem });
        continue;
      }
      (brief as Record<string, unknown>)[field] = values;
    }
    const photographyRaw = objectAt(briefRaw, "photography");
    if (photographyRaw) {
      const photography: Partial<CreativeBrief["photography"]> = {};
      for (const [field, max] of Object.entries(PHOTOGRAPHY_LIMITS) as [keyof typeof PHOTOGRAPHY_LIMITS, number][]) {
        const dotted = `brief.photography.${field}`;
        const value = textAt(photographyRaw[field], max);
        if (!value) continue;
        if (!dottedAllowed(gate, dotted)) {
          rejected.push({ field: dotted, reason: "not approved by the review pass" });
          continue;
        }
        const problem = visualTextProblem(value, input.facts);
        if (problem) {
          rejected.push({ field: dotted, reason: problem });
          continue;
        }
        photography[field] = value;
      }
      const subjects = listAt(photographyRaw["subjects"], 4, 120);
      if (subjects.length && dottedAllowed(gate, "brief.photography.subjects")) {
        const problem = subjects.map((value) => visualTextProblem(value, input.facts)).find(Boolean);
        if (problem) rejected.push({ field: "brief.photography.subjects", reason: problem });
        else photography.subjects = subjects;
      }
      if (Object.keys(photography).length) brief.photography = photography;
    }
    if (Object.keys(brief).length) accepted.brief = brief;
  }

  return { accepted, rejected };
}

export function mergeCreativeRefinement(
  creative: FirstBuildCreativeDirection,
  accepted: CreativeRefinement,
): FirstBuildCreativeDirection {
  const fingerprint: DesignFingerprint = accepted.fingerprint
    ? { ...creative.fingerprint, ...accepted.fingerprint, updatedAt: new Date().toISOString() }
    : creative.fingerprint;
  let brief = alignCreativeBriefToFingerprint(creative.brief, fingerprint);
  if (accepted.brief) {
    const nextBrief = accepted.brief;
    brief = {
      ...brief,
      ...nextBrief,
      photography: nextBrief.photography
        ? { ...brief.photography, ...nextBrief.photography }
        : brief.photography,
      mobileStrategy: nextBrief.mobileStrategy ?? brief.mobileStrategy,
      conversionStrategy: nextBrief.conversionStrategy ?? brief.conversionStrategy,
      industryConventions: nextBrief.industryConventions ?? brief.industryConventions,
    };
  }
  return {
    ...creative,
    fingerprint,
    brief,
    imagery: {
      ...creative.imagery,
      language: brief.photography.language,
      treatment: brief.photography.treatment,
    },
  };
}

function creativeApprovableFields(proposal: Record<string, unknown> | null): string[] {
  if (!proposal) return [];
  const fields: string[] = [];
  const fingerprint = objectAt(proposal, "fingerprint");
  if (fingerprint) {
    for (const key of Object.keys(fingerprint)) fields.push(`fingerprint.${key}`);
  }
  const brief = objectAt(proposal, "brief");
  if (brief) {
    for (const key of Object.keys(brief)) {
      if (key === "photography") {
        const photo = objectAt(brief, "photography");
        for (const photoKey of Object.keys(photo ?? {})) fields.push(`brief.photography.${photoKey}`);
      } else {
        fields.push(`brief.${key}`);
      }
    }
  }
  return fields;
}

async function refineCreativeWithCollective(input: {
  organizationId: string;
  facts: DnaFacts;
  brief: SiteBrief;
  creative: FirstBuildCreativeDirection;
  signal?: AbortSignal;
}): Promise<{
  creative: FirstBuildCreativeDirection;
  changed: boolean;
  passes: CollectivePassRecord[];
}> {
  const passes: CollectivePassRecord[] = [];
  const facts = factSheet(input.facts, input.brief, input.creative);
  const current = creativeSheet(input.creative);
  const vocabulary = JSON.stringify(
    {
      fingerprint: Object.fromEntries(
        Object.entries(FINGERPRINT_FIELDS).map(([key, values]) => [key, Array.from(values).slice(0, 40)]),
      ),
      briefFields: [
        "personality",
        "heroComposition",
        "sectionRhythm",
        "cardLanguage",
        "ctaLanguage",
        "backgroundTreatment",
        "mobileStrategy",
        "conversionStrategy",
        "industryConventions",
        "photography",
      ],
    },
    null,
    2,
  );

  const solCall = await callCollective({
    purpose: "creative_direction",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 1800,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${CREATIVE_RULES} You are Sol, the master creative director. Improve the design strategy so it can materially shape layout, imagery and section composition across every page. ${creativeQualityPrompt(input.creative.brief.qualityMatrix)}`,
    user: [
      "FACTS (truth source, not copy to invent from):",
      facts,
      "",
      "CURRENT CREATIVE DIRECTION:",
      current,
      "",
      "SUPPORTED DESIGN VOCABULARY:",
      vocabulary,
      "",
      "Return JSON with optional keys fingerprint and brief. fingerprint values must be exact supported tokens. brief may include presentation-only language and photography direction. Omit any field you cannot improve.",
    ].join("\n"),
  });

  let proposal: Record<string, unknown> | null = null;
  if (!solCall.ok) {
    passes.push(record(solCall.wanted, "creative_direction", { skipped: solCall.detail ?? solCall.reason }));
    return { creative: input.creative, changed: false, passes };
  }

  proposal = parseCreativeProposal(solCall.text);
  passes.push(
    record(solCall.tier, "creative_direction", {
      model: solCall.model,
      used: proposal !== null,
      costMicrocents: solCall.costMicrocents,
      skipped: proposal === null ? "the answer was not in the agreed shape" : null,
      acceptedFields: creativeApprovableFields(proposal),
    }),
  );
  if (!proposal) return { creative: input.creative, changed: false, passes };

  let approvedFields: string[] | null = null;
  const terraCall = await callCollective({
    purpose: "specialist_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 900,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${CREATIVE_RULES} You are Terra, a senior design critic. Approve a field only if it is original, safe, renderable and better than the current creative direction.`,
    user: [
      "FACTS:",
      facts,
      "",
      "CURRENT CREATIVE DIRECTION:",
      current,
      "",
      "SOL PROPOSAL:",
      JSON.stringify(proposal, null, 2),
      "",
      'Return JSON: {"approvedFields": ["fingerprint.heroComposition"], "rejected": [{"field": "...", "reason": "..."}]}',
    ].join("\n"),
  });

  if (!terraCall.ok) {
    passes.push(record(terraCall.wanted, "creative_review", { skipped: terraCall.detail ?? terraCall.reason }));
  } else {
    const parsed = parseReview(terraCall.text);
    approvedFields = parsed ? parsed.approvedFields : [];
    passes.push(
      record(terraCall.tier, "creative_review", {
        model: terraCall.model,
        used: parsed !== null,
        costMicrocents: terraCall.costMicrocents,
        skipped: parsed === null ? "the review was not in the agreed shape" : null,
        acceptedFields: parsed?.approvedFields ?? [],
        rejected: parsed?.notes ?? [],
      }),
    );
  }

  const gated = reviewCreativeProposal({
    proposal,
    facts: input.facts,
    baseline: input.creative,
    approvedFields,
  });
  const acceptedFields = [
    ...Object.keys(gated.accepted.fingerprint ?? {}).map((key) => `fingerprint.${key}`),
    ...Object.keys(gated.accepted.brief ?? {}).map((key) => `brief.${key}`),
  ];
  const solPass = passes.find((pass) => pass.purpose === "creative_direction");
  if (solPass) {
    solPass.acceptedFields = acceptedFields;
    solPass.rejected = gated.rejected;
    solPass.used = acceptedFields.length > 0;
    if (!acceptedFields.length && !solPass.skipped)
      solPass.skipped = "every proposed creative field was refused by the safety check";
  }
  if (!acceptedFields.length) return { creative: input.creative, changed: false, passes };
  return {
    creative: mergeCreativeRefinement(input.creative, gated.accepted),
    changed: true,
    passes,
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
  let creative = input.creative;
  let copy = input.copy;
  let creativeChanged = false;
  let copyChanged = false;

  const creativeResult = await refineCreativeWithCollective({
    organizationId: input.organizationId,
    facts: input.facts,
    brief: input.brief,
    creative,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  creative = creativeResult.creative;
  creativeChanged = creativeResult.changed;
  passes.push(...creativeResult.passes);

  const sheet = factSheet(input.facts, input.brief, creative);

  /* -------------------------------- 1. Sol -------------------------------- */
  const solCall = await callCollective({
    purpose: "content_strategy",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 2400,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are the master content strategist for a first build. Follow the approved creative direction without adding unsupported facts.`,
    user: [
      "FACTS (the only truth you may use):",
      sheet,
      "",
      "APPROVED CREATIVE DIRECTION (presentation only):",
      creativeSheet(creative),
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
      system: `${RULES} You are an adversarial reviewer. Approve a field only if it is truthful against the facts, clearer than the current wording, aligned to the creative direction, and free of invented detail.`,
      user: [
        "FACTS:",
        sheet,
        "",
        "APPROVED CREATIVE DIRECTION:",
        creativeSheet(creative),
        "",
        "CURRENT WORDING:",
        JSON.stringify(input.copy, null, 2),
        "",
        "PROPOSED WORDING:",
        JSON.stringify(solProposal, null, 2),
        "",
        '{"approvedFields": ["..."], "rejected": [{"field": "...", "reason": "..."}]}',
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
      copyChanged = true;
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
    system: `${RULES} You write search and sharing wording. Follow the approved creative direction without adding unsupported facts.`,
    user: [
      "FACTS:",
      sheet,
      "",
      "APPROVED CREATIVE DIRECTION:",
      creativeSheet(creative),
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
      copyChanged = true;
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
    creative,
    changed: creativeChanged || copyChanged,
    creativeChanged,
    copyChanged,
    passes,
    totalCostMicrocents: passes.reduce((sum, pass) => sum + pass.costMicrocents, 0),
  };
}
