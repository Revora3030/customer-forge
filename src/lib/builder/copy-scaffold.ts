/**
 * FACTS-ONLY WORDING SCAFFOLD.
 *
 * Owner decision 2026-11-01: when the AI writing team is out of capacity or
 * credits after every retry, the first build ships instead of stopping. Only
 * the REQUIRED wording fields the AI left blank are filled, and only from the
 * owner's own facts (business name, description, services, place) inside
 * fixed templates. Nothing is invented: no claims, prices, ratings or reviews.
 * The site is flagged with a pending "copy_upgrade" follow-up; the AI upgrade
 * runs only after the owner approves it.
 *
 * This never replaces AI wording that exists, and it is not used when the AI
 * answered but its wording was refused by the fact check (that is not
 * capacity). The scaffold still goes through checkFirstBuildSafety.
 *
 * Pure: no network, no AI.
 */
import type { SiteCopy } from "@/lib/site-engine";

export type ScaffoldFacts = {
  businessName: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  services: readonly { name: string }[];
  /** An action label the owner chose, when there is one. */
  ctaLabel?: string | null;
};

export type ScaffoldPass = { purpose: string; used: boolean; skipped: string | null };

/** Fixed action label when the owner chose none. */
export const SCAFFOLD_CTA = "Get in touch";

/** Wording passes (creative direction and picture passes are not wording). */
const WORDING_PURPOSES = new Set(["content_strategy", "metadata", "specialist_review", "creative_review"]);

/**
 * A skip reason that means the model could not be reached or paid for:
 * credits / quota (402), rate limits (429), timeouts, no available model, or a
 * spend cap. Shape or fact-check refusals are not capacity.
 */
const CAPACITY = /credit|quota|402|rate.?limit|429|too many requests|time(?:d)?.?out|timeout|capacity|overloaded|provider_unavailable|router unavailable|no_tier_available|no paid tier|budget_exhausted|paid cap|monthly cap|ledger_unavailable|unavailable/i;
const NOT_CAPACITY = /agreed shape|refused|fact check|safety check|malformed|not usable|could not be used/i;

export function isCapacitySkip(reason: string | null | undefined): boolean {
  const text = String(reason ?? "");
  return CAPACITY.test(text) && !NOT_CAPACITY.test(text);
}

/**
 * True when the wording is missing because the AI writing team was at
 * capacity: at least one wording pass was skipped for capacity, and no
 * wording pass was refused for any other reason.
 */
export function wordingCapacityHit(passes: readonly ScaffoldPass[]): boolean {
  const skipped = passes.filter((pass) => WORDING_PURPOSES.has(pass.purpose) && !pass.used && pass.skipped);
  if (!skipped.length) return false;
  return skipped.every((pass) => isCapacitySkip(pass.skipped));
}

const squash = (value: string | null | undefined) => String(value ?? "").replace(/\s+/g, " ").trim();
const clip = (value: string, max: number) => {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
};
const firstSentence = (value: string) => {
  const match = value.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : value;
};

function placeOf(facts: ScaffoldFacts): string {
  const area = squash(facts.serviceArea);
  if (area) return area;
  return [squash(facts.city), squash(facts.state)].filter(Boolean).join(", ");
}

function serviceList(facts: ScaffoldFacts, max = 3): string {
  const names = facts.services.map((service) => squash(service.name)).filter(Boolean).slice(0, max);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const REQUIRED_SCAFFOLD_FIELDS = ["heroHeadline", "heroSubheadline", "primaryCta", "metaTitle", "metaDescription"] as const;
export type ScaffoldField = (typeof REQUIRED_SCAFFOLD_FIELDS)[number];

/**
 * Fills ONLY the blank required fields from facts. Returns the copy and the
 * fields filled. A field with no fact to draw from stays blank (and the
 * caller's missing-wording check still stops the build).
 */
export function scaffoldRequiredCopy(copy: SiteCopy, facts: ScaffoldFacts): { copy: SiteCopy; filled: ScaffoldField[] } {
  const name = squash(facts.businessName);
  const description = squash(facts.description);
  const place = placeOf(facts);
  const services = serviceList(facts);
  const servicesInPlace = services && place ? `${services} in ${place}` : services || (place ? `Serving ${place}` : "");
  const candidates: Record<ScaffoldField, string> = {
    heroHeadline: name ? clip(name, 90) : "",
    heroSubheadline: description ? clip(firstSentence(description), 200) : servicesInPlace ? clip(servicesInPlace, 200) : "",
    primaryCta: clip(squash(facts.ctaLabel) || SCAFFOLD_CTA, 40),
    metaTitle: name ? clip(squash(facts.city) ? `${name} | ${squash(facts.city)}` : name, 60) : "",
    metaDescription: description
      ? clip(description, 155)
      : name && servicesInPlace
        ? clip(`${name}: ${servicesInPlace}.`, 155)
        : "",
  };
  const next: SiteCopy = { ...copy };
  const filled: ScaffoldField[] = [];
  for (const field of REQUIRED_SCAFFOLD_FIELDS) {
    if (squash(next[field])) continue;
    const value = candidates[field];
    if (!value) continue;
    next[field] = value;
    filled.push(field);
  }
  return { copy: next, filled };
}
