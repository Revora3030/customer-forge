/**
 * Shared shapes for the first-build starter-picture lane.
 *
 * Kept free of any server-only import so the quality gate, the builder UI and the
 * tests can all use the same types.
 */

export type FirstBuildImageAsset = {
  slot: string;
  label: string;
  altText: string;
  path: string;
  mediaId: string | null;
  provider: string;
  model: string;
  prompt: string;
  placement: string[];
  aspectRatio: "16:9" | "1:1" | "21:9" | "3:2" | "4:3";
};

export type FirstBuildImageSource = "free" | "paid" | "none";

export type FirstBuildImageEvidence = {
  status: "generated" | "owner_photos" | "fallback_artwork" | "failed";
  requested: number;
  generated: number;
  /** Pictures actually attached to the site, filled in after materialization. */
  attached: number;
  skipped: { slot: string; label: string; reason: string }[];
  /** Pictures that were made but rejected by the quality gate. */
  rejected?: { slot: string; label: string; reason: string }[];
  provider: string | null;
  models: string[];
  /** Which lane produced the pictures. `paid` is only ever a backup. */
  source?: FirstBuildImageSource;
  /** Plain-language note about paid picture availability and the spending cap. */
  paidNote?: string;
  /** Total paid spend for this build, in microcents. Zero for the free lane. */
  paidCostMicrocents?: number;
  message: string;
};
