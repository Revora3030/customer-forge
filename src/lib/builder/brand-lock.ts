/**
 * When the owner's saved colours should stay, and when the request is asking
 * for them to change (pure layer).
 *
 * The builder stores the colours an owner picked earlier and folds them back
 * over every future plan. That is right for a small edit — but wrong when the
 * owner has just asked for a new look: the whole point of "redesign my site"
 * or "pick colours that suit my industry" is that the old palette goes. Before
 * this, such a request produced dozens of changes and a site that looked
 * exactly the same, because the saved palette overwrote the chosen one.
 *
 * Nothing here invents a colour or a fact. It only decides which of two real
 * palettes — the owner's saved one, or the one chosen for this request — wins.
 */

/** Phrases that mean "keep using my colours". */
const KEEP = [
  "keep my colour",
  "keep my color",
  "keep our colour",
  "keep our color",
  "keep the colour",
  "keep the color",
  "keep my brand",
  "keep our brand",
  "keep my palette",
  "same colour",
  "same color",
  "don't change my colour",
  "don't change my color",
  "do not change my colour",
  "do not change my color",
  "leave my colour",
  "leave my color",
  "stick to my colour",
  "stick to my color",
  "my existing colour",
  "my existing color",
];

/** Phrases that mean "choose a new look for me". */
const RESTYLE = [
  "redesign",
  "re-design",
  "new look",
  "fresh look",
  "different look",
  "new colour",
  "new color",
  "change the colour",
  "change the color",
  "change my colour",
  "change my color",
  "new palette",
  "new theme",
  "restyle",
  "re-style",
  "rebrand",
  "make it premium",
  "designer",
  "modernise",
  "modernize",
  "modern look",
  "overhaul",
  "makeover",
  "make over",
  "revamp",
  "refresh the look",
  "refresh my look",
  "pick a look",
  "choose a look",
  "pick colours",
  "pick colors",
  "suit my industry",
  "fits my industry",
  "fit my industry",
  "stand out",
  "less generic",
  "looks generic",
  "brand new look",
];

export type BrandLockMode = "keep_owner_colours" | "restyle";

/**
 * Whether this request may replace the owner's saved palette.
 *
 * An explicit "keep my colours" always wins, even inside a redesign request,
 * because that is the owner stating a hard constraint.
 */
export function brandLockMode(instruction: string | null | undefined): BrandLockMode {
  const text = (instruction ?? "").toLowerCase();
  if (!text.trim()) return "keep_owner_colours";
  if (KEEP.some((phrase) => text.includes(phrase))) return "keep_owner_colours";
  if (RESTYLE.some((phrase) => text.includes(phrase))) return "restyle";
  return "keep_owner_colours";
}

/** Plain-language line for the change summary, so the owner is never surprised. */
export function brandLockNote(mode: BrandLockMode): string {
  return mode === "restyle"
    ? "You asked for a new look, so this installs the colours and font chosen for your business. Your previous colours are kept in your history and one undo brings them back."
    : "Your saved colours and font are kept exactly as they are.";
}
