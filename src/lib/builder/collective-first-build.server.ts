/**
 * The collective's contribution to a first build.
 *
 * Four passes, in order, each through the same credential gate, monthly cap
 * and usage ledger as every other paid call:
 *
 *  1. Sol proposes an open creative brief, image briefs and page composition.
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
import {
  approvableFields,
  mergeRefinement,
  parseRefinement,
  parseReview,
  reviewRefinement,
  type RefinementRejection,
} from "@/lib/builder/collective-copy";
import { creativeQualityPrompt } from "@/lib/builder/creative-quality-matrix";
import { normalizeAspect } from "@/lib/builder/composition-tree";
import { detectGenericPhrases } from "@/lib/builder/genericity";

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

type CreativeBriefPatch = Partial<
  Pick<
    CreativeBrief,
    | "concept"
    | "personality"
    | "heroComposition"
    | "sectionRhythm"
    | "density"
    | "cardLanguage"
    | "ctaLanguage"
    | "backgroundTreatment"
    | "mobileStrategy"
    | "conversionStrategy"
    | "industryConventions"
  >
> & {
  typography?: Partial<CreativeBrief["typography"]>;
  color?: Partial<CreativeBrief["color"]>;
  photography?: Partial<CreativeBrief["photography"]>;
  shapeLanguage?: Partial<CreativeBrief["shapeLanguage"]>;
  motion?: Partial<CreativeBrief["motion"]>;
  imageInventory?: CreativeBrief["imageInventory"];
};

export type CreativeRefinement = {
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



/** Safe-token check only — keeps renderer class names valid, decides nothing. */
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{0,59}$/;

const BRIEF_TEXT_LIMITS = {
  concept: 180,
  personality: 90,
  heroComposition: 140,
  sectionRhythm: 140,
  density: 80,
  cardLanguage: 140,
  ctaLanguage: 140,
  backgroundTreatment: 140,
} as const;

const TYPOGRAPHY_LIMITS = {
  pairingId: 80,
  display: 80,
  body: 80,
  character: 120,
  headlineWeight: 80,
  headlineCase: 80,
} as const;

const COLOR_LIMITS = {
  system: 160,
  strategy: 160,
  accentUse: 160,
} as const;

const PHOTOGRAPHY_LIMITS = {
  language: 180,
  lighting: 120,
  environment: 120,
  treatment: 160,
} as const;

const SHAPE_LIMITS = {
  radius: 80,
  border: 100,
  shadow: 100,
} as const;

