/**
 * Revora Visual Direction engine (pure, browser-safe).
 *
 * Two businesses in the same trade must never end up with the same photography.
 * This module decides, before any image is made, what the *visual language* of a
 * specific business should be — and which shots the website actually needs.
 *
 * Nothing here invents facts about the business. Prompts describe photography
 * (subject, lighting, composition, mood), never claims, awards or people.
 */

export type VisualDirection = {
  id: string;
  /** Plain-language label the owner understands. */
  label: string;
  /** What the photography should feel like. */
  language: string;
  /** Subjects that belong in this world. */
  subjects: string[];
  lighting: string;
  environment: string;
  treatment: string;
  /** Industry words this direction is written for. */
  affinity: string[];
};

/**
 * The photo direction the AI wrote into the site's saved brief. There is no
 * built-in list of industry styles: with nothing saved, every field is blank
 * and the owner's own note (and the AI) decide the picture.
 */
export function savedVisualDirection(photography: unknown): VisualDirection {
  const raw = (photography && typeof photography === "object" ? photography : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string).slice(0, 200) : "");
  const subjects = Array.isArray(raw["subjects"])
    ? (raw["subjects"] as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];
  const language = text("language");
  return {
    id: language ? "ai-authored" : "",
    label: language ? "your AI-designed style" : "your own direction",
    language,
    subjects,
    lighting: text("lighting"),
    environment: text("environment"),
    treatment: text("treatment"),
    affinity: [],
  };
}

/* ------------------------------- shot plan -------------------------------- */

export type ShotSlot =
  "hero" | "service" | "about" | "proof" | "background" | "cta" | "social" | "icon";

export type PlannedShot = {
  slot: ShotSlot;
  /** What this image is for, in the owner's words. */
  label: string;
  purpose: string;
  aspect: "16:9" | "4:3" | "1:1" | "3:2";
  /** Which section kinds this image should be placed in. */
  placement: string[];
  subjectHint?: string | undefined;
};

/**
 * What photography this specific website still needs. Driven by the real site:
 * services present, photos already uploaded, sections that exist.
 */
export function planShots(input: {
  /** Optional: subject hints only. Null when the AI hasn't chosen a direction. */
  direction: VisualDirection | null;
  serviceNames: string[];
  hasHeroImage: boolean;
  mediaCount: number;
}): PlannedShot[] {
  const shots: PlannedShot[] = [];

  if (!input.hasHeroImage) {
    shots.push({
      slot: "hero",
      label: "Hero image",
      purpose:
        "The first thing a visitor sees — it has to make them believe the quality before reading.",
      aspect: "16:9",
      placement: ["hero"],
      subjectHint: input.direction?.subjects[0],
    });
  }

  // Preserve enough distinct service frames to give secondary pages their own
  // subject rather than repeating one homepage image across the entire site.
  for (const name of input.serviceNames.slice(0, 8)) {
    shots.push({
      slot: "service",
      label: `${name} image`,
      purpose: `Shows what "${name}" actually looks like, so the service card sells itself.`,
      aspect: "4:3",
      placement: ["services", "service_detail"],
      subjectHint: name,
    });
  }

  shots.push(
    {
      slot: "about",
      label: "About story image",
      purpose: "Shows the craft, environment or tools behind the business without impersonating its real team.",
      aspect: "3:2",
      placement: ["about"],
      subjectHint: `${input.direction?.environment ?? "the business setting"}; craft detail or unoccupied workspace, no identifiable person`,
    },
    {
      slot: "proof",
      label: "Results image",
      purpose: "Evidence of finished work for the proof or gallery section.",
      aspect: "4:3",
      placement: ["gallery", "proof", "testimonials"],
      subjectHint: input.direction?.subjects[1],
    },
    {
      slot: "cta",
      label: "Call-to-action image",
      purpose: "High-emotion image behind the enquiry block to push the decision.",
      aspect: "16:9",
      placement: ["cta", "quote", "contact"],
      subjectHint: input.direction?.subjects[3],
    },
    {
      slot: "background",
      label: "Section background",
      purpose:
        "Abstract brand-coloured texture for section backgrounds, never competing with text.",
      aspect: "16:9",
      placement: ["offer", "faq", "areas"],
    },
    {
      slot: "social",
      label: "Social / share graphic",
      purpose: "The image shown when the site is shared on Google, Facebook or in messages.",
      aspect: "16:9",
      placement: ["og"],
    },
  );

  return shots.slice(0, 12);
}

