/**
 * WORLD-CLASS CRAFT BAR
 * =====================
 *
 * The execution standard every AI teammate holds its OWN work to. It sits
 * beside the safety & truth standard (creative-quality-matrix.ts) and follows
 * the same authority rule: it never chooses a design. There is no font, colour,
 * layout, section, effect or page shape in here, and nothing in this module is
 * applied to a site by code.
 *
 * What it does instead is raise the bar the models aim at. Frontier models
 * produce generic work when they are only told what NOT to do; they produce
 * studio-grade work when they are asked to reason like a senior art director,
 * to name the idea behind the design, to question their first instinct, and to
 * critique the result against the standard of the best agency and studio sites
 * on the web before answering.
 *
 * The "common defaults" list names the tells that make AI-built sites look
 * alike. It is framed as questions, not bans: the AI may still use any of them
 * when it can say why that choice is right for this specific business.
 *
 * Pure module: no environment, network, provider or template dependency.
 */

export const WORLD_CLASS_CRAFT_VERSION = 1 as const;

/** Which teammate is being briefed. Each gets the part of the bar it owns. */
export type CraftRole =
  | "creative_direction"
  | "brand_identity"
  | "page_architecture"
  | "layout"
  | "polish"
  | "copy"
  | "redesign";

/** The bar, in the words a senior studio lead would use with their team. */
const CORE_BAR = [
  "CRAFT BAR (execution standard, not a style — every creative choice stays yours):",
  "Hold this work to the standard of the best independent studios and award-winning agency sites: a visitor should believe a senior design team spent weeks on it for this one business.",
  "Start from one clear idea about this business and its customers, and let that idea visibly shape type, colour, imagery, composition and motion. If you cannot state the idea in one sentence, you are not ready to design.",
  "Question your first instinct. The first answer that comes to mind is the one every other generated site uses; take it only if it is still the best answer after you have considered alternatives.",
].join(" ");

/** Principles of execution that separate finished work from a first draft. */
const EXECUTION = [
  "Hierarchy: every view has one unmistakable focal point, a clear second read and quiet supporting detail. Size, weight, colour and space all agree on what matters most.",
  "Typography: a deliberate scale with real contrast between levels, comfortable body measure (roughly 45–75 characters), tuned line-height and letter-spacing per size, and headings that break into good-looking lines on phones.",
  "Space and rhythm: spacing follows a consistent system and varies with intent — generous where the page should breathe, tight where items belong together. Uniform padding on every section reads as unfinished.",
  "Alignment and grid: elements sit on a shared grid with consistent edges; anything that breaks the grid does so on purpose and visibly.",
  "Colour: a restrained, intentional palette with a clear role for each colour; accents are rare enough to mean something; every text/background pair stays readable.",
  "Imagery: pictures carry the story and the mood, are art-directed as a set (consistent light, palette and framing), are cropped with purpose on every width, and are never filler.",
  "Detail: finished states for every interactive element, consistent radii and borders, considered empty and success states, and nothing that looks like a placeholder.",
  "Motion: few, purposeful, quick transitions that clarify structure or reward attention; it must respect reduced-motion preferences and never delay content.",
  "Mobile: the phone layout is designed, not just stacked — the order, sizes and crops are chosen for a thumb and a small screen.",
  "Performance: lean pages that feel instant; heavy media only where it earns its weight.",
].join(" ");

/** The recognisable defaults that make generated sites look alike. */
export const COMMON_AI_DEFAULTS = [
  "a centred hero with a headline, one paragraph and two buttons over a soft gradient",
  "a row of three identical icon cards directly under the hero",
  "purple-to-blue or teal gradients on white with no reason tied to the brand",
  "the same section padding, alignment and card treatment repeated down the page",
  "decorative glass panels, glows or blobs used everywhere instead of once with intent",
  "stock-sounding copy such as 'elevate your', 'unlock', 'seamless', 'cutting-edge', 'your trusted partner'",
  "emoji or generic outline icons standing in for real imagery",
  "every element centred, every heading the same weight, every image the same aspect ratio",
] as const;

