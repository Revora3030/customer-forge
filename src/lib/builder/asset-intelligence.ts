/**
 * REVORA ASSET INTELLIGENCE ENGINE
 * =================================
 *
 * Free-first asset planning engine.
 *
 * This is NOT an image generator and does not require an AI API. It does not
 * decide what an asset should LOOK like — that is `visual-intelligence.ts`'s
 * job. This engine decides what image/logo SLOTS a site actually needs, how
 * many, at what shape, and — most importantly — which of those slots may
 * ever be filled with a decorative or stock image versus which must only
 * ever come from the business itself.
 *
 * IMPORTANT:
 * This module never fabricates, generates, or sources an asset. It plans
 * slots only. A "must_be_real" slot with nothing supplied is a gap to
 * report, never a placeholder to quietly fill.
 */

import type { BusinessFacts } from "./facts";

/** How a slot may honestly be filled. */
export type AssetSourcePolicy =
  | "must_be_real" // real work photos, team photos, reviews — stock would be dishonest
  | "user_preferred" // hero/section imagery — real is best, a decorative fallback is honest
  | "decorative_ok"; // backgrounds, icons, abstract shapes — never claims to depict the business

export type AssetKind = "logo" | "hero" | "gallery" | "team" | "icon" | "background" | "og_image";

export type AssetRatio = "1:1" | "4:3" | "3:2" | "16:9" | "21:9";

export type AssetSlot = {
  id: string;
  section: string;
  kind: AssetKind;
  count: number;
  ratio: AssetRatio;
  policy: AssetSourcePolicy;
  /** True when the site should not publish without this slot filled. */
  required: boolean;
  altTemplate: string;
};

export type AssetPlan = {
  slots: AssetSlot[];
  /** Required slots with nothing supplied yet — the honest gap list. */
  missingRequired: AssetSlot[];
  /** 0-100: share of required slots that are actually filled. */
  readiness: number;
  rationale: string[];
};

type Facts = Pick<BusinessFacts, "businessName" | "logoUrl" | "heroImageUrl">;

/** What the workspace has actually supplied, so nothing here is assumed. */
export type SuppliedAssets = {
  hasLogo: boolean;
  hasHeroImage: boolean;
  galleryPhotoCount: number;
  teamPhotoCount: number;
};

function suppliedFrom(facts: Facts, supplied?: Partial<SuppliedAssets>): SuppliedAssets {
  return {
    hasLogo: supplied?.hasLogo ?? !!facts.logoUrl,
    hasHeroImage: supplied?.hasHeroImage ?? !!facts.heroImageUrl,
    galleryPhotoCount: supplied?.galleryPhotoCount ?? 0,
    teamPhotoCount: supplied?.teamPhotoCount ?? 0,
  };
}

/** Real work photos planned for a gallery the AI chose to include. */
const GALLERY_PHOTO_COUNT = 6;

function altFor(kind: AssetKind, businessName: string | null): string {
  const name = businessName ?? "the business";
  switch (kind) {
    case "logo":
      return `${name} logo`;
    case "hero":
      return `${name} — hero image`;
    case "gallery":
      return `Photo of work completed by ${name}`;
    case "team":
      return `A member of the ${name} team`;
    case "og_image":
      return `${name}`;
    default:
      return name;
  }
}

/**
 * Plans every image/logo slot a site of this shape needs, and whether each
 * one may be decorative or must come from the business itself. Returns slots
 * and gaps only — never a URL, a stock photo, or a generated image.
 */
export function assetPlanFor(
  facts: Facts,
  sectionKinds: string[],
  supplied?: Partial<SuppliedAssets>,
): AssetPlan {
  const have = suppliedFrom(facts, supplied);
  const rationale: string[] = [];
  const slots: AssetSlot[] = [];

  slots.push({
    id: "logo",
    section: "global",
    kind: "logo",
    count: 1,
    ratio: "1:1",
    policy: "user_preferred",
    required: false,
    altTemplate: altFor("logo", facts.businessName),
  });

  slots.push({
    id: "og-image",
    section: "global",
    kind: "og_image",
    count: 1,
    ratio: "16:9",
    policy: "decorative_ok",
    required: false,
    altTemplate: altFor("og_image", facts.businessName),
  });

  const seen = new Set<string>();
  for (const kind of sectionKinds) {
    const normalized = kind.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (normalized === "hero") {
      slots.push({
        id: "hero-image",
        section: "hero",
        kind: "hero",
        count: 1,
        ratio: "4:3",
        policy: "user_preferred",
        required: false,
        altTemplate: altFor("hero", facts.businessName),
      });
    }

    if (normalized === "gallery" || normalized === "portfolio" || normalized === "work") {
      const count = GALLERY_PHOTO_COUNT;
      slots.push({
        id: `${normalized}-photos`,
        section: normalized,
        kind: "gallery",
        count,
        ratio: "4:3",
        policy: "must_be_real",
        required: true,
        altTemplate: altFor("gallery", facts.businessName),
      });
      rationale.push(
        `Planned ${count} real work photos for the ${normalized} section.`,
      );
    }

    if (normalized === "team" || normalized === "about") {
      slots.push({
        id: `${normalized}-photo`,
        section: normalized,
        kind: "team",
        count: 1,
        ratio: "1:1",
        policy: "must_be_real",
        required: false,
        altTemplate: altFor("team", facts.businessName),
      });
    }
  }

  const missingRequired = slots.filter((slot) => {
    if (!slot.required) return false;
    if (slot.kind === "gallery") return have.galleryPhotoCount < slot.count;
    if (slot.kind === "team") return have.teamPhotoCount < slot.count;
    if (slot.kind === "logo") return !have.hasLogo;
    if (slot.kind === "hero") return !have.hasHeroImage;
    return false;
  });

  const requiredSlots = slots.filter((slot) => slot.required);
  const readiness =
    requiredSlots.length === 0
      ? 100
      : Math.round(((requiredSlots.length - missingRequired.length) / requiredSlots.length) * 100);

  return { slots, missingRequired, readiness, rationale };
}

/**
 * Whether a given kind is ever allowed to be filled with a stock or
 * decorative image. Kept as a standalone check so callers can gate an
 * upload flow without building a full plan first.
 */
export function allowsDecorative(kind: AssetKind): boolean {
  return kind === "hero" || kind === "background" || kind === "icon" || kind === "og_image";
}
