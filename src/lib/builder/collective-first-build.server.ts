/**
 * The collective's contribution to a first build.
 *
 * Four passes, in order, each through the same credential gate, monthly cap
 * and usage ledger as every other paid call:
 *
 *  1. Sol proposes a bounded creative direction that can change the real
 *     fingerprint, brief, image briefs and page composition.
 *  2. Terra reviews Sol's creative proposal adversarially, field by field.
 *  3. Sol authors the visitor-facing wording from the supplied facts.
 *  4. Terra reviews Sol's copy proposal, then Luna tightens metadata only.
 *
 * Nothing a model returns is trusted: values pass safety validation and copy
 * passes through the fact gate before it can reach the page. Callers require
 * complete AI output and stop the build when the team cannot provide it.
 */
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import { formatLocality } from "@/lib/locality";
import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief } from "@/lib/site-brief";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-contract";
import type { CreativeBrief } from "@/lib/builder/first-build-contract";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";
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
  tier: "sol" | "terra" | "luna" | "hall_of_fame";
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
  imageInventory?: CreativeBrief["imageInventory"];
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
  "There is no style list: invent every design token yourself (short lowercase-hyphenated names). Omit uncertain fields.",
  "Respect owner photos: generated images are marketing visuals, never proof of work.",
  "Return a single JSON object and nothing else.",
].join(" ");

/**
 * Fields Sol may author. Values are free: Sol invents them. Only motionLevel
 * and density are bounded, because the renderer and reduced-motion safety
 * need to know them exactly.
 */
const FINGERPRINT_FIELDS = {
  family: null,
  heroComposition: null,
  backgroundSystem: null,
  sectionRhythm: null,
  navSystem: null,
  ctaSystem: null,
  cardSystem: null,
  proofLayout: null,
  pricingLayout: null,
  faqLayout: null,
  galleryLayout: null,
  statsLayout: null,
  timelineLayout: null,
  footerSystem: null,
  typeSystem: null,
  colorSystem: null,
  sectionTransition: null,
  pageShell: null,
  imageTreatment: null,
  motionPattern: null,
  motionLevel: ["none", "subtle", "expressive"],
  density: ["compact", "balanced", "airy"],
} as const satisfies Record<string, readonly string[] | null>;

