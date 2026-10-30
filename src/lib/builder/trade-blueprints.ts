/**
 * Trade blueprints: the look, signature moment and main call to action for the 14 business categories the
 * builder knows best. They replace the single "obsidian + yellow" reference look every trade used to get.
 *
 * Blueprints are starting points for the design team (palette roles and a font pairing), never facts: no review,
 * rating, award, licence, price or outcome is implied by anything here. A business outside the 14 falls back to the
 * closest blueprint through its trade playbook or archetype; only a business with nothing to go on keeps the original
 * cinematic obsidian studio look.
 */

export type StudioTransition = "dark-to-light" | "dark-only";

/** Blueprints whose dark cinematic hero flows into light content. Every other blueprint stays dark-only. */
export const DARK_TO_LIGHT_BLUEPRINTS: readonly TradeBlueprintKey[] = ["real-estate", "law-firms", "dentist", "landscaping"];

export type TradeBlueprintKey =
  | "plumbing"
  | "hvac"
  | "roofing"
  | "auto-detailing"
  | "pressure-washing"
  | "landscaping"
  | "cleaning"
  | "restaurants"
  | "salons-barbers"
  | "med-spa"
  | "dentist"
  | "law-firms"
  | "real-estate"
  | "gyms-fitness";

/**
 * Hexes follow the Phase B plan. Near-neutral canvases (charcoal, carbon, matte black, obsidian, iron) carry a faint
 * warm or cool tint (chroma >= 6) so the palette guard, which rejects untinted black surfaces, accepts them.
 */
export type BlueprintPalette = {
  /** Dominant page surface (~60%). */
  canvas: string;
  /** Raised cards and panels on that surface. */
  surface: string;
  /** Body and heading ink on the canvas. */
  ink: string;
  /** Secondary ink. */
  muted: string;
  /** High-intent action colour (~10%): buttons, progress rings, selected chips. */
  accent: string;
  /** Structural grounding tone (~30%). */
  grounding: string;
};

export type TradeBlueprint = {
  key: TradeBlueprintKey;
  label: string;
  /** Dark blueprints paint the cinematic studio canvas; light ones keep the authored light theme. */
  tone: "dark" | "light";
  /**
   * How a dark studio page hands off (quality bar #22). "dark-to-light" keeps the
   * cinematic opening chapter on the dark canvas and lets every section after it
   * sit on one light canvas (the Veyra pattern), with a single gradient seam.
   * "dark-only" keeps every section dark (WASH / Car Vault style). Light-tone
   * blueprints never enter studio mode, so theirs is always "dark-only".
   */
  studioTransition: StudioTransition;
  hero: string;
  /** The interactive primitive the home page is built around. */
  signatureWidget: string;
  palette: BlueprintPalette;
  fonts: { display: string; body: string };
  cta: { primary: string; secondary: string };
  /** How the look reads, for the design prompt. */
  look: string;
};

