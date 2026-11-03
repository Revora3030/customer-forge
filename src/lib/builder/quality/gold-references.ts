/**
 * Gold references: 2-3 per trade, handed to the design step as structured style and section descriptors.
 *
 * These describe HOW a great page is composed and moves (the cinematic, scroll-driven style of the reference
 * sites). They are never fake businesses: there is no business name, no number, no review, no price and no
 * claim in here. Every descriptor names the owner material it needs and what to do when that is missing.
 * Pure data and pure functions. No I/O.
 */

/**
 * The slice of a loaded blueprint the references read. Structural, so a `LoadedBlueprint` fits as is and this
 * module stays independent of the loader.
 */
export type GoldInput = {
  label: string;
  hero: { primaryCta: string };
  palette: { base: string; accent: string };
  signatureTool: { name: string; mode: string; inputs: readonly string[] };
  ownerKeys: readonly string[];
};

export type GoldMotion = "split" | "rise" | "reveal" | "depth" | "fade" | "float" | "scrub" | "none";

export type GoldSection = {
  /** What the section is for in the story, e.g. "opening", "proof". */
  role: string;
  /** A composition primitive from the builder's own list. */
  primitive: string;
  motion: GoldMotion;
  /** What it looks like and how it behaves. Style only. */
  treatment: string;
  /** Owner material the section is built from. Empty means it needs none. */
  needs: readonly string[];
  /** What to build instead when `needs` is missing. Never an invented stand-in. */
  whenMissing: string;
};

export type GoldReference = {
  id: string;
  title: string;
  /** One line on why this is the benchmark. */
  intent: string;
  sections: readonly GoldSection[];
  styleNotes: readonly string[];
  /** Hard "never" rules specific to this pattern. */
  never: readonly string[];
};

const NEVER_COMMON: readonly string[] = [
  "no invented reviews, ratings, counts, prices, phone numbers, awards or years in business",
  "no stock-looking filler photos presented as the owner's work",
];

/** Style shared by every reference, taken from the reference videos. */
const SHARED_STYLE: readonly string[] = [
  "one huge display line per screen, set tight and heavy, short and imperative",
  "one saturated accent used only on the primary action, progress marks and selected states",
  "small uppercase tracked eyebrows over each heading",
  "glass cards with 1px translucent borders over a deep canvas",
  "scroll drives the story: pinned scenes, scrubbed frames, parallax depth, staggered rises",
  "all motion respects prefers-reduced-motion and has a still fallback",
  "the primary action stays reachable on a phone through a sticky bar",
];

type PatternId = "scrub-opening" | "hands-on-proof" | "diagnose-first" | "dial-and-quote" | "chaptered-story" | "offer-row-close";