/** Safe-token check only — keeps renderer class names valid, decides nothing. */
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{0,59}$/;

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
const IMAGE_ASPECTS = new Set(["16:9", "4:3", "1:1", "3:2"]);
const FOCAL_POINTS = new Set(["left", "right", "centre", "lower-third"]);
const NEGATIVE_SPACE = new Set(["left", "right", "top", "bottom"]);

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
      // Look, layout, hero, rhythm, cards, CTA style and backgrounds are left
      // undecided on purpose: Sol authors them. Only non-creative constraints
      // (conversion goals, photo status and quality bar) are sent.
      designDecisions: "undecided — you author every visual and structural choice",
      currentBrief: {
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
      referenceInspiration: creative.referenceSignals ?? null,
      imageStatus: creative.imagery.status,
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

function imageInventoryAt(value: unknown, facts: DnaFacts): CreativeBrief["imageInventory"] {
  if (!Array.isArray(value)) return [];
  const images: CreativeBrief["imageInventory"] = [];
  for (const raw of value.slice(0, 28)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const slot = textAt(item["slot"], 20);
    const label = textAt(item["label"], 100);
    const purpose = textAt(item["purpose"], 240);
    const subject = textAt(item["subject"], 300);
    const altText = textAt(item["altText"], 240);
    const aspectRatio = textAt(item["aspectRatio"], 10);
    const focalPoint = textAt(item["focalPoint"], 20);
    const negativeSpace = textAt(item["negativeSpace"], 20);
    if (!slot || !SAFE_TOKEN.test(slot) || !label || !purpose || !subject || !altText) continue;
    if (!aspectRatio || !IMAGE_ASPECTS.has(aspectRatio)) continue;
    if (!focalPoint || !FOCAL_POINTS.has(focalPoint)) continue;
    if (!negativeSpace || !NEGATIVE_SPACE.has(negativeSpace)) continue;
    const creativeText = [label, purpose, subject, altText].join(" ");
    if (visualTextProblem(creativeText, facts)) continue;
    const section = listAt(item["section"], 8, 60);
    if (!section.length) continue;
    images.push({
      slot,
      label,
      purpose,
      subject,
      environment: textAt(item["environment"], 240) ?? "",
      action: textAt(item["action"], 200) ?? "",
      lighting: textAt(item["lighting"], 180) ?? "",
      camera: textAt(item["camera"], 180) ?? "",
      framing: textAt(item["framing"], 200) ?? "",
      focalPoint: focalPoint as CreativeBrief["imageInventory"][number]["focalPoint"],
      negativeSpace: negativeSpace as CreativeBrief["imageInventory"][number]["negativeSpace"],
      aspectRatio: aspectRatio as CreativeBrief["imageInventory"][number]["aspectRatio"],
      palette: textAt(item["palette"], 160) ?? "",
      mood: textAt(item["mood"], 160) ?? "",
      section,
      mobileCrop: textAt(item["mobileCrop"], 180) ?? "",
      altText,
      constraints: [
        "no text", "no logos", "no watermarks", "no readable signage",
        "no recognisable real people or brands",
        "never presented as proof of completed work, reviews, awards or results",
      ],
      evidenceTag: "AI_GENERATED_MARKETING_VISUAL",
    });
  }
  return images;
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
      const bounded = FINGERPRINT_FIELDS[field] as readonly string[] | null;
      if (bounded ? !bounded.includes(value) : !SAFE_TOKEN.test(value)) {
        rejected.push({ field: dotted, reason: bounded ? "unknown value" : "not a safe token (lowercase letters, digits, hyphens)" });
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
    if (dottedAllowed(gate, "brief.imageInventory")) {
      const imageInventory = imageInventoryAt(briefRaw["imageInventory"], input.facts);
      if (imageInventory.length) brief.imageInventory = imageInventory;
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
  let brief = { ...creative.brief, fingerprintId: fingerprint.id, density: fingerprint.density, motion: { ...creative.brief.motion, level: fingerprint.motionLevel } };
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
      shots: brief.imageInventory.map((item) => ({
        slot: item.slot as FirstBuildCreativeDirection["imagery"]["shots"][number]["slot"],
        label: item.label,
        purpose: item.purpose,
        aspect: item.aspectRatio,
        placement: item.section,
        subjectHint: item.subject,
      })),
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
      fingerprintFields: Object.keys(FINGERPRINT_FIELDS),
      boundedFields: { motionLevel: FINGERPRINT_FIELDS.motionLevel, density: FINGERPRINT_FIELDS.density },
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
        "imageInventory",
      ],
    },
    null,
    2,
  );

  let solCall = await callBestThinker({
    json: true,
    purpose: "creative_direction",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 8000,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${CREATIVE_RULES} You are Sol, the master creative director. Improve the design strategy so it can materially shape layout, imagery and section composition across every page. ${creativeQualityPrompt(input.creative.brief.qualityMatrix)}`,
    user: [
      "FACTS (truth source, not copy to invent from):",
      facts,
      "",
      "CURRENT CREATIVE DIRECTION:",
      current,
      "",
      "FIELDS YOU MAY AUTHOR (values are yours to invent):",
      vocabulary,
      "",
      "Return JSON with keys fingerprint and brief. fingerprint values are your own short lowercase-hyphenated tokens; only motionLevel and density must use the listed values.",
      "brief.imageInventory must be a complete page-aware picture campaign of 3-28 items. Invent a short lowercase-hyphenated semantic slot for each image; there is no slot catalogue. Each item: slot, label, purpose, subject, environment, action, lighting, camera, framing, focalPoint (left|right|centre|lower-third), negativeSpace (left|right|top|bottom), aspectRatio (16:9|4:3|1:1|3:2), palette, mood, section (array of exact intended section roles), mobileCrop, altText.",
      "Every picture must have a distinct job in the final site. Generated images are marketing visuals, never staff, customer proof, completed-work evidence, reviews, awards or results.",
    ].join("\n"),
  });

  let proposal: Record<string, unknown> | null = null;
  if (!solCall.ok)
    throw new Error(`Sol could not author the creative direction (${solCall.detail ?? solCall.reason}). Nothing was generated.`);

  proposal = parseCreativeProposal(solCall.text);
  passes.push(
    record(solCall.tier ?? "hall_of_fame", "creative_direction", {
      model: solCall.model,
      used: proposal !== null,
      costMicrocents: solCall.costMicrocents,
      skipped: proposal === null ? "the answer was not in the agreed shape" : null,
      acceptedFields: creativeApprovableFields(proposal),
    }),
  );
  if (!proposal) throw new Error("Sol's creative direction was unreadable. Nothing was generated.");

  let approvedFields: string[] | null = null;
  const terraCall = await callBestThinker({
    json: true,
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
    throw new Error(`Terra could not review the creative direction (${terraCall.detail ?? terraCall.reason}). Nothing was generated.`);
  } else {
    const parsed = parseReview(terraCall.text);
    approvedFields = parsed ? parsed.approvedFields : [];
    passes.push(
      record(terraCall.tier ?? "hall_of_fame", "creative_review", {
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
  if (!acceptedFields.length || !gated.accepted.brief?.imageInventory?.length)
    throw new Error("The reviewed creative direction did not include a complete AI-authored picture campaign. Nothing was generated.");
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

  const contentPrompt = [
    "FACTS (the only truth you may use):",
    sheet,
    "",
    "APPROVED CREATIVE DIRECTION (presentation only):",
    creativeSheet(creative),
    "",
    "CURRENT WORDING (blank — you author every field from scratch):",
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
    "Write the whole website's wording yourself. Return JSON with EVERY key:",
    "heroHeadline, heroSubheadline, intro, about, areaCopy,",
    "benefits (3-6 strings), serviceCards (array of {name, copy} — names exactly as given, same order),",
    "faqs (3-8 {question, answer} you choose, answerable only from the facts),",
    "metaTitle (<=60 chars), metaDescription (<=155 chars), ogTitle, ogDescription.",
    "Every sentence must be supported by the facts. Do not add other keys.",
  ].join("\n");

  /* -------------------------------- 1. Sol -------------------------------- */
  let solCall = await callBestThinker({
    json: true,
    purpose: "content_strategy",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 6000,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are the master content strategist for a first build. Follow the approved creative direction without adding unsupported facts.`,
    user: contentPrompt,
  });

  let solProposal: Record<string, unknown> | null = null;
  const requiredContent = ["heroHeadline", "heroSubheadline", "metaTitle", "metaDescription"];
  const incomplete = (proposal: Record<string, unknown> | null) =>
    !proposal || requiredContent.some((field) => typeof proposal[field] !== "string" || !(proposal[field] as string).trim());
  if (solCall.ok) solProposal = parseRefinement(solCall.text);
  if (!solCall.ok || incomplete(solProposal)) {
    solCall = await callBestThinker({
      json: true,
      purpose: "content_strategy",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 6000,
      ...(input.signal ? { signal: input.signal } : {}),
      system: `${RULES} You are the master content strategist repairing an incomplete first-build response. Follow the approved creative direction without adding unsupported facts.`,
      user: `${contentPrompt}\n\nREPAIR: The previous response was missing required wording or malformed. Return one complete JSON object only, including every requested key and non-empty heroHeadline, heroSubheadline, metaTitle, and metaDescription.`,
    });
    solProposal = solCall.ok ? parseRefinement(solCall.text) : null;
  }
  if (!solCall.ok) {
    passes.push(
      record(solCall.wanted, "content_strategy", {
        skipped: solCall.detail ?? solCall.reason,
      }),
    );
  } else {
    passes.push(
      record(solCall.tier ?? "hall_of_fame", "content_strategy", {
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
    const terraCall = await callBestThinker({
    json: true,
      purpose: "specialist_review",
      complexity: "medium",
      organizationId: input.organizationId,
      maxOutputTokens: 900,
      ...(input.signal ? { signal: input.signal } : {}),
      system: `${RULES} You are an adversarial reviewer. Approve a field only if it is truthful against the facts, clear and specific, aligned to the creative direction, and free of invented detail.`,
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
        record(terraCall.tier ?? "hall_of_fame", "specialist_review", {
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
  const lunaCall = await callBestThinker({
    json: true,
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
      record(lunaCall.tier ?? "hall_of_fame", "metadata", {
        model: lunaCall.model,
        used: acceptedKeys.length > 0,
        costMicrocents: lunaCall.costMicrocents,
        skipped: acceptedKeys.length
          ? null
          : proposal === null
            ? "the answer was not in the agreed shape"
            : "nothing improved on the current wording",
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