export const TRADE_BLUEPRINTS: readonly TradeBlueprint[] = [
  {
    key: "plumbing",
    label: "Plumbing",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "an emergency split hero: one half a calm full-bleed photograph, the other the call action, the hours the owner gave and licence chips only if supplied",
    signatureWidget: "a tab_group \"Where is the problem?\" (kitchen, bathroom, main drain, water heater) with the real next step and call action",
    palette: { canvas: "#0B132B", surface: "#13203F", ink: "#F1F5FB", muted: "#A9B6CC", accent: "#00E5FF", grounding: "#1C2A4D" },
    fonts: { display: "Plus Jakarta Sans", body: "Manrope" },
    cta: { primary: "Call for immediate dispatch", secondary: "Schedule a drain inspection" },
    look: "deep slate navy canvas, cyan action colour used only on the call button and selected chips, confident geometric headlines, large tap targets",
  },
  {
    key: "hvac",
    label: "HVAC, heating and cooling",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a seasonal climate hero (cooling in summer, heating in winter) with the 24/7 availability only if the owner offers it",
    signatureWidget: "a dial_selector for system type or capacity per home size, only ranges the owner states",
    palette: { canvas: "#12161A", surface: "#1B2127", ink: "#F2F5F7", muted: "#AAB4BD", accent: "#F97316", grounding: "#38BDF8" },
    fonts: { display: "Space Grotesk", body: "Inter" },
    cta: { primary: "Schedule service", secondary: "Get a replacement estimate" },
    look: "graphite canvas with glacier-blue structure and an amber action colour, crisp technical type, fine rules and clear figure blocks",
  },
  {
    key: "roofing",
    label: "Roofing",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a full-bleed aerial roofline hero with a scrim and one display line",
    signatureWidget: "a before_after_slider of the owner's own real before and after of the same roof",
    palette: { canvas: "#1C1814", surface: "#26211C", ink: "#F5F1EA", muted: "#B9B2A6", accent: "#D97706", grounding: "#3A2E22" },
    fonts: { display: "Syne", body: "Work Sans" },
    cta: { primary: "Book a free inspection", secondary: "Get a roof estimate" },
    look: "charcoal canvas with copper action colour and bone ink, structural wide display type, generous vertical rhythm",
  },
  {
    key: "auto-detailing",
    label: "Auto detailing",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a studio-lit vehicle hero (one car, moving closer frame by frame) with the packages one tap away",
    signatureWidget: "a brush reveal \"Polish this panel.\" (before_after_slider revealMode brush) from the owner's real before/after",
    palette: { canvas: "#0A090F", surface: "#15141A", ink: "#FAFAF7", muted: "#B4B4B8", accent: "#EAB308", grounding: "#27272A" },
    fonts: { display: "Space Grotesk", body: "Plus Jakarta Sans" },
    cta: { primary: "Build your detail quote", secondary: "Book a ceramic package" },
    look: "carbon studio canvas, high-visibility yellow action colour on buttons and progress rings only, tight heavy display type",
  },
  {
    key: "pressure-washing",
    label: "Pressure washing",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a kinetic water-jet hero over the owner's own surface photographs, with surface chips (driveway, siding, roof, deck)",
    signatureWidget: "a scrub_sequence with stopwatch over real frames, then a 20-second quote_calculator by surface size",
    palette: { canvas: "#0A192F", surface: "#112640", ink: "#F0F7FA", muted: "#A3B8C8", accent: "#06B6D4", grounding: "#173352" },
    fonts: { display: "Barlow Semi Condensed", body: "Manrope" },
    cta: { primary: "Instant price in 20 seconds", secondary: "Book an exterior wash" },
    look: "oceanic navy canvas with cyan action colour, condensed athletic headlines, glass cards with fine translucent borders",
  },
  {
    key: "landscaping",
    label: "Landscaping",
    tone: "dark",
    studioTransition: "dark-to-light",
    hero: "a panoramic editorial natural-light hero of the owner's own yard work",
    signatureWidget: "a seasonal dial_selector (spring, summer, fall, winter) listing only services the owner offers",
    palette: { canvas: "#064E3B", surface: "#0B5E48", ink: "#F3F1EA", muted: "#C6CFC4", accent: "#D9A441", grounding: "#78716C" },
    fonts: { display: "Fraunces", body: "Epilogue" },
    cta: { primary: "Request an on-site design", secondary: "View maintenance plans" },
    look: "deep pine canvas with stone grounding and a warm moss-gold action colour, an editorial serif display face, wide photography",
  },
  {
    key: "cleaning",
    label: "House and commercial cleaning",
    tone: "light",
    studioTransition: "dark-only",
    hero: "a minimal bright hero with one clear price action and the real checklist promise",
    signatureWidget: "a quote_calculator with bedroom and bathroom steppers from the owner's own pricing",
    palette: { canvas: "#D7F0E4", surface: "#F4FBF7", ink: "#0F2A22", muted: "#3F5A51", accent: "#10B981", grounding: "#334155" },
    fonts: { display: "Manrope", body: "DM Sans" },
    cta: { primary: "Calculate your quote", secondary: "Book your clean online" },
    look: "a fresh mint-tinted light canvas with slate structure and a mint action colour, friendly rounded sans type, airy spacing",
  },
  {
    key: "restaurants",
    label: "Restaurants and cafes",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a full-screen ambient food hero with today's real opening hours from the owner's hours",
    signatureWidget: "a menu tab_group (starters, mains, drinks) of the real menu with dietary badges only where the owner marked them",
    palette: { canvas: "#1E1915", surface: "#2A231D", ink: "#FDFBF7", muted: "#CFC6B8", accent: "#D97706", grounding: "#3B2F25" },
    fonts: { display: "Playfair Display", body: "Karla" },
    cta: { primary: "Reserve a table", secondary: "Order online" },
    look: "espresso canvas, cream ink and a gold action colour, an expressive serif display face, warm full-bleed food photography",
  },
  {
    key: "salons-barbers",
    label: "Salons and barbers",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "an editorial portrait hero of the owner's real work with one-tap booking",
    signatureWidget: "a stylist picker tab_group of the real team and their services",
    palette: { canvas: "#1A1820", surface: "#24222A", ink: "#F4F4F5", muted: "#B6B6BC", accent: "#F59E0B", grounding: "#E4E4E7" },
    fonts: { display: "Syne", body: "Manrope" },
    cta: { primary: "Book appointment", secondary: "Choose your stylist" },
    look: "matte black canvas with chrome detailing and an amber action colour, editorial wide display type",
  },
  {
    key: "med-spa",
    label: "Med spa and aesthetics",
    tone: "light",
    studioTransition: "dark-only",
    hero: "a clinical luxury hero with provider credentials only if the owner holds them",
    signatureWidget: "an outcome before_after_slider with treatment-timeline labels, only from the practice's own consented photos",
    palette: { canvas: "#EFE4D2", surface: "#FAF6EF", ink: "#2A2420", muted: "#6B5F55", accent: "#A8834F", grounding: "#C5A880" },
    fonts: { display: "Instrument Serif", body: "Plus Jakarta Sans" },
    cta: { primary: "Book consultation", secondary: "Explore treatments" },
    look: "a warm alabaster-champagne light canvas, refined serif display type, soft neutral surfaces and one champagne-bronze accent",
  },
  {
    key: "dentist",
    label: "Dental practice",
    tone: "dark",
    studioTransition: "dark-to-light",
    hero: "a welcoming patient hero with gentle-care wording and the emergency line only if the practice offers it",
    signatureWidget: "an insurance and membership checker tab_group listing only plans the practice accepts",
    palette: { canvas: "#0F172A", surface: "#18233A", ink: "#F1F6FB", muted: "#A7B4C6", accent: "#0EA5E9", grounding: "#14B8A6" },
    fonts: { display: "Outfit", body: "Inter" },
    cta: { primary: "Schedule a new patient visit", secondary: "Emergency dental care" },
    look: "a calm navy canvas with teal structure and a sky-blue action colour, friendly geometric type, generous whitespace",
  },
  {
    key: "law-firms",
    label: "Law firms",
    tone: "dark",
    studioTransition: "dark-to-light",
    hero: "a stately authority hero with the attorneys' real bar admissions only if supplied",
    signatureWidget: "a practice-area triage tab_group \"What kind of case?\" that ends in the confidential case-review form",
    palette: { canvas: "#020617", surface: "#0C1326", ink: "#F7F3E8", muted: "#BDB6A5", accent: "#B45309", grounding: "#1E293B" },
    fonts: { display: "DM Serif Display", body: "IBM Plex Sans" },
    cta: { primary: "Request a free case evaluation", secondary: "Speak with an attorney" },
    look: "a midnight navy canvas with brass action colour and ivory ink, a classic serif display face; never guaranteed outcomes or settlement figures",
  },
  {
    key: "real-estate",
    label: "Real estate",
    tone: "dark",
    studioTransition: "dark-to-light",
    hero: "an architectural cinematic hero of a real listing or the agent's market",
    signatureWidget: "a neighbourhood tab_group plus a valuation quote_calculator that leads to a real comparative analysis request",
    palette: { canvas: "#15120D", surface: "#1F1C16", ink: "#F5F5F4", muted: "#B8B8B5", accent: "#C9A227", grounding: "#E5E5E5" },
    fonts: { display: "Cormorant Garamond", body: "Manrope" },
    cta: { primary: "Get a home valuation", secondary: "Schedule a private showing" },
    look: "an obsidian canvas with platinum structure and a restrained gold accent, a high-contrast serif display face, wide architecture photography",
  },
  {
    key: "gyms-fitness",
    label: "Gyms and fitness studios",
    tone: "dark",
    studioTransition: "dark-only",
    hero: "a high-energy kinetic hero with the trial-pass offer only if the owner runs one",
    signatureWidget: "a class timetable tab_group (by programme) from the owner's real schedule",
    palette: { canvas: "#1A1512", surface: "#25201C", ink: "#FAFAFA", muted: "#B5B5B5", accent: "#EA580C", grounding: "#DC2626" },
    fonts: { display: "Bebas Neue", body: "Barlow" },
    cta: { primary: "Claim your free pass", secondary: "View class schedule" },
    look: "an iron-black canvas with a hot orange action colour, tall condensed display type, bold diagonal energy",
  },
];