const MOTION_LIMITS = {
  level: 80,
  language: 160,
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
      buyerGoal: brief.buyerGoal,
      primaryAction: brief.primaryAction,
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
    const aspectRatio = normalizeAspect(item["aspectRatio"]);
    // Focal point and negative space are the AI's own free-form art direction.
    const focalPoint = textAt(item["focalPoint"], 80) ?? "";
    const negativeSpace = textAt(item["negativeSpace"], 80) ?? "";
    if (!slot || !SAFE_TOKEN.test(slot) || !label || !purpose || !subject || !altText) continue;
    if (!aspectRatio) continue;
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
      focalPoint,
      negativeSpace,
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
}): { accepted: CreativeRefinement; rejected: RefinementRejection[] } {
  const accepted: CreativeRefinement = {};
  const rejected: RefinementRejection[] = [];
  if (!input.proposal) return { accepted, rejected: [{ field: "creative", reason: "unreadable answer" }] };
  const briefRaw = objectAt(input.proposal, "brief");
  if (briefRaw) {
    const brief: CreativeBriefPatch = {};
    for (const [field, max] of Object.entries(BRIEF_TEXT_LIMITS) as [keyof typeof BRIEF_TEXT_LIMITS, number][]) {
      const dotted = `brief.${field}`;
      const value = textAt(briefRaw[field], max);
      if (!value) continue;
      const problem = visualTextProblem(value, input.facts);
      if (problem) {
        rejected.push({ field: dotted, reason: problem });
        continue;
      }
      if (value !== String(input.baseline.brief[field])) (brief as Record<string, unknown>)[field] = value;
    }

    const typographyRaw = objectAt(briefRaw, "typography");
    if (typographyRaw) {
      const typography: Partial<CreativeBrief["typography"]> = {};
      for (const [field, max] of Object.entries(TYPOGRAPHY_LIMITS) as [keyof typeof TYPOGRAPHY_LIMITS, number][]) {
        const dotted = `brief.typography.${field}`;
        const value = textAt(typographyRaw[field], max);
        if (!value) continue;
        typography[field] = value;
      }
      const scaleRatio = typographyRaw["scaleRatio"];
      if (typeof scaleRatio === "number" && Number.isFinite(scaleRatio)) {
        typography.scaleRatio = Math.max(1, Math.min(2, scaleRatio));
      }
      const measureCh = typographyRaw["measureCh"];
      if (typeof measureCh === "number" && Number.isFinite(measureCh)) {
        typography.measureCh = Math.max(20, Math.min(80, Math.round(measureCh)));
      }
      if (Object.keys(typography).length) brief.typography = typography;
    }

    const colorRaw = objectAt(briefRaw, "color");
    if (colorRaw) {
      const color: Partial<CreativeBrief["color"]> = {};
      for (const [field, max] of Object.entries(COLOR_LIMITS) as [keyof typeof COLOR_LIMITS, number][]) {
        const dotted = `brief.color.${field}`;
        const value = textAt(colorRaw[field], max);
        if (!value) continue;
        const problem = visualTextProblem(value, input.facts);
        if (problem) {
          rejected.push({ field: dotted, reason: problem });
          continue;
        }
        color[field] = value;
      }
      if (Object.keys(color).length) brief.color = color;
    }

    for (const field of ["mobileStrategy", "conversionStrategy", "industryConventions"] as const) {
      const dotted = `brief.${field}`;
      const values = listAt(briefRaw[field], field === "conversionStrategy" ? 5 : 4, 140);
      if (!values.length) continue;
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
        const problem = visualTextProblem(value, input.facts);
        if (problem) {
          rejected.push({ field: dotted, reason: problem });
          continue;
        }
        photography[field] = value;
      }
      const subjects = listAt(photographyRaw["subjects"], 4, 120);
      if (subjects.length) {
        const problem = subjects.map((value) => visualTextProblem(value, input.facts)).find(Boolean);
        if (problem) rejected.push({ field: "brief.photography.subjects", reason: problem });
        else photography.subjects = subjects;
      }
      if (Object.keys(photography).length) brief.photography = photography;
    }

    const shapeRaw = objectAt(briefRaw, "shapeLanguage");
    if (shapeRaw) {
      const shapeLanguage: Partial<CreativeBrief["shapeLanguage"]> = {};
      for (const [field, max] of Object.entries(SHAPE_LIMITS) as [keyof typeof SHAPE_LIMITS, number][]) {
        const dotted = `brief.shapeLanguage.${field}`;
        const value = textAt(shapeRaw[field], max);
        if (!value) continue;
        shapeLanguage[field] = value;
      }
      if (Object.keys(shapeLanguage).length) brief.shapeLanguage = shapeLanguage;
    }

    const motionRaw = objectAt(briefRaw, "motion");
    if (motionRaw) {
      const motion: Partial<CreativeBrief["motion"]> = {};
      for (const [field, max] of Object.entries(MOTION_LIMITS) as [keyof typeof MOTION_LIMITS, number][]) {
        const dotted = `brief.motion.${field}`;
        const value = textAt(motionRaw[field], max);
        if (!value) continue;
        motion[field] = value;
      }
      if (Object.keys(motion).length) brief.motion = motion;
    }

    const imageInventory = imageInventoryAt(briefRaw["imageInventory"], input.facts);
    if (imageInventory.length) brief.imageInventory = imageInventory;
    if (Object.keys(brief).length) accepted.brief = brief;
  }

  return { accepted, rejected };
}