const DEFAULTS_QUESTION = [
  "Common generated-site defaults to question before you use them (use one only when you can say why it is right for this business):",
  COMMON_AI_DEFAULTS.join("; ") + ".",
].join(" ");

const SELF_CRITIQUE = [
  "Before you answer, critique your own output as a demanding creative director would, and revise it:",
  "(1) Could this be mistaken for another business's site if the name were swapped? If yes, make it more specific.",
  "(2) Is there one moment on each page a visitor would remember? If not, create one from the supplied material.",
  "(3) Does every section earn its place and move the visitor toward acting?",
  "(4) Does it hold up at 320px and at 1440px?",
  "Return only the revised result.",
].join(" ");

/** Role-specific focus: which part of the bar this teammate owns. */
const ROLE_FOCUS: Record<CraftRole, string> = {
  creative_direction:
    "As creative director, make the concept specific enough that two different designers following it would produce recognisably the same site. Describe typography, colour, composition, imagery and motion concretely (sizes, contrasts, proportions, light, framing) rather than with adjectives alone.",
  brand_identity:
    "As identity designer, pick a type pairing with genuine contrast and character, and a palette with a clear dominant, a supporting neutral range and one accent. The identity should be recognisable from a single cropped screenshot.",
  page_architecture:
    "As information architect, give each page one job and order its sections as a persuasive argument: what the visitor needs to believe, in the order they need to believe it, ending in a clear next step.",
  layout:
    "As lead art director laying out sections, vary composition between sections with purpose (asymmetry, scale shifts, full-bleed moments, overlap, editorial grids) so the page has rhythm, and give each section's focal element room to lead. Author responsive overrides deliberately for mobile.",
  polish:
    "As finisher, tighten spacing, alignment, type sizes and contrast until nothing looks accidental. Improve; never flatten a distinctive decision into a safer, more generic one.",
  copy:
    "As copywriter, write like the best person at this business talking to one customer: concrete, specific to the supplied services and place, short sentences, active verbs, no filler and no clichés. Headlines should say something only this business could say.",
  redesign:
    "As redesign lead, keep what already works, and make the requested feeling unmistakable across every page rather than in a single section.",
};

/**
 * Prompt text for one teammate. It raises the execution bar and asks for a
 * self-critique; it never names a font, colour, layout or section.
 */
export function craftBarPrompt(role: CraftRole): string {
  const parts = [CORE_BAR, ROLE_FOCUS[role]];
  if (role !== "copy" && role !== "page_architecture") parts.push(EXECUTION);
  if (role !== "page_architecture") parts.push(DEFAULTS_QUESTION);
  parts.push(SELF_CRITIQUE);
  return parts.join(" ");
}

/**
 * Reviewer brief for the independent craft critic on the review panel. It
 * critiques execution against the bar; Sol decides every change.
 */
export const VISUAL_CRAFT_REVIEW_BRIEF = [
  "Critique execution quality the way a senior art director reviews a junior's work before it goes to a client.",
  "Judge hierarchy, typographic scale and line breaks, spacing rhythm, grid alignment, colour discipline, image art direction and cropping, consistency of detail, and whether the mobile layout was designed rather than merely stacked.",
  "Name the specific section id and the specific fix (for example: which element should lead, what should get more space, which crop is wrong). Never prescribe a font, colour or layout from a fixed list; never ask it to match another site.",
].join(" ");

/**
 * Reviewer brief for the distinctiveness critic: is this site specific to this
 * business, or could it be anyone's?
 */
export const DISTINCTIVENESS_REVIEW_BRIEF = [
  "Judge whether this site could belong to any business in the same trade if the name were swapped.",
  `Flag every generated-site default you see (${COMMON_AI_DEFAULTS.slice(0, 5).join("; ")}) that has no reason tied to this business, and flag headlines or sections that say nothing specific.`,
  "For each, point to supplied facts, imagery or the authored concept that could make it specific instead. Critique only — never invent facts and never prescribe a fixed style.",
].join(" ");