/** Every trade playbook or archetype that is not one of the 14, mapped to the closest blueprint. */
const CLOSEST: Record<string, TradeBlueprintKey> = {
  // Specific playbooks.
  locksmith: "plumbing",
  towing: "plumbing",
  electrical: "hvac",
  solar: "hvac",
  "appliance-repair": "hvac",
  "garage-door": "hvac",
  "exterior-cleaning": "pressure-washing",
  pool: "pressure-washing",
  painting: "roofing",
  contracting: "roofing",
  moving: "cleaning",
  pest: "cleaning",
  "auto-repair": "auto-detailing",
  "medical-wellness": "dentist",
  "photo-creative": "real-estate",
  "professional-services": "law-firms",
  education: "dentist",
  // Archetypes.
  "emergency-dispatch": "plumbing",
  "tech-growth": "hvac",
  "clinical-trust": "dentist",
  "hospitality-lifestyle": "restaurants",
  "precision-craft": "roofing",
  "home-services": "cleaning",
};

const BY_KEY = new Map<string, TradeBlueprint>(TRADE_BLUEPRINTS.map((b) => [b.key, b]));

/** The blueprint for a playbook or archetype key, or null for the general fallback. */
export function blueprintForKey(key: string | null | undefined): TradeBlueprint | null {
  if (!key) return null;
  const direct = BY_KEY.get(key);
  if (direct) return direct;
  const closest = CLOSEST[key];
  return closest ? BY_KEY.get(closest) ?? null : null;
}

