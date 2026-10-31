/**
 * QP-1 · Blueprint-first loader.
 *
 * Every generation starts from a trade blueprint: the layout (section order), palette, type pairing, hero, calls to
 * action and signature tool for the business's category. This module is the single entry point that guarantees one is
 * always found. It never returns null and never leaves a build on a blank page:
 *
 *   1. trade        the builder's own trade playbook matches the industry words
 *   2. alias        a Revora alias word or phrase maps to a catalog category (for example "lawn care", "handyman")
 *   3. archetype    the business's look archetype (precision craft, clinical trust, ...) picks the closest category
 *   4. generic      the catalog's "generic-fallback" category, used when there is nothing to go on at all
 *
 * The data comes from the existing catalog (`playbook-catalog.generated.ts`, the 53 Site Factory category files) and
 * the existing playbook / blueprint code. Nothing here is a client fact: a blueprint is a design starting point, and
 * every figure, price, rating and proof item stays the owner's own.
 *
 * Pure module: no environment, no network, no secrets.
 */
import { PLAYBOOK_CATALOG, type CatalogEntry } from "@/lib/builder/playbook-catalog.generated";
import { catalogEntryFor, catalogNote } from "@/lib/builder/playbook-catalog";
import { archetypeFor, blueprintFor, guidanceFor, playbookFor, playbookNote } from "@/lib/builder/industry-playbook";
import { referenceStandardNote } from "@/lib/builder/reference-standard";
import type { TradeBlueprint } from "@/lib/builder/trade-blueprints";

export type BlueprintSource = "trade" | "alias" | "archetype" | "generic";

export type BlueprintPalette = { base: string; surface: string; accent: string; onAccent: string; text: string; muted: string };

export type LoadedBlueprint = {
  /** How the blueprint was found. Logged by the learning loop so weak matches can be improved. */
  source: BlueprintSource;
  /** The words or key that produced the match, for the log. */
  matchedBy: string;
  /** Catalog category slug the blueprint data comes from. Always one of the catalog's slugs. */
  slug: string;
  label: string;
  archetypeKey: string | null;
  palette: BlueprintPalette;
  fonts: { display: string; body: string };
  hero: { concept: string; component: string; primaryCta: string; secondaryCta: string | null };
  /** Section order, top to bottom. `omitIfMissing` sections are hidden when the owner has not supplied their data. */
  sections: readonly { id: string; label: string; component: string; omitIfMissing: boolean }[];
  scrollComponent: string;
  signatureTool: { id: string; name: string; component: string; mode: string; inputs: readonly string[]; output: string };
  /** Owner-supplied keys the signature tool needs ([RATE:..], [CAP:..] ...). Missing ones switch the tool to request-only. */
  ownerKeys: readonly string[];
  /** Things to leave out unless the owner supplied them. */
  omitIfMissing: readonly string[];
  disclaimers: readonly string[];
  schemaType: string;
  /** The builder's own trade blueprint (14 core trades plus 3), when there is one. */
  tradeBlueprint: TradeBlueprint | null;
  /** The prompt text for the design and copy steps. */
  promptBlock: string;
};

/**
 * Words that name a business the builder's trade patterns do not catch, mapped to a catalog slug. Checked after the
 * trade playbook and before the archetype fallback. Case-insensitive, whole-word where it matters.
 */
