/**
 * Adapter from the Site Factory playbook catalog (playbook-catalog.generated.ts, 53 categories) into the builder's
 * own playbook, blueprint and prompt-note system. The catalog is data; this module is the only place that decides
 * how it maps, so no category is hand-written twice:
 *
 *  - Categories the builder already had a trade playbook for (plumbing, roofing, dentist, ...) keep that playbook;
 *    the catalog adds a CATALOG PLAYBOOK block (signature tool, section order, truth rules) to its prompt note.
 *  - Five categories (jet ski / boat rental, golf, home builder, luxury tower, condo floor selector) get their own
 *    playbook at the top of the list, so a broader word in the same industry text never steals them. Three of them
 *    also get their own blueprint (palette, type, calls to action) built from the catalog's design block.
 *  - Every other catalog category becomes a new playbook ahead of the existing ones, because the existing broad
 *    patterns (contracting, photo-creative, restaurants...) would otherwise shadow them. Their words are bounded
 *    so they do not take a business that belongs elsewhere.
 *
 * The catalog's aliases are loose ("interior", "team", "developer", "bar"), so they are filtered and bounded
 * before they become a pattern. Nothing here carries a client fact: prices, rates, specs, counts and stats are the
 * owner's, and the notes say so.
 */
import { PLAYBOOK_CATALOG, type CatalogEntry } from "@/lib/builder/playbook-catalog.generated";
import type { ArchetypeKey, TradePlaybook } from "@/lib/builder/industry-playbook";
import type { TradeBlueprint, TradeBlueprintKey } from "@/lib/builder/trade-blueprints";

/** Catalog categories that enrich a playbook the builder already had (catalog slug -> existing playbook key). */
export const CATALOG_TO_EXISTING: Readonly<Record<string, string>> = {
  "pressure-washing": "pressure-washing",
  "auto-detailing": "auto-detailing",
  painting: "painting",
  roofing: "roofing",
  landscaping: "landscaping",
  cleaning: "cleaning",
  "pest-control": "pest",
  "pool-service": "pool",
  moving: "moving",
  hvac: "hvac",
  plumbing: "plumbing",
  electrical: "electrical",
  solar: "solar",
  "law-firm": "law-firms",
  "med-spa": "med-spa",
  "hair-stylists": "salons-barbers",
  barbers: "salons-barbers",
  beauty: "salons-barbers",
  fitness: "gyms-fitness",
  photography: "photo-creative",
  "restaurant-cafe": "restaurants",
  dental: "dentist",
  "garage-door": "garage-door",
  locksmith: "locksmith",
  "auto-repair": "auto-repair",
  "real-estate-agent": "real-estate",
  chiropractic: "medical-wellness",
  "tutoring-lessons": "education",
  "martial-arts-yoga": "gyms-fitness",
  "tree-service": "landscaping",
  // These sit under a broader playbook that already matches their words; the catalog entry whose words fit is chosen for the note.
  "massage-spa": "salons-barbers",
  "accounting-tax": "professional-services",
  "insurance-agency": "professional-services",
};

/** The categories that get their own playbook at the top of the list, with curated match words. */
const PRIORITY_SLUGS: ReadonlySet<string> = new Set(["watersports-rentals", "golf-course", "home-builder", "luxury-real-estate-tower", "condo-floor-selector"]);

/** Per-category edits to the catalog's match words: drop ones that name another business, add common phrasings. */
const ALIAS_RULES: Readonly<Record<string, { drop?: readonly string[]; extra?: readonly string[] }>> = {
  // "wedding" alone also names a photographer or a florist.
  "wedding-event-venue": { drop: ["wedding"], extra: ["wedding (?:venue|barn|estate|event)"] },
  // "catering" alone also names a restaurant that caters.
  "catering-food-truck": { drop: ["catering"], extra: ["catering (?:company|service|business)"] },
  "tree-service": { extra: ["stump (?:grinding|removal)", "arborist"] },
  "watersports-rentals": { extra: ["water ?craft", "water ?sports?", "sea-?doo", "pontoon", "paddle\\s?-?board", "kayak (?:rental|tour)", "boat (?:club|hire)", "parasail", "flyboard"] },
  "golf-course": { extra: ["mini[ -]?golf", "putt"] },
  // A remodeler or general contractor is a different business: those words stay with the contracting playbook.
  "home-builder": { drop: ["remodel(er|ing)?", "general contractor", "kitchen (and|&)? ?bath"], extra: ["(?:luxury|custom|bespoke|high[- ]end|residential)\\s+(?:home|house)\\s*build"] },
  // "luxury real estate" and "developer" also name an agent and a software developer: not matched here.
  "luxury-real-estate-tower": { drop: ["luxury real estate", "developer"] },
  "condo-floor-selector": { drop: ["condos?", "condominiums?", "floor[ -]?plans?"], extra: ["condo (?:development|building|tower|project)", "condominium (?:development|building|tower)", "pre[ -]?sale"] },
};