export function mergeCreativeRefinement(
  creative: FirstBuildCreativeDirection,
  accepted: CreativeRefinement,
): FirstBuildCreativeDirection {
  let brief = { ...creative.brief };
  if (accepted.brief) {
    const nextBrief = accepted.brief;
    brief = {
      ...brief,
      ...nextBrief,
      typography: nextBrief.typography ? { ...brief.typography, ...nextBrief.typography } : brief.typography,
      color: nextBrief.color ? { ...brief.color, ...nextBrief.color } : brief.color,
      photography: nextBrief.photography
        ? { ...brief.photography, ...nextBrief.photography }
        : brief.photography,
      shapeLanguage: nextBrief.shapeLanguage ? { ...brief.shapeLanguage, ...nextBrief.shapeLanguage } : brief.shapeLanguage,
      motion: nextBrief.motion ? { ...brief.motion, ...nextBrief.motion } : brief.motion,
      mobileStrategy: nextBrief.mobileStrategy ?? brief.mobileStrategy,
      conversionStrategy: nextBrief.conversionStrategy ?? brief.conversionStrategy,
      industryConventions: nextBrief.industryConventions ?? brief.industryConventions,
    };
  }
  return {
    ...creative,
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
  const brief = objectAt(proposal, "brief");
  if (brief) {
    for (const key of Object.keys(brief)) {
      if (key === "typography") {
        const typography = objectAt(brief, "typography");
        for (const typographyKey of Object.keys(typography ?? {})) fields.push(`brief.typography.${typographyKey}`);
      } else if (key === "color") {
        const color = objectAt(brief, "color");
        for (const colorKey of Object.keys(color ?? {})) fields.push(`brief.color.${colorKey}`);
      } else if (key === "photography") {
        const photo = objectAt(brief, "photography");
        for (const photoKey of Object.keys(photo ?? {})) fields.push(`brief.photography.${photoKey}`);
      } else if (key === "shapeLanguage") {
        const shape = objectAt(brief, "shapeLanguage");
        for (const shapeKey of Object.keys(shape ?? {})) fields.push(`brief.shapeLanguage.${shapeKey}`);
      } else if (key === "motion") {
        const motion = objectAt(brief, "motion");
        for (const motionKey of Object.keys(motion ?? {})) fields.push(`brief.motion.${motionKey}`);
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
      briefFields: [
        "concept",
        "personality",
        "typography",
        "color",
        "heroComposition",
        "sectionRhythm",
        "density",
        "cardLanguage",
        "ctaLanguage",
        "backgroundTreatment",
        "shapeLanguage",
        "motion",
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

  const solCall = await callBestThinker({
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
      "Return JSON with one key: brief. Include only decisions you authored for this site.",
      "Describe every creative decision in your own words; no platform style vocabulary is supplied.",
      "brief.concept is required. Author typography, color, heroComposition, sectionRhythm, density, cardLanguage, ctaLanguage, backgroundTreatment, shapeLanguage, motion, mobileStrategy, conversionStrategy, industryConventions and photography as your own words.",
      "brief.imageInventory must be a page-aware picture campaign of as many pictures as your design needs (none is fine; at most 28 for generation cost). Invent a short lowercase-hyphenated semantic slot for each image; there is no slot catalogue. Each item: slot, label, purpose, subject, environment, action, lighting, camera, framing, focalPoint and negativeSpace (your own words), aspectRatio (any positive ratio written like width:height), palette, mood, section (array of exact intended section roles), mobileCrop, altText.",
      "Every picture must have a distinct job in the final site. Generated images are marketing visuals, never staff, customer proof, completed-work evidence, reviews, awards or results.",
    ].join("\n"),
  });

  let proposal: Record<string, unknown> | null = null;
  if (!solCall.ok)
    throw new Error(`Sol could not author the creative direction (${solCall.detail ?? solCall.reason}). Nothing was generated.`);

  const successfulCreativeSol = solCall;
  proposal = parseCreativeProposal(successfulCreativeSol.text);
  passes.push(
    record(successfulCreativeSol.tier ?? "hall_of_fame", "creative_direction", {
      model: successfulCreativeSol.model,
      used: proposal !== null,
      costMicrocents: successfulCreativeSol.costMicrocents,
      skipped: proposal === null ? "the answer was not in the agreed shape" : null,
      acceptedFields: creativeApprovableFields(proposal),
    }),
  );
  if (!proposal) throw new Error("Sol's creative direction was unreadable. Nothing was generated.");

  const terraCall = await callBestThinker({
    json: true,
    purpose: "specialist_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 900,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${CREATIVE_RULES} You are Terra, an independent safety and integrity reviewer. Report only evidence-backed truth, accessibility, renderer, responsive, security, or resource-limit violations. Never reject or rank a creative decision because of taste, originality, preference, or whether you think it is better.`,
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
      'Return JSON: {"approvedFields": ["all safe fields you inspected"], "rejected": [{"field": "...", "reason": "specific factual or technical violation"}]}',
    ].join("\n"),
  });

  if (!terraCall.ok) {
    throw new Error(`Terra could not review the creative direction (${terraCall.detail ?? terraCall.reason}). Nothing was generated.`);
  } else {
    const successfulCreativeTerra = terraCall;
    const parsed = parseReview(successfulCreativeTerra.text);
    passes.push(
      record(successfulCreativeTerra.tier ?? "hall_of_fame", "creative_review", {
        model: successfulCreativeTerra.model,
        used: parsed !== null,
        costMicrocents: successfulCreativeTerra.costMicrocents,
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
  });
  const acceptedFields = Object.keys(gated.accepted.brief ?? {}).map((key) => `brief.${key}`);
  const solPass = passes.find((pass) => pass.purpose === "creative_direction");
  if (solPass) {
    solPass.acceptedFields = acceptedFields;
    solPass.rejected = gated.rejected;
    solPass.used = acceptedFields.length > 0;
    if (!acceptedFields.length && !solPass.skipped)
      solPass.skipped = "every proposed creative field was refused by the safety check";
  }
  if (!acceptedFields.length)
    throw new Error("The reviewed creative direction did not include any usable AI-authored design decisions. Nothing was generated.");
  return {
    creative: mergeCreativeRefinement(input.creative, gated.accepted),
    changed: true,
    passes,
  };
}

function firstBuildCopyStrings(value: unknown): string[] {
  const out: string[] = [];
  const walk = (entry: unknown) => {
    if (typeof entry === "string") { out.push(entry); return; }
    if (Array.isArray(entry)) { entry.forEach(walk); return; }
    if (entry && typeof entry === "object") Object.values(entry as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return out;
}

export async function refineFirstBuildWithCollective(input: {
  organizationId: string;
  facts: DnaFacts;
  brief: SiteBrief;
  copy: SiteCopy;
  creative: FirstBuildCreativeDirection;
  /** New first builds fail rather than preserving detected stock copy after repair. */
  hardGenericityGate?: boolean;
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
        primaryCta: input.copy.primaryCta,
        secondaryCta: input.copy.secondaryCta,
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
    "heroHeadline, heroSubheadline, primaryCta (<=24 chars), secondaryCta (<=24 chars), intro, about, areaCopy,",
    "benefits (3-6 strings), serviceCards (array of {name, copy} — names exactly as given, same order),",
    "faqs (3-8 {question, answer} you choose, answerable only from the facts),",
    "metaTitle (<=60 chars), metaDescription (<=155 chars), ogTitle, ogDescription.",
    "Every sentence and button label must be supported by the facts and conversion goal. Do not add other keys.",
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
  const requiredContent = ["heroHeadline", "heroSubheadline", "primaryCta", "metaTitle", "metaDescription"];
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
      user: `${contentPrompt}\n\nREPAIR: The previous response was missing required wording or malformed. Return one complete JSON object only, including every requested key and non-empty heroHeadline, heroSubheadline, primaryCta, metaTitle, and metaDescription.`,
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
    const successfulSol = solCall;
    passes.push(
      record(successfulSol.tier ?? "hall_of_fame", "content_strategy", {
        model: successfulSol.model,
        used: solProposal !== null,
        costMicrocents: successfulSol.costMicrocents,
        skipped: solProposal === null ? "the answer was not in the agreed shape" : null,
        acceptedFields: approvableFields(solProposal),
      }),
    );
  }

  const genericHits = detectGenericPhrases(firstBuildCopyStrings(solProposal));
  if (genericHits.length) {
    const repairCall = await callBestThinker({
      json: true,
      purpose: "content_strategy",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 6000,
      ...(input.signal ? { signal: input.signal } : {}),
      system: `${RULES} You are the master content strategist repairing generic stock phrasing. Preserve factual truth and the requested JSON shape. Do not use the detected stock phrases.`,
      user: [
        "FACTS (the only truth you may use):",
        sheet,
        "",
        "CURRENT PROPOSAL TO REPAIR:",
        JSON.stringify(solProposal, null, 2),
        "",
        "DETECTED STOCK PHRASES:",
        JSON.stringify(genericHits),
        "",
        "Rewrite only generic wording. Make the site unmistakably specific to this business, its real services, place and buyer context. Do not invent facts or add keys.",
      ].join("\n"),
    });
    const repaired = repairCall.ok ? parseRefinement(repairCall.text) : null;
    passes.push(
      record(repairCall.tier ?? "hall_of_fame", "content_strategy", {
        model: repairCall.model,
        used: repaired !== null,
        costMicrocents: repairCall.costMicrocents,
        skipped: repaired === null ? "generic-copy repair was unavailable or malformed" : null,
        acceptedFields: approvableFields(repaired),
      }),
    );
    if (repaired) solProposal = repaired;
    const remainingGenericHits = detectGenericPhrases(firstBuildCopyStrings(solProposal));
    if (remainingGenericHits.length && input.hardGenericityGate) {
      throw new Error("The AI team left stock phrasing in the first-build copy (" + remainingGenericHits.map((hit) => hit.phrase).join(", ") + "), so the build was stopped for another creative pass.");
    }
  }

  /* ------------------------------- 2. Terra ------------------------------- */
  if (solProposal) {
    const terraCall = await callBestThinker({
    json: true,
      purpose: "specialist_review",
      complexity: "medium",
      organizationId: input.organizationId,
      maxOutputTokens: 900,
      ...(input.signal ? { signal: input.signal } : {}),
      system: `${RULES} You are an independent factual and accessibility reviewer. Report only unsupported facts, unsafe contact details, fabricated claims, inaccessible wording, malformed output, or contradictions with supplied facts. Never reject wording for taste, style, strength, clarity preference, or creative alignment.`,
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
      const successfulCopyTerra = terraCall;
      const parsed = parseReview(successfulCopyTerra.text);
      passes.push(
        record(successfulCopyTerra.tier ?? "hall_of_fame", "specialist_review", {
          model: successfulCopyTerra.model,
          used: parsed !== null,
          costMicrocents: successfulCopyTerra.costMicrocents,
          skipped: parsed === null ? "the review was not in the agreed shape" : null,
          acceptedFields: parsed?.approvedFields ?? [],
          rejected: parsed?.notes ?? [],
        }),
      );
    }

    const gated = reviewRefinement({
      proposal: solProposal,
      facts: input.facts,
      baseline: copy,
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
    const successfulLuna = lunaCall;
    const proposal = parseRefinement(successfulLuna.text);
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
      record(successfulLuna.tier ?? "hall_of_fame", "metadata", {
        model: successfulLuna.model,
        used: acceptedKeys.length > 0,
        costMicrocents: successfulLuna.costMicrocents,
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
