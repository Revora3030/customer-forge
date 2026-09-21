/**
 * PREMIUM PICTURE TIERS — who makes which picture.
 *
 * Two premium picture models sit above the free picture fabric and Revora's own
 * deterministic artwork:
 *
 *  - `sunburst` (GPT-Image-2.5-Sunburst) highest-quality generation AND precision
 *              editing: the hero picture, editorial feature shots, and any change
 *              to an existing picture where the original must be respected.
 *  - `flare`   (GPT-Image-2.5-Flare) fast high-quality generation: supporting
 *              starter photography, iterations, variations and quick retries.
 *
 * This module is deliberately pure and environment-free so the routing rules are
 * unit-testable on their own. Credentials, capability probing, budget reservation,
 * spend accounting and the actual HTTP call all live in `paid-image.server.ts` and
 * the router; no tier can be reached without passing those gates, and free
 * picture making always runs first.
 */

export type ImageTier = "sunburst" | "flare";

export const IMAGE_TIERS: ImageTier[] = ["sunburst", "flare"];

/** Default model per tier. Each is overridable by server environment variable. */
export const DEFAULT_IMAGE_TIER_MODELS: Record<ImageTier, string> = {
  sunburst: "gpt-image-2.5-sunburst",
  flare: "gpt-image-2.5-flare",
};

export const IMAGE_TIER_MODEL_ENV: Record<ImageTier, string> = {
  sunburst: "PAID_IMAGE_MODEL_SUNBURST",
  flare: "PAID_IMAGE_MODEL_FLARE",
};

export const IMAGE_TIER_PRICE_ENV: Record<ImageTier, string> = {
  sunburst: "PAID_IMAGE_PRICE_SUNBURST_USD",
  flare: "PAID_IMAGE_PRICE_FLARE_USD",
};

/**
 * Conservative, deliberately over-estimated per-picture prices in US dollars.
 * Over-estimating is the safe direction: the durable monthly cap binds earlier,
 * never later.
 */
export const DEFAULT_IMAGE_TIER_PRICE_USD: Record<ImageTier, number> = {
  sunburst: 0.19,
  flare: 0.06,
};

/**
 * Every kind of picture work Revora routes. Purposes are named after the job,
 * never after a model, so a model change is a routing change.
 */
export type ImagePurpose =
  // highest quality / the picture the whole page is composed around
  | "hero_master"
  | "editorial_feature"
  | "precision_edit"
  | "crop_refine"
  // fast, high volume, iterative
  | "starter_photo"
  | "service_photo"
  | "background_texture"
  | "variation"
  | "iteration"
  | "thumbnail";

const PURPOSE_TIER: Record<ImagePurpose, ImageTier> = {
  hero_master: "sunburst",
  editorial_feature: "sunburst",
  precision_edit: "sunburst",
  crop_refine: "sunburst",
  starter_photo: "flare",
  service_photo: "flare",
  background_texture: "flare",
  variation: "flare",
  iteration: "flare",
  thumbnail: "flare",
};

/** The tier a picture job belongs to. Pure routing — no credentials involved. */
export function tierForImagePurpose(purpose: ImagePurpose): ImageTier {
  return PURPOSE_TIER[purpose];
}

/**
 * Only the premium tier is trusted to change an existing picture: an edit has to
 * preserve the original subject, and the fast tier is tuned for fresh frames.
 */
export function tierSupportsEditing(tier: ImageTier): boolean {
  return tier === "sunburst";
}

/** True when this job is a change to an existing picture rather than a new one. */
export function isEditPurpose(purpose: ImagePurpose): boolean {
  return purpose === "precision_edit" || purpose === "crop_refine";
}

/** Plain-language description of a tier, safe to show a business owner. */
export function describeImageTier(tier: ImageTier): string {
  return tier === "sunburst"
    ? "Highest-quality picture making and precise changes to an existing picture."
    : "Fast, high-quality picture making for supporting photos, retries and variations.";
}

export type ImageTierPlan = {
  purpose: ImagePurpose;
  tier: ImageTier;
  /** True when the job needs a source picture to change. */
  editing: boolean;
  /** False when the chosen tier is not allowed to do this job at all. */
  supported: boolean;
};

/**
 * Decides tier and legality for one picture job without touching the network.
 * An edit routed at a tier that cannot edit comes back `supported: false` rather
 * than being quietly sent anyway.
 */
export function planImageWork(purpose: ImagePurpose): ImageTierPlan {
  const tier = tierForImagePurpose(purpose);
  const editing = isEditPurpose(purpose);
  return {
    purpose,
    tier,
    editing,
    supported: editing ? tierSupportsEditing(tier) : true,
  };
}
