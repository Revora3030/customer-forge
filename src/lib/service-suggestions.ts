/**
 * Package suggestions for a thin service menu.
 *
 * A first build uses exactly the services the owner entered, so a menu of one
 * word ("Full") produces a one-word card. This module helps the owner write
 * stronger packages without the AI ever inventing a business fact: a suggestion
 * is a DRAFT name and a plain description of the usual scope of that kind of
 * work. It never carries a price, a duration, a number, a guarantee or a
 * credential (those are the owner's facts), and nothing is saved until the
 * owner opens a suggestion, edits it and presses Save.
 */

export type SuggestedPackage = {
  name: string;
  description: string;
  category: string;
};

export const SUGGESTION_LIMITS = { count: 4, name: 60, description: 260, category: 40, existingShown: 12 } as const;

/** Words that state something about the business, or give a duration or a figure in words, instead of describing the work. */
const CLAIM_WORDS =
  /\b(award|awarded|certified|certification|accredited|licen[sc]ed|insured|bonded|guarantee[ds]?|warranty|warranties|best|top[- ]rated|#1|number one|leading|trusted|family[- ]owned|years?|since|rated|reviews?|testimonials?|free|discount|save|cheap|affordable|lowest|satisfaction|hours?|minutes?|mins?|days?|weeks?|same-day|next-day|overnight|two|three|four|five|six|seven|eight|nine|ten|twelve|dozen|hundred|thousand|half)\b/i;

/** Any digit, currency or percent sign: figures are the owner's facts. */
const FIGURES = /[0-9$£€%]/;

/** Why a piece of suggested text may not be shown, or null when it is fine. */
export function suggestionProblem(text: string, max: number): string | null {
  const value = text.trim();
  if (!value) return "empty";
  if (value.length > max) return `longer than ${max} characters`;
  if (FIGURES.test(value)) return "contains a figure";
  const claim = CLAIM_WORDS.exec(value);
  if (claim) return `states a claim ("${claim[0]}")`;
  return null;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, max) : "";

/**
 * Reads the model's answer. Anything unreadable, claim-making, figure-bearing or
 * duplicating a service the owner already has is dropped, so the worst case is
 * fewer suggestions, never a wrong one.
 */
export function parseSuggestedPackages(text: string, existingNames: readonly string[]): SuggestedPackage[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const rows = (parsed as { packages?: unknown })?.packages;
  if (!Array.isArray(rows)) return [];
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const out: SuggestedPackage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = clean(record["name"], SUGGESTION_LIMITS.name);
    const description = clean(record["description"], SUGGESTION_LIMITS.description + 1);
    const category = clean(record["category"], SUGGESTION_LIMITS.category);
    if (suggestionProblem(name, SUGGESTION_LIMITS.name) || suggestionProblem(description, SUGGESTION_LIMITS.description)) continue;
    if (category && suggestionProblem(category, SUGGESTION_LIMITS.category)) continue;
    const key = name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ name, description, category });
    if (out.length >= SUGGESTION_LIMITS.count) break;
  }
  return out;
}

export type ServiceBrief = { name: string; description: string | null; price: number | string | null };

/** True when the menu is thin enough that suggestions would help: few services, or any with no description. */
export function menuNeedsHelp(services: readonly Pick<ServiceBrief, "name" | "description">[]): boolean {
  if (services.length < 3) return true;
  return services.some((service) => !(service.description ?? "").trim());
}

export function buildSuggestionMessages(input: {
  businessName: string;
  industry: string | null;
  existing: readonly ServiceBrief[];
}): { system: string; user: string } {
  const shown = input.existing.slice(0, SUGGESTION_LIMITS.existingShown);
  const system = [
    "You help a local business owner write a clearer service menu. You propose DRAFT packages the owner will read, edit and decide on.",
    "Describe the usual scope of that kind of work in plain words: what is done, in what order, and for which part of the vehicle, home or property. Everything is a draft for the owner to correct.",
    "You do NOT know this business. Never state or imply: a price, a duration, a number or percentage, a guarantee or warranty, a certification, licence or insurance, an award, a review or rating, years in business, a discount, or any claim that it is the best, trusted or leading.",
    "Do not repeat or rename a service the owner already has; propose complementary or more specific packages.",
    `Respond with JSON only: {"packages": [{"name": "...", "description": "...", "category": "..."}]} with 3 or 4 packages. A name is at most ${SUGGESTION_LIMITS.name} characters, a description at most ${SUGGESTION_LIMITS.description} characters and one or two sentences, a category one or two words.`,
  ].join(" ");
  const user = [
    `Business: ${input.businessName || "a local service business"}`,
    `Kind of business: ${input.industry?.trim() || "local service"}`,
    shown.length
      ? `Services the owner already lists (do not repeat): ${shown.map((service) => (service.description ? `${service.name} — ${service.description}` : service.name)).join("; ")}`
      : "The owner has not listed any services yet.",
  ].join("\n");
  return { system, user };
}