const PATTERNS: Record<PatternId, (bp: GoldInput) => GoldReference> = {
  "scrub-opening": (bp) => ({
    id: "scrub-opening",
    title: "Pinned scrub opening",
    intent: "The first screen is a cinematic scene of the real work that plays as the visitor scrolls, with one headline and one action.",
    sections: [
      {
        role: "opening",
        primitive: "scrub_sequence",
        motion: "scrub",
        treatment: `3-4 pinned frames of one real subject, each frame labelled with one real stage of the ${bp.label.toLowerCase()} story; a corner progress mark reads the stage; display headline splits in word by word; one primary button (${bp.hero.primaryCta}).`,
        needs: ["3 or more of the owner's own photos of one subject"],
        whenMissing: "a full-viewport shader_field or scene with the headline, no pictures presented as the owner's work",
      },
      {
        role: "orientation",
        primitive: "row",
        motion: "rise",
        treatment: "a slim strip of the owner's real service area, hours and contact, in small tracked type, directly under the opening",
        needs: ["service area", "hours or contact"],
        whenMissing: "leave the strip out entirely, or show an owner-fill marker in the editor only",
      },
    ],
    styleNotes: [...SHARED_STYLE, `palette follows the blueprint: base ${bp.palette.base}, accent ${bp.palette.accent}`],
    never: [...NEVER_COMMON, "no auto-playing audio, no carousel of generic stock"],
  }),

  "hands-on-proof": (bp) => ({
    id: "hands-on-proof",
    title: "Hands-on before and after",
    intent: "Proof is something the visitor does with their own hand: drag, brush or spin the owner's own real result.",
    sections: [
      {
        role: "try-it",
        primitive: "before_after_slider",
        motion: "reveal",
        treatment: `short imperative heading with an eyebrow "Try it yourself"; one large before/after of the same subject with a drag handle, live percent revealed, optional tool chips named after what the owner really uses (${bp.signatureTool.name}).`,
        needs: ["the owner's real before and after photos of the same subject"],
        whenMissing: "skip the proof block and tell the method story with sticky_split_story, never a stock before/after",
      },
      {
        role: "method",
        primitive: "sticky_split_story",
        motion: "depth",
        treatment: "pinned picture on one side, three short steps scrolling on the other, each step one sentence the owner supplied",
        needs: ["the owner's steps or process"],
        whenMissing: "a single paragraph from the services the owner listed",
      },
    ],
    styleNotes: [...SHARED_STYLE, "caption each image with what it is and where, using only supplied words"],
    never: [...NEVER_COMMON, "no before/after made from two different subjects"],
  }),

  "diagnose-first": (bp) => ({
    id: "diagnose-first",
    title: "Diagnose first",
    intent: "The visitor picks what is going wrong and immediately sees the real next step and a one-tap action.",
    sections: [
      {
        role: "triage",
        primitive: "tab_group",
        motion: "rise",
        treatment: `eyebrow "What is happening?"; 3-5 large tabs, one per real problem the owner handles; each tab shows the owner's real service, the next step and the call or request button (${bp.hero.primaryCta}).`,
        needs: ["the problems or services the owner handles", "phone or request route"],
        whenMissing: "use only the services the owner listed; with no phone, a request form marked for owner setup",
      },
      {
        role: "reassure",
        primitive: "faq_accordion",
        motion: "fade",
        treatment: "plain questions the owner actually gets, short answers in the owner's words",
        needs: ["owner-supplied questions and answers"],
        whenMissing: "omit the block rather than write generic answers",
      },
    ],
    styleNotes: [...SHARED_STYLE, "urgent trades: the call action is visible without scrolling on a phone"],
    never: [...NEVER_COMMON, "no response-time or availability promises the owner did not state"],
  }),

  "dial-and-quote": (bp) => ({
    id: "dial-and-quote",
    title: "Dial the setting, price the job",
    intent: "A tactile selector explains why one setting does not fit everything, followed by a live estimate built from the owner's own rates.",
    sections: [
      {
        role: "selector",
        primitive: "dial_selector",
        motion: "float",
        treatment: `a large dial or segmented control beside a short heading and one paragraph; each stop is one option the owner really offers (${bp.signatureTool.name}).`,
        needs: ["the options the owner offers"],
        whenMissing: "a plain list of the owner's services with no dial",
      },
      {
        role: "estimate",
        primitive: "widget",
        motion: "rise",
        treatment: `quote_calculator widget, full-width, headed like "Price it in 20 seconds"; inputs ${bp.signatureTool.inputs.slice(0, 3).join(", ") || "from the owner's services"}; the range comes only from the owner's own rates.`,
        needs: bp.ownerKeys.length ? bp.ownerKeys : ["the owner's rates"],
        whenMissing: "switch to request-a-quote mode: collect the details, show no price",
      },
    ],
    styleNotes: [...SHARED_STYLE, "numbers count up only when they are the owner's supplied figures"],
    never: [...NEVER_COMMON, "no typed-in price ranges, 'from $' lines or savings figures"],
  }),

  "chaptered-story": (bp) => ({
    id: "chaptered-story",
    title: "Chaptered journey",
    intent: "A consult-led service told as a few scroll chapters, from first visit to finished result.",
    sections: [
      {
        role: "journey",
        primitive: "scroll_chapters",
        motion: "depth",
        treatment: `3-5 full-height chapters, each with a big numeral, one display line and one supporting sentence; background layers shift at different speeds.`,
        needs: ["the owner's real steps from first contact to finished work"],
        whenMissing: "three generic-free chapters from the services listed: ask, do, finish",
      },
      {
        role: "gallery",
        primitive: "parallax_layers",
        motion: "depth",
        treatment: "three to five of the owner's own photos on layered depth, each captioned with what and where",
        needs: ["3 or more owner photos"],
        whenMissing: "omit the gallery",
      },
    ],
    styleNotes: [...SHARED_STYLE, "generous white space between chapters, one idea per screen"],
    never: [...NEVER_COMMON, "no timelines, budgets or guarantees the owner did not give"],
  }),

  "offer-row-close": (bp) => ({
    id: "offer-row-close",
    title: "Offer row and decisive close",
    intent: "The owner's real services as swipeable offer cards, then a calm, single-action close.",
    sections: [
      {
        role: "offers",
        primitive: "collection_row",
        motion: "rise",
        treatment: "snap-aligned row of offer cards, each with the owner's picture, name and real description; price shown only if the owner gave one",
        needs: ["the owner's services", "service pictures if any"],
        whenMissing: "a text-only list of services, no placeholder pictures",
      },
      {
        role: "close",
        primitive: "scene",
        motion: "reveal",
        treatment: `full-viewport closing scene with one display line and the main action (${bp.hero.primaryCta}); contact details beneath in small type; mobile sticky bar carries the action.`,
        needs: ["a contact route"],
        whenMissing: "an owner-fill marker for the contact route in the editor, and no public contact block",
      },
    ],
    styleNotes: SHARED_STYLE,
    never: NEVER_COMMON,
  }),
};

function modePattern(mode: string): PatternId {
  switch (mode) {
    case "reveal": return "hands-on-proof";
    case "triage": return "diagnose-first";
    case "estimate":
    case "configure":
    case "select": return "dial-and-quote";
    case "journey": return "chaptered-story";
    default: return "offer-row-close"; // filter, request, anything new
  }
}

/** The ordered pattern ids used for a blueprint. Always 2 or 3, always starting with the cinematic opening. */
export function goldPatternIds(bp: Pick<GoldInput, "signatureTool">): PatternId[] {
  const mid = modePattern(bp.signatureTool.mode);
  const ids: PatternId[] = ["scrub-opening", mid];
  if (mid !== "offer-row-close") ids.push("offer-row-close");
  return ids;
}

/** 2-3 structured gold references for this blueprint. Deterministic. */
export function goldReferencesFor(bp: GoldInput): GoldReference[] {
  return goldPatternIds(bp).map((id) => PATTERNS[id](bp));
}

/** Prompt text for the design step. Structured descriptors, flat text. */
export function goldReferenceBlock(refs: readonly GoldReference[]): string {
  const lines: string[] = [
    "GOLD REFERENCES (style and section descriptors to match in quality and motion. They are not businesses and contain no facts. Use only the owner's material; follow each whenMissing rule):",
  ];
  refs.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}: ${r.intent}`);
    for (const s of r.sections) {
      lines.push(`   - ${s.role} [${s.primitive}, motion ${s.motion}]: ${s.treatment} Needs: ${s.needs.join("; ") || "nothing"}. If missing: ${s.whenMissing}.`);
    }
    lines.push(`   Style: ${r.styleNotes.join("; ")}.`);
    lines.push(`   Never: ${r.never.join("; ")}.`);
  });
  return lines.join("\n");
}