/* ------------------------------ prompt engine ------------------------------ */

export const CANDIDATE_STYLES = [
  {
    id: "cinematic",
    label: "A — Cinematic premium",
    modifier:
      "cinematic composition, shallow depth of field, dramatic controlled lighting, rich shadow detail, premium magazine quality",
  },
  {
    id: "clean",
    label: "B — Clean professional",
    modifier:
      "clean straightforward composition, even bright lighting, sharp throughout, generous negative space, commercial catalogue quality",
  },
  {
    id: "human",
    label: "C — Human centred",
    modifier:
      "candid documentary framing, real working moment, natural light, authentic and unposed, warm human feel",
  },
  {
    id: "editorial",
    label: "D — Bold editorial",
    modifier:
      "bold graphic composition, strong diagonal lines, high contrast, striking single subject, editorial cover energy",
  },
] as const;

export type CandidateStyleId = (typeof CANDIDATE_STYLES)[number]["id"];

export const REFINEMENTS = [
  {
    id: "premium",
    label: "Make it more premium",
    modifier: "more premium and expensive looking, refined lighting, luxury finish",
  },
  {
    id: "realistic",
    label: "Make it more realistic",
    modifier: "photorealistic, real-world imperfections, documentary honesty, no CGI look",
  },
  {
    id: "brighter",
    label: "Make it brighter",
    modifier: "brighter exposure, airier highlights, lighter overall mood",
  },
  {
    id: "darker",
    label: "Make it moodier",
    modifier: "darker moodier grade, deeper shadows, low-key lighting",
  },
  {
    id: "wider",
    label: "Make it wider",
    modifier: "wider framing with more room for headline text on the left",
  },
  {
    id: "mobile",
    label: "Create a mobile version",
    modifier:
      "vertical-friendly framing with the subject centred and safe margins for phone screens",
  },
  {
    id: "brand",
    label: "Match my brand",
    modifier: "colour grade tuned to the brand palette, brand colours present in the environment",
  },
  {
    id: "subject",
    label: "Change the subject",
    modifier: "a different subject from the same world, clearly not a repeat of the previous frame",
  },
  {
    id: "background",
    label: "Change the background",
    modifier: "a different background environment, same subject treatment",
  },
  {
    id: "clean-bg",
    label: "Simple background",
    modifier: "plain uncluttered background so text overlays stay readable",
  },
] as const;

export type RefinementId = (typeof REFINEMENTS)[number]["id"];

export type ImageBrief = {
  subject: string;
  composition: string;
  lighting: string;
  environment: string;
  mood: string;
  palette: string;
  aspect: string;
  placement: string;
  purpose: string;
  prompt: string;
};

const aspectWords: Record<string, string> = {
  "16:9": "wide 16:9 landscape banner framing",
  "4:3": "4:3 landscape framing",
  "3:2": "3:2 landscape framing",
  "1:1": "square 1:1 framing",
};

/**
 * Builds the production brief that is actually sent to the image model. Written
 * as a photography direction, so the result reads as commissioned work rather
 * than a generic stock frame.
 */