export const BLUEPRINT_ALIASES: readonly (readonly [RegExp, string])[] = [
  [/\b(lawns?|garden\w*|mow\w*|turf|hedges?|yard (?:work|care|maintenance|clean ?up)|hardscap\w*|landscap\w*)\b/i, "landscaping"],
  [/\b(handy ?man|handyperson|odd jobs?|home repair|property maintenance)\b/i, "home-services"],
  [/\b(drywall|plaster|carpent\w*|cabinet\w*|remodel\w*|renovat\w*|general contractor)\b/i, "home-services"],
  [/\b(gutter\w*|siding|window (?:cleaning|washing)|soft ?wash\w*|power ?wash\w*)\b/i, "pressure-washing"],
  [/\b(maid|janitorial|carpet clean\w*|house ?keeping|deep clean\w*)\b/i, "cleaning"],
  [/\b(car wash|ceramic coating|paint correction|mobile detail\w*)\b/i, "auto-detailing"],
  [/\b(mechanic|oil change|brake shop|tire shop|body shop|collision)\b/i, "auto-repair"],
  [/\b(a\/?c repair|air conditioning|furnace|heat pump|ductwork)\b/i, "hvac"],
  [/\b(plumber|drain clean\w*|water heater|sewer|septic)\b/i, "plumbing"],
  [/\b(electrician|ev charger|panel upgrade|wiring)\b/i, "electrical"],
  [/\b(shingle\w*|roof repair|metal roof)\b/i, "roofing"],
  [/\b(exterminat\w*|termite\w*|rodent\w*|bed ?bug\w*|mosquito)\b/i, "pest-control"],
  [/\b(swimming pool|pool (?:clean\w*|repair|maintenance))\b/i, "pool-service"],
  [/\b(movers?|relocation|packing service)\b/i, "moving"],
  [/\b(haul(?:ing)?|dumpster|trash removal|cleanout)\b/i, "junk-removal"],
  [/\b(stump|arborist|tree (?:trim\w*|remov\w*|care))\b/i, "tree-service"],
  [/\b(hair (?:salon|stylist)|colorist|hair studio)\b/i, "hair-stylists"],
  [/\b(barber\w*|fade|shave)\b/i, "barbers"],
  [/\b(nail|lash|brow|facial|esthetic\w*|waxing)\b/i, "beauty"],
  [/\b(ink|tattoo\w*|piercing)\b/i, "tattoo"],
  [/\b(massage|day spa|wellness spa)\b/i, "massage-spa"],
  [/\b(botox|filler|aesthetic\w*|laser (?:hair|skin))\b/i, "med-spa"],
  [/\b(orthodont\w*|dentist\w*|dental|teeth|implants?)\b/i, "dental"],
  [/\b(chiropract\w*|physio\w*|physical therap\w*|acupunct\w*)\b/i, "chiropractic"],
  [/\b(attorney|lawyer|legal|law (?:firm|office))\b/i, "law-firm"],
  [/\b(realtor|real estate (?:agent|broker)|listing agent)\b/i, "real-estate-agent"],
  [/\b(cpa|bookkeep\w*|tax (?:prep\w*|service)|accountant)\b/i, "accounting-tax"],
  [/\b(insurance (?:agent|agency|broker))\b/i, "insurance-agency"],
  [/\b(gym|crossfit|personal train\w*|boot ?camp|pilates)\b/i, "fitness"],
  [/\b(yoga|karate|jiu[- ]?jitsu|taekwondo|martial arts?|dojo)\b/i, "martial-arts-yoga"],
  [/\b(tutor\w*|music (?:lessons?|teacher)|piano|swim lessons?|coach\w*)\b/i, "tutoring-lessons"],
  [/\b(photograph\w*|videograph\w*|studio portrait)\b/i, "photography"],
  [/\b(restaurant|cafe|café|bistro|diner|bakery|coffee shop|pizzeria|eatery)\b/i, "restaurant-cafe"],
  [/\b(food truck|caterer|catering)\b/i, "catering-food-truck"],
  [/\b(brewery|winery|distillery|taproom|vineyard)\b/i, "brewery-winery"],
  [/\b(florist|flower shop|gift shop)\b/i, "florist-gifts"],
  [/\b(wedding|event venue|banquet|reception hall)\b/i, "wedding-event-venue"],
  [/\b(groomer|grooming|veterinar\w*|vet clinic|dog (?:walker|training)|kennel)\b/i, "pet-grooming-vet"],
  [/\b(senior care|home care|caregiver|assisted living|elder care)\b/i, "home-care-senior"],
  [/\b(interior design\w*|home stag\w*|decorator)\b/i, "interior-design"],
  [/\b(locksmith|lockout|key cutting)\b/i, "locksmith"],
  [/\b(garage door|overhead door)\b/i, "garage-door"],
  [/\b(fenc(?:e|ing)|deck(?:s|ing)?|pergola)\b/i, "fencing-decking"],
  [/\b(floor(?:ing)?|hardwood|tile install\w*|epoxy)\b/i, "flooring"],
  [/\b(concrete|masonry|brick ?lay\w*|paver\w*|stucco)\b/i, "concrete-masonry"],
  [/\b(solar|photovoltaic|battery storage)\b/i, "solar"],
  [/\b(jet ?ski|boat rental|kayak|paddle ?board|pontoon|marina)\b/i, "watersports-rentals"],
  [/\b(golf|driving range|mini[- ]?golf)\b/i, "golf-course"],
  [/\b(custom home|home build\w*|residential builder)\b/i, "home-builder"],
  [/\b(fishing (?:guide|charter)|hunting guide|outfitter|charter)\b/i, "outdoor-guide-charter"],
];

/** The closest catalog category for each look archetype, used when words give no match at all. */
export const ARCHETYPE_TO_SLUG: Readonly<Record<string, string>> = {
  "precision-craft": "home-services",
  "emergency-dispatch": "locksmith",
  "clinical-trust": "chiropractic",
  "hospitality-lifestyle": "restaurant-cafe",
  "tech-growth": "generic-fallback",
  "home-services": "home-services",
  general: "generic-fallback",
};