/** The look line for the design prompt: the blueprint's palette, type and CTA, or null for the general fallback. */
export function blueprintLookNote(blueprint: TradeBlueprint | null): string | null {
  if (!blueprint) return null;
  const p = blueprint.palette;
  return [
    `${blueprint.label} blueprint (a starting point — the owner's own colours or fonts always win): ${blueprint.look}.`,
    `Palette roles: canvas ${p.canvas}, raised surface ${p.surface}, ink ${p.ink}, muted ink ${p.muted}, action accent ${p.accent}, grounding ${p.grounding}.`,
    `Type: ${blueprint.fonts.display} display with ${blueprint.fonts.body} body.`,
    `Hero: ${blueprint.hero}. Signature widget: ${blueprint.signatureWidget}.`,
    `Primary action wording: "${blueprint.cta.primary}" (secondary "${blueprint.cta.secondary}"), adapted only to services the owner really offers.`,
    blueprint.tone === "dark"
      ? blueprint.studioTransition === "dark-to-light"
        ? `Section flow: open with ONE dark cinematic scene on the ${p.canvas} canvas, then every following section sits on a light ${p.ink} canvas with ${p.canvas} ink — a single intentional dark-to-light hand-off, never back to dark.`
        : `Section flow: every section stays on the dark ${p.canvas} canvas — no light bands.`
      : null,
  ].filter(Boolean).join(" ");
}

/** The stored `Heading|Body` font preference for a blueprint, used only when the site has none. */
export function blueprintFontPreference(blueprint: TradeBlueprint | null): string | null {
  return blueprint ? `${blueprint.fonts.display}|${blueprint.fonts.body}` : null;
}