export function buildImageBrief(input: {
  direction: VisualDirection;
  shot: PlannedShot;
  style: (typeof CANDIDATE_STYLES)[number];
  businessName?: string | null;
  city?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  refinements?: RefinementId[];
  extra?: string | null;
  seed?: string;
}): ImageBrief {
  const { direction, shot, style } = input;
  const subject =
    shot.slot === "background"
      ? `an abstract brand-coloured surface or texture, no people, no text`
      : shot.slot === "service" && shot.subjectHint
        ? `${shot.subjectHint} being carried out professionally`
        : (shot.subjectHint ?? direction.subjects[0]!);

  const palette =
    [input.primaryColor, input.accentColor].filter(Boolean).join(" and ") || "the brand palette";
  const place = input.city ? ` in a ${input.city} setting` : "";
  const refinementText = (input.refinements ?? [])
    .map((id) => REFINEMENTS.find((r) => r.id === id)?.modifier)
    .filter(Boolean)
    .join(", ");

  const prompt = [
    `Professional commissioned photograph for a local business website${place}.`,
    `Subject: ${subject}.`,
    `Visual language: ${direction.language}.`,
    `Lighting: ${direction.lighting}. Environment: ${direction.environment}.`,
    `Treatment: ${direction.treatment}.`,
    `Style: ${style.modifier}.`,
    `Colour: subtle accents of ${palette} present in the scene, no colour overlays.`,
    `Framing: ${aspectWords[shot.aspect] ?? shot.aspect}, composed so headline text can sit over one side without covering the subject.`,
    refinementText ? `Adjustments: ${refinementText}.` : "",
    input.extra ? `Client note: ${input.extra}.` : "",
    "No text, no logos, no watermarks, no readable signage, no recognisable real people or brands.",
    "Must look like real professional photography, not an AI illustration.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    subject,
    composition: aspectWords[shot.aspect] ?? shot.aspect,
    lighting: direction.lighting,
    environment: direction.environment,
    mood: style.label,
    palette,
    aspect: shot.aspect,
    placement: shot.placement.join(", "),
    purpose: shot.purpose,
    prompt,
  };
}

/** Deterministic alt text for accessibility and SEO. */
export function altTextFor(shot: PlannedShot, businessName?: string | null): string {
  const who = businessName?.trim() ? businessName.trim() : "the business";
  const subject = shot.subjectHint?.trim();
  switch (shot.slot) {
    case "hero":
      return subject ? `${subject} — website image for ${who}` : `Featured service image for ${who}`;
    case "service":
      return `${shot.subjectHint ?? "Service"} carried out by ${who}`;
    case "about":
      return `The team behind ${who}`;
    case "proof":
      return `Completed work by ${who}`;
    case "cta":
      return subject ? `${subject} — enquiry image for ${who}` : `Enquiry image for ${who}`;
    case "social":
      return `${who} website preview image`;
    default:
      return `${who} website image`;
  }
}

/** Pre-publish image quality checks, expressed in plain language. */
export type ImageQualityIssue = { level: "fix" | "warn"; message: string };

export function checkImageQuality(input: {
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  altText?: string | null;
  slot?: ShotSlot;
}): ImageQualityIssue[] {
  const issues: ImageQualityIssue[] = [];
  const { width, height, sizeBytes, altText } = input;

  if (width && height) {
    if (width < 1200 && (input.slot === "hero" || input.slot === "cta")) {
      issues.push({
        level: "fix",
        message: `Only ${width}px wide — hero images look soft below 1200px.`,
      });
    }
    const ratio = width / height;
    if (input.slot === "hero" && (ratio < 1.4 || ratio > 2.2)) {
      issues.push({
        level: "warn",
        message: "Shape is off for a banner — it will crop hard on desktop.",
      });
    }
  }
  if (sizeBytes && sizeBytes > 600 * 1024) {
    issues.push({ level: "warn", message: "Over 600 KB — it will slow the page on mobile data." });
  }
  if (!altText || !altText.trim()) {
    issues.push({
      level: "fix",
      message: "No alt text, so search engines and screen readers can't read it.",
    });
  }
  return issues;
}
