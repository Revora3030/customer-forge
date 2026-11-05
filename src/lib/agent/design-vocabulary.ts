/**
 * LPL-3: the DESIGN stage's shared vocabulary.
 *
 * Owners say "make it bento", "add a logo wall", "a pricing table", "a
 * timeline". This maps those names to the composition primitives that already
 * exist, so the designer can honour the request with real building blocks.
 *
 * It is names and a how-to, never a default look and never a picker. Nothing
 * here runs on the owner's words (no keyword matching): the model reads the
 * list and decides whether any entry fits THIS business. Every entry says what
 * facts it needs, so a stats strip never invents a number and a logo wall never
 * shows a partner nobody named. Entries marked `available: false` are things
 * the builder cannot render today; the model must not invent a primitive for
 * them.
 *
 * Repo rule (AGENTS.md): creative choices stay AI-authored; this only raises
 * the bar and gates truth.
 */
import { COMPOSITION_PRIMITIVES, type CompositionPrimitive } from "@/lib/builder/composition-tree";

export type DesignVocabularyEntry = {
  /** What an owner might call it. */
  name: string;
  /** How to build it from existing primitives, in one line. */
  how: string;
  /** Primitives it uses. Must all exist in COMPOSITION_PRIMITIVES (tested). */
  primitives: readonly CompositionPrimitive[];
  /** Facts it needs. It must be left out when they are missing. */
  needs?: string;
  /** False = not renderable today; the model says so instead of faking it. */
  available: boolean;
};

export const DESIGN_VOCABULARY: readonly DesignVocabularyEntry[] = [
  { name: "hero (outcome-led, split, or full-bleed picture)", how: "one hero per page; a heading + sub + one button over a real picture (media with a scrim) or beside it in a two-column grid", primitives: ["grid", "heading", "text", "button", "media"], available: true },
  { name: "layered / cinematic hero", how: "one declarative layered hero stage, only with the business's own real pictures", primitives: ["cinematic_hero_stage"], needs: "real pictures the owner supplied", available: true },
  { name: "bento grid", how: "a grid whose tiles use different style.span and aspect values: one large tile, smaller ones around it, each a card with a heading, a line of copy and optionally a picture", primitives: ["grid", "card", "media", "heading", "text"], available: true },
  { name: "pricing tiers", how: "side-by-side offer_cards, or a service_tier_fader (Good / Better / Best) for 2-4 packages; each names a real service exactly as supplied, and its price and duration are filled in from the Services tool (never type a price)", primitives: ["offer_card", "service_tier_fader", "grid"], needs: "services the owner has listed with prices; with none, use a quote or booking button instead of a price", available: true },
  { name: "service cards / collection", how: "a snap-scrolling collection_row of offer_cards, or a grid of cards", primitives: ["collection_row", "offer_card", "grid", "card"], available: true },
  { name: "stats strip", how: "a row of 3-4 heading + text pairs, each a big figure with a short label", primitives: ["row", "heading", "text"], needs: "figures the business supplied (years trading, jobs done). No measured figure, no stats strip", available: true },
  { name: "logo wall / logo cloud", how: "a marquee or a row of small media items", primitives: ["marquee", "row", "media"], needs: "companies the customer actually named as clients, partners or platforms. Otherwise omit it", available: true },
  { name: "testimonials / social proof", how: "a quote primitive per review, or the review_wall widget", primitives: ["quote", "widget"], needs: "real reviews from the business. Never write one", available: true },
  { name: "timeline / process steps", how: "numbered steps as a list, a grid of cards, or scroll_chapters when each step deserves a scene", primitives: ["list", "grid", "card", "scroll_chapters"], available: true },
  { name: "tabs / segmented control", how: "tabs or tab_group for content that is parallel (services by type); toggle for a two-way switch such as monthly / one-off", primitives: ["tabs", "tab_group", "toggle"], available: true },
  { name: "FAQ", how: "faq_accordion, with the questions the business's customers actually ask", primitives: ["faq_accordion", "accordion"], available: true },
  { name: "before / after", how: "before_after_slider with two real pictures of the same subject", primitives: ["before_after_slider"], needs: "a real before picture and a real after picture", available: true },
  { name: "gallery / portfolio", how: "gallery of the business's own pictures; a collection_row for a swipeable strip", primitives: ["gallery", "collection_row", "media"], needs: "the owner's own pictures", available: true },
  { name: "split story / sticky split", how: "sticky_split_story: a picture stays while the copy scrolls beside it", primitives: ["sticky_split_story"], available: true },
  { name: "comparison table", how: "compare for 'us vs. the usual' or option-vs-option, only on facts the business gave", primitives: ["compare"], needs: "facts the business gave", available: true },
  { name: "sticky call / book bar (phones)", how: "mobile_sticky_bar with the real phone and booking action", primitives: ["mobile_sticky_bar"], needs: "a verified phone number or booking link", available: true },
  { name: "contact / quote form", how: "the working enquiry_form, quote_calculator or booking_form widget; its data and delivery are the app's", primitives: ["widget"], available: true },
  { name: "breadcrumbs, pagination, drawer, command palette, date-time picker, combobox", how: "not building blocks the site builder has today. Say so plainly and offer the nearest real thing (tabs, an accordion, the booking_form widget)", primitives: [], available: false },
];

/** The vocabulary as a short block for the DESIGN stage prompt. */
export function designVocabularyBrief(entries: readonly DesignVocabularyEntry[] = DESIGN_VOCABULARY): string {
  const have = entries.filter((entry) => entry.available);
  const missing = entries.filter((entry) => !entry.available);
  return [
    "DESIGN VOCABULARY — names an owner may use, mapped to building blocks this builder really has.",
    "Use an entry only when it fits THIS business and its page; never to decorate. When the owner names one (\"make it bento\"), build it from the primitives listed, in your own style and copy. It is a vocabulary, not a template, and you are never required to use any of it.",
    ...have.map((entry) => `- ${entry.name}: ${entry.how} [${entry.primitives.join(", ")}]${entry.needs ? ` Needs: ${entry.needs}.` : ""}`),
    ...missing.map((entry) => `- NOT AVAILABLE: ${entry.name} — ${entry.how}.`),
    "If an entry's needed facts are missing, leave that entry out rather than inventing them.",
  ].join("\n");
}

/** Guard for tests and callers: every primitive named in the vocabulary exists. */
export function unknownVocabularyPrimitives(entries: readonly DesignVocabularyEntry[] = DESIGN_VOCABULARY): string[] {
  const known = new Set<string>(COMPOSITION_PRIMITIVES);
  return entries.flatMap((entry) => entry.primitives.filter((primitive) => !known.has(primitive)));
}