/** Aliases too broad to match on their own: they name other kinds of business or no business at all. */
const TOO_BROAD = new Set([
  "interior", "exterior", "construction", "install", "team", "bar", "developer", "broker", "wellness", "music",
  "tile", "carpet", "boarding", "inspection", "tires", "collision", ".*", "nails", "brows", "beauty", "skincare",
  "dance", "pilates", "paving", "driveways", "trimming", "hauling", "cleanouts", "tax[ -]?prep", "architecture[ -]?studio",
]);

/** New playbooks: the look archetype and the closest existing blueprint. */
const NEW_ROW_LOOK: Readonly<Record<string, readonly [ArchetypeKey, TradeBlueprintKey]>> = {
  "wedding-event-venue": ["hospitality-lifestyle", "restaurants"],
  tattoo: ["hospitality-lifestyle", "salons-barbers"],
  "catering-food-truck": ["hospitality-lifestyle", "restaurants"],
  "brewery-winery": ["hospitality-lifestyle", "restaurants"],
  "pet-grooming-vet": ["home-services", "cleaning"],
  "home-services": ["home-services", "cleaning"],
  "fencing-decking": ["precision-craft", "roofing"],
  flooring: ["precision-craft", "roofing"],
  "concrete-masonry": ["precision-craft", "roofing"],
  "junk-removal": ["home-services", "cleaning"],
  "interior-design": ["precision-craft", "real-estate"],
  "home-care-senior": ["clinical-trust", "dentist"],
  "florist-gifts": ["hospitality-lifestyle", "restaurants"],
  "outdoor-guide-charter": ["hospitality-lifestyle", "landscaping"],
  // The five priority categories.
  "watersports-rentals": ["hospitality-lifestyle", "watersports-rentals"],
  "golf-course": ["hospitality-lifestyle", "golf-course"],
  "home-builder": ["precision-craft", "home-builder"],
  "luxury-real-estate-tower": ["precision-craft", "real-estate"],
  "condo-floor-selector": ["precision-craft", "real-estate"],
};

const BY_SLUG = new Map<string, CatalogEntry>(PLAYBOOK_CATALOG.map((e) => [e.slug, e]));

function aliasPattern(entry: CatalogEntry): RegExp | null {
  const rule = ALIAS_RULES[entry.slug];
  const drop = new Set(rule?.drop ?? []);
  const words = [...entry.aliases.filter((a) => !drop.has(a) && !TOO_BROAD.has(a.toLowerCase())), ...(rule?.extra ?? [])];
  if (words.length === 0) return null;
  return new RegExp(`\\b(?:${words.join("|")})`, "i");
}

/** "[RATE:rental_rate]" -> "rate: rental rate". */
function humanKey(key: string): string {
  const m = /^\[([A-Z]+):(.+)\]$/.exec(key);
  return m ? `${m[1]!.toLowerCase()}: ${m[2]!.replace(/_/g, " ")}` : key;
}

function playbookFromCatalog(entry: CatalogEntry, match: RegExp): TradePlaybook {
  const secondary = entry.tool.secondary.length ? `, with ${entry.tool.secondary.join(" and ")}` : "";
  return {
    key: entry.slug,
    label: entry.label,
    match,
    signature: `${entry.hero.concept} Lead tool "${entry.tool.name}" (${entry.tool.component}, ${entry.tool.mode} mode${secondary}).`,
    storyArc: entry.sections.filter((s) => s.id !== "hero").map((s) => s.label),
    needsFromOwner:
      `Owner-supplied values, never defaulted: ${entry.tool.ownerKeys.map(humanKey).join(", ")}. ` +
      `Omit when missing: ${entry.truth.omitIfMissing.join("; ")}.`,
  };
}

