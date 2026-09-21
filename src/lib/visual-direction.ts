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
 * Industry visual languages. Chosen by keyword, so a detailer gets cinematic
 * automotive work and a law firm gets restrained editorial authority.
 */
export const VISUAL_DIRECTIONS: VisualDirection[] = [
  {
    id: "automotive",
    label: "Cinematic automotive",
    language: "Premium vehicle photography with deep reflections and close detail work",
    subjects: [
      "a freshly detailed dark car with mirror-like paint reflections",
      "close macro detail of polished paint and clean trim",
      "a spotless car interior with clean leather and dashboard",
      "a technician working with a polisher in a clean bay",
    ],
    lighting: "controlled studio strip lighting with soft reflected highlights",
    environment: "dark clean detailing bay or dusk city backdrop",
    treatment: "high contrast, deep blacks, subtle warm highlights, no lens flare clutter",
    affinity: [
      "detail",
      "auto",
      "car",
      "mobile detail",
      "ceramic",
      "tint",
      "wrap",
      "mechanic",
      "tow",
    ],
  },
  {
    id: "home-trade",
    label: "Real craftsmanship",
    language: "Honest project photography that shows real work and real results",
    subjects: [
      "a finished residential project shot in natural daylight",
      "close detail of clean workmanship and materials",
      "a tradesperson working carefully on site with proper equipment",
      "a tidy work van and organised tools",
    ],
    lighting: "bright natural daylight, soft shadows",
    environment: "residential exterior or freshly finished interior",
    treatment: "true-to-life colour, sharp detail, nothing staged or glossy",
    affinity: [
      "roof",
      "plumb",
      "hvac",
      "electric",
      "remodel",
      "construct",
      "concrete",
      "paint",
      "fence",
      "deck",
      "floor",
      "tile",
      "handyman",
      "carpent",
      "landscap",
      "lawn",
      "tree",
    ],
  },
  {
    id: "clean",
    label: "Fresh and spotless",
    language: "Before/after clarity with bright, hygienic surfaces",
    subjects: [
      "a spotless bright room after a professional clean",
      "close detail of a gleaming surface catching daylight",
      "a uniformed cleaner working with professional equipment",
      "a pressure washed driveway with a clear clean line",
    ],
    lighting: "airy daylight, high key, clean whites",
    environment: "bright domestic or commercial interior",
    treatment: "crisp, fresh, high clarity, cool clean tones",
    affinity: [
      "clean",
      "wash",
      "maid",
      "janitor",
      "carpet",
      "window",
      "pest",
      "restoration",
      "septic",
    ],
  },
  {
    id: "food",
    label: "Appetite-first",
    language: "Food photography with atmosphere and human energy",
    subjects: [
      "an appetising signature dish styled simply on a dark table",
      "warm interior atmosphere with soft ambient light",
      "hands plating or preparing food in a working kitchen",
      "close detail of texture and steam on freshly made food",
    ],
    lighting: "warm directional window light with soft falloff",
    environment: "characterful restaurant interior or clean kitchen",
    treatment: "rich warm colour, shallow depth of field, no plastic-looking food",
    affinity: ["restaur", "food", "cafe", "bake", "cater", "bar", "coffee", "pizza", "kitchen"],
  },
  {
    id: "beauty",
    label: "Premium lifestyle",
    language: "Clean studio beauty with close, tactile detail",
    subjects: [
      "a calm premium treatment space with soft textures",
      "close detail of a finished result on a neutral background",
      "professional tools laid out neatly on a clean surface",
      "a serene lifestyle moment in soft light",
    ],
    lighting: "soft diffused studio light, gentle gradients",
    environment: "minimal studio or refined salon interior",
    treatment: "soft, luminous, low contrast, elegant negative space",
    affinity: [
      "salon",
      "beauty",
      "hair",
      "nail",
      "spa",
      "lash",
      "brow",
      "barber",
      "skin",
      "massage",
      "groom",
    ],
  },
  {
    id: "professional",
    label: "Quiet authority",
    language: "Restrained editorial photography that signals competence",
    subjects: [
      "a calm modern office interior with strong architectural lines",
      "a professional workspace detail with documents and a laptop",
      "a considered handshake or consultation moment, faces not central",
      "a city skyline detail at golden hour",
    ],
    lighting: "even natural light with controlled contrast",
    environment: "modern office, meeting room or city exterior",
    treatment: "muted editorial palette, generous space, no clichéd stock posing",
    affinity: [
      "law",
      "attorney",
      "account",
      "financ",
      "insur",
      "consult",
      "coach",
      "real estate",
      "mortgage",
      "it",
      "tech",
    ],
  },
  {
    id: "health",
    label: "Calm and clinical",
    language: "Reassuring healthcare photography, clean and human",
    subjects: [
      "a bright welcoming treatment room",
      "clean professional equipment detail",
      "a reassuring care moment in soft light",
      "a calm waiting area with natural materials",
    ],
    lighting: "soft even daylight, no harsh shadows",
    environment: "modern clinic interior",
    treatment: "clean, calm, trustworthy, gentle colour",
    affinity: [
      "dental",
      "dentist",
      "med",
      "clinic",
      "health",
      "therap",
      "chiro",
      "vet",
      "care",
      "wellness",
      "yoga",
    ],
  },
  {
    id: "pet-care",
    label: "Warm pet care",
    language: "Playful but polished pet-care photography with warmth, texture and calm handling",
    subjects: [
      "a freshly groomed dog in a bright calm studio, no branded accessories",
      "close detail of clean grooming tools and soft natural textures",
      "a calm pet-care setting prepared for an appointment, without identifiable people",
      "a relaxed dog or cat in a clean welcoming care environment",
    ],
    lighting: "soft daylight with warm highlights and clear natural colour",
    environment: "clean grooming studio, veterinary reception or safe outdoor pet setting",
    treatment: "warm editorial colour, lively framing, tactile detail, never childish clip art",
    affinity: ["pet", "groom", "veterinar", "animal", "dog", "cat", "kennel", "boarding"],
  },
  {
    id: "secure-trade",
    label: "Precision and security",
    language: "Confident technical trade photography focused on precision tools, access and protection",
    subjects: [
      "a precision lock mechanism and professional locksmith tools in close detail",
      "a clean modern door hardware installation photographed at an architectural angle",
      "organised specialist tools prepared for a local service call",
      "a secured residential entry in crisp evening light",
    ],
    lighting: "controlled directional light with crisp metal highlights",
    environment: "modern residential or commercial entryway",
    treatment: "dark premium surfaces, sharp detail, restrained amber accents",
    affinity: ["locksmith", "lock", "key", "access control", "safe"],
  },
  {
    id: "moving-logistics",
    label: "Organised movement",
    language: "Bright editorial logistics photography showing care, order and useful space",
    subjects: [
      "carefully packed unbranded boxes in a bright uncluttered home",
      "an organised unbranded moving vehicle with clean protective equipment",
      "protected furniture and moving equipment arranged with care",
      "a clean cleared space ready for its next use",
    ],
    lighting: "clear natural daylight with soft dimensional shadows",
    environment: "tidy residential interior, driveway or neutral loading space",
    treatment: "confident wide framing, clean neutrals, practical detail, no staged smiling crews",
    affinity: ["moving", "mover", "relocation", "junk", "hauling", "removal", "storage"],
  },
  {
    id: "events",
    label: "Atmosphere and moment",
    language: "Story-driven photography with mood and movement",
    subjects: [
      "an event space glowing with warm string lighting",
      "a candid moment of celebration in low light",
      "a beautifully arranged detail shot from a real event",
      "a wide atmospheric venue shot at dusk",
    ],
    lighting: "warm practical lights with deep shadows",
    environment: "venue interior or outdoor evening setting",
    treatment: "cinematic, warm, slightly grainy, emotive",
    affinity: ["event", "wedding", "photo", "music", "dj", "entertain", "party", "venue"],
  },
  {
    id: "technology",
    label: "Precision technology",
    language: "Clean technical photography with engineered detail",
    subjects: [
      "a professionally installed system with tidy cabling",
      "close detail of modern hardware on a clean surface",
      "a technician configuring equipment with focus",
      "an abstract lit surface suggesting energy or data",
    ],
    lighting: "cool directional light with controlled speculars",
    environment: "modern building exterior or clean install site",
    treatment: "sharp, cool tones, engineered and deliberate",
    affinity: [
      "solar",
      "renewable",
      "panel",
      "battery",
      "security",
      "camera",
      "network",
      "smart",
      "ev",
      "energy",
      "automation",
      "audio",
      "install",
    ],
  },
  {
    id: "service",
    label: "Dependable and local",
    language: "Straightforward, friendly photography of real local service",
    subjects: [
      "a service professional arriving ready to work",
      "clean equipment prepared for the job",
      "a satisfied result photographed simply in daylight",
      "a local neighbourhood street in soft daylight",
    ],
    lighting: "natural daylight, honest and clear",
    environment: "local residential or commercial setting",
    treatment: "warm, human, unpretentious, sharp detail",
    affinity: [],
  },
];