const BY_SLUG = new Map<string, CatalogEntry>(PLAYBOOK_CATALOG.map((entry) => [entry.slug, entry]));

/** The generic category. It is part of the catalog, and the loader refuses to run without it. */
const GENERIC = BY_SLUG.get("generic-fallback");

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** The catalog slug a business belongs to, with how it was found. */
export function resolveBlueprintSlug(
  industry: string | null | undefined,
  hints: string | null | undefined = null,
): { slug: string; source: BlueprintSource; matchedBy: string } {
  const text = clean(industry);
  const extra = clean(hints);

  // 1. The builder's own trade playbook. Its key is a catalog slug, or a core trade the catalog entry maps onto.
  const trade = playbookFor(text);
  if (trade) {
    const entry = BY_SLUG.get(trade.key) ?? catalogEntryFor(trade.key, text);
    if (entry) return { slug: entry.slug, source: "trade", matchedBy: trade.key };
  }

  // 2. Alias words in the industry first, then in the description and service names.
  for (const haystack of [text, extra]) {
    if (!haystack) continue;
    const hit = BLUEPRINT_ALIASES.find(([pattern, slug]) => BY_SLUG.has(slug) && pattern.test(haystack));
    if (hit) return { slug: hit[1], source: "alias", matchedBy: hit[0].source };
  }

  // 3. The look archetype: the closest category by kind of business.
  if (text || extra) {
    const archetype = archetypeFor(text, extra);
    if (archetype) {
      const slug = ARCHETYPE_TO_SLUG[archetype.key];
      if (slug && BY_SLUG.has(slug)) return { slug, source: "archetype", matchedBy: archetype.key };
    }
  }

  // 4. Nothing to go on: the generic category.
  return { slug: "generic-fallback", source: "generic", matchedBy: "generic-fallback" };
}

function promptFor(entry: CatalogEntry, industry: string | null | undefined, hints: string | null | undefined, source: BlueprintSource): string {
  const note = playbookNote(industry, hints);
  const catalog = catalogNote(entry);
  const guide = guidanceFor(industry, hints);
  const blueprint = blueprintFor(industry, hints);
  const lines = [
    `BLUEPRINT-FIRST: build this site from the "${entry.label}" blueprint (matched by ${source}). Use its section order, palette, type pairing, signature tool and calls to action as the starting layout; the owner's real material and the truth rules decide everything else.`,
    // The catalog's note is always present. The trade note adds the builder's story arc and look when there is one.
    catalog,
    note && guide?.specific ? note : null,
    !note || !guide?.specific ? referenceStandardNote(entry.slug, blueprint) : null,
    `Palette: base ${entry.palette.base}, surface ${entry.palette.surface}, accent ${entry.palette.accent}, text ${entry.palette.text}. Type: ${entry.fonts.display} display, ${entry.fonts.body} body.`,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

/**
 * Loads the blueprint for a business. Always returns one. Pass the business's industry text and, when known, its
 * description and service names as `hints`, which are only read when the industry alone says nothing.
 */
export function loadBlueprint(industry: string | null | undefined, hints: string | null | undefined = null): LoadedBlueprint {
  if (!GENERIC) throw new Error("The playbook catalog has no generic-fallback entry.");
  const found = resolveBlueprintSlug(industry, hints);
  const entry = BY_SLUG.get(found.slug) ?? GENERIC;
  const archetype = archetypeFor(clean(industry), clean(hints));
  return {
    source: found.source,
    matchedBy: found.matchedBy,
    slug: entry.slug,
    label: entry.label,
    archetypeKey: archetype?.key ?? null,
    palette: { ...entry.palette },
    fonts: { ...entry.fonts },
    hero: { ...entry.hero },
    sections: entry.sections.map((section) => ({ ...section })),
    scrollComponent: entry.scroll.component,
    signatureTool: {
      id: entry.tool.id,
      name: entry.tool.name,
      component: entry.tool.component,
      mode: entry.tool.mode,
      inputs: [...entry.tool.inputs],
      output: entry.tool.output,
    },
    ownerKeys: [...entry.tool.ownerKeys],
    omitIfMissing: [...entry.truth.omitIfMissing],
    disclaimers: [...entry.truth.disclaimers],
    schemaType: entry.truth.schemaType,
    tradeBlueprint: blueprintFor(industry, hints),
    promptBlock: promptFor(entry, industry, hints, found.source),
  };
}