const isPriority = (slug: string) => PRIORITY_SLUGS.has(slug);

/** Playbooks for the five priority categories. First in the list so a broader trade word never steals them. */
export const CATALOG_PRIORITY_PLAYBOOKS: readonly TradePlaybook[] = PLAYBOOK_CATALOG.filter((e) => isPriority(e.slug)).flatMap((e) => {
  const match = aliasPattern(e);
  return match ? [playbookFromCatalog(e, match)] : [];
});

/** Playbooks for every catalog category with no existing playbook and no priority row. After the priority rows, ahead of the existing ones. */
export const CATALOG_NEW_PLAYBOOKS: readonly TradePlaybook[] = PLAYBOOK_CATALOG.filter(
  (e) => !isPriority(e.slug) && !(e.slug in CATALOG_TO_EXISTING) && e.slug !== "generic-fallback",
).flatMap((e) => {
  const match = aliasPattern(e);
  return match ? [playbookFromCatalog(e, match)] : [];
});

/** Look archetype and closest blueprint for each playbook this module adds. */
export const CATALOG_ARCHETYPE: Readonly<Record<string, ArchetypeKey>> = Object.fromEntries(
  Object.entries(NEW_ROW_LOOK).map(([slug, [archetype]]) => [slug, archetype]),
);
export const CATALOG_CLOSEST_BLUEPRINT: Readonly<Record<string, TradeBlueprintKey>> = Object.fromEntries(
  Object.entries(NEW_ROW_LOOK).filter(([slug]) => !["watersports-rentals", "golf-course", "home-builder"].includes(slug)).map(([slug, [, blueprint]]) => [slug, blueprint]),
);
/** Slugs added here that are trades priced by an estimate (see ESTIMATE_TRADE_KEYS in reference-standard.ts). */
export const CATALOG_ESTIMATE_TRADES: readonly string[] = ["tree-service", "fencing-decking", "flooring", "concrete-masonry", "junk-removal", "home-services"];

/* ---------- blueprints for the three dedicated categories ---------- */

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** A structural tone between the surface and the accent, so the palette has its third role without a new colour. */
function grounding(surface: string, accent: string): string {
  const [s, a] = [hex(surface), hex(accent)];
  return `#${s.map((v, i) => Math.round(v! + (a[i]! - v!) * 0.18).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
/** The catalog pairs its display face with Inter, which the site renderer treats as a stock face: use the repo's own body face. */
const BODY_FOR_DISPLAY: Readonly<Record<string, string>> = { Unbounded: "Manrope", "Cormorant Garamond": "Manrope", "Instrument Serif": "Plus Jakarta Sans" };

function blueprintFromCatalog(slug: "watersports-rentals" | "golf-course" | "home-builder", look: string): TradeBlueprint {
  const e = BY_SLUG.get(slug)!;
  return {
    key: slug,
    label: e.label.replace(/ & brands$/, "").replace(/^Jet ski \/ boat \/ powersports rentals$/, "Jet ski, boat and powersports rentals"),
    tone: "dark",
    studioTransition: "dark-only",
    hero: e.hero.concept,
    signatureWidget: `${e.tool.name} (${e.tool.component}, ${e.tool.mode} mode)`,
    palette: { canvas: e.palette.base, surface: e.palette.surface, ink: e.palette.text, muted: e.palette.muted, accent: e.palette.accent, grounding: grounding(e.palette.surface, e.palette.accent) },
    fonts: { display: e.fonts.display, body: e.fonts.body === "Inter" ? BODY_FOR_DISPLAY[e.fonts.display] ?? "Manrope" : e.fonts.body },
    cta: { primary: e.hero.primaryCta, secondary: e.hero.secondaryCta ?? e.hero.primaryCta },
    look,
  };
}

export const CATALOG_BLUEPRINTS: readonly TradeBlueprint[] = [
  blueprintFromCatalog("watersports-rentals", "deep ocean canvas with a lime action colour used only on the reserve action, wide display type, dark glass cards over moving water"),
  blueprintFromCatalog("golf-course", "forest canvas with a flag-red action colour used only on the tee-time action, serif display headlines, dark glass bar"),
  blueprintFromCatalog("home-builder", "warm earth canvas with a brass action colour, quiet serif display type, dark glass panels and generous space around each build stage"),
];

/** Try-it and dial moments for the playbooks this module adds, derived from each category's signature tool. */
export const CATALOG_MOMENTS: Readonly<Record<string, { tryIt: string; dial: string }>> = Object.fromEntries(
  PLAYBOOK_CATALOG.filter((e) => e.slug in NEW_ROW_LOOK).map((e) => [
    e.slug,
    {
      tryIt: `the signature tool "${e.tool.name}" (${e.tool.component}, ${e.tool.mode} mode) made hands-on, taking ${e.tool.inputs.join("; ")}; every figure it shows is the owner's own value, and without one it asks instead of showing a number`,
      dial: "the right option per customer need, only options the business actually offers",
    },
  ]),
);