const hash = (value: string) => {
  let out = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619) >>> 0;
  }
  return out;
};

/** Picks the visual language for this business; falls back to dependable local service. */
export function pickVisualDirection(input: {
  industry?: string | null;
  services?: { name: string }[];
}): VisualDirection {
  const words = [input.industry ?? "", ...(input.services ?? []).map((s) => s.name)]
    .join(" ")
    .toLowerCase();
  const scored = VISUAL_DIRECTIONS.map((direction) => ({
    direction,
    score: direction.affinity.filter((word) => words.includes(word)).length,
  })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score > 0 ? best.direction : VISUAL_DIRECTIONS[VISUAL_DIRECTIONS.length - 1]!;
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
  direction: VisualDirection;
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
      subjectHint: input.direction.subjects[0],
    });
  }

  for (const name of input.serviceNames.slice(0, 4)) {
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
      label: "About / team image",
      purpose: "Puts a human behind the business — the single biggest trust lift on a local site.",
      aspect: "3:2",
      placement: ["about"],
      subjectHint: input.direction.subjects[2],
    },
    {
      slot: "proof",
      label: "Results image",
      purpose: "Evidence of finished work for the proof or gallery section.",
      aspect: "4:3",
      placement: ["gallery", "proof", "testimonials"],
      subjectHint: input.direction.subjects[1],
    },
    {
      slot: "cta",
      label: "Call-to-action image",
      purpose: "High-emotion image behind the enquiry block to push the decision.",
      aspect: "16:9",
      placement: ["cta", "quote", "contact"],
      subjectHint: input.direction.subjects[3],
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