/* ---------- the prompt block ---------- */

/** Catalog entries for a playbook key: the catalog category of the same name, or the ones mapped onto it. */
function entriesFor(key: string): CatalogEntry[] {
  return PLAYBOOK_CATALOG.filter((e) => e.slug === key || CATALOG_TO_EXISTING[e.slug] === key);
}

/** The catalog entry for an industry under a playbook key. With several (hair, barber, beauty), the one whose words match. */
export function catalogEntryFor(key: string | null | undefined, industry: string | null | undefined): CatalogEntry | null {
  if (!key) return null;
  const entries = entriesFor(key);
  if (entries.length <= 1) return entries[0] ?? null;
  const text = (industry ?? "").trim();
  return entries.find((e) => aliasPattern(e)?.test(text)) ?? entries[0]!;
}

/**
 * One block of prompt text from the catalog entry: the signature tool, the section order and the truth rules. Ideas
 * for the designer, in the same spirit as the trade playbook: the owner's material and the truth rules decide.
 */
export function catalogNote(entry: CatalogEntry | null): string | null {
  if (!entry) return null;
  const lines = [
    `CATALOG PLAYBOOK (${entry.label}; ideas, never facts — every [RATE], [CAP], [SPEC] and [OWNER] value is the owner's, and a missing one hides the number or switches the tool to request-only):`,
    `Opening: ${entry.hero.component}; main action "${entry.hero.primaryCta}"${entry.hero.secondaryCta ? `, second action "${entry.hero.secondaryCta}"` : ""}. Scroll effect: ${entry.scroll.component}.`,
    `Signature tool: ${entry.tool.name} (${entry.tool.component}, ${entry.tool.mode} mode). Inputs: ${entry.tool.inputs.join("; ")}. Output: ${entry.tool.output}`,
    `Sections, top to bottom: ${entry.sections.map((s) => `${s.label} (${s.component}${s.omitIfMissing ? ", hide if its owner data is missing" : ""})`).join(" → ")}.`,
    `Omit when the owner has not supplied it: ${entry.truth.omitIfMissing.join("; ")}.`,
  ];
  if (entry.truth.disclaimers.length) lines.push(`Required wording: ${entry.truth.disclaimers.join(" ")}`);
  if (entry.hero.component === "HeroVideo" || entry.scroll.component === "ScrubVideo")
    lines.push("Motion: with prefers-reduced-motion the hero loop shows its poster frame with a visible play/pause control instead of nothing; the renderer does this, so never design the hero as video-only.");
  if (entry.tool.mode === "configure")
    lines.push("Never an instant price here: selections go to the consult request, and a budget figure appears only from rates the owner set.");
  if (entry.tool.component === "BookingPicker")
    lines.push(
      "Booking is request mode: it sends a booking request and never shows a time as open, held or confirmed. A price line appears only when the owner set the rate. " +
        "If the owner supplied their own booking or tee-sheet URL, add one secondary link button to it (opens in a new tab, rel noopener); with no URL, leave it out. Never invent the URL.",
    );
  return lines.join("\n");
}
