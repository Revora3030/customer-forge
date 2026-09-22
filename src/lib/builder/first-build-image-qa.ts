/**
 * STARTER-PICTURE QUALITY GATE
 * ============================
 *
 * A generated starter picture is only allowed onto a website when it passes every
 * check below. This is a pure function so it can be tested without a network,
 * a database or a browser.
 *
 * The gate never blocks the whole build: a rejected picture is simply dropped and
 * that slot falls back to Revora's own abstract artwork, with the reason recorded
 * so the builder can tell the owner the truth.
 */

import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.types";

/** Slots a generated picture may occupy. Proof-style slots are excluded. */
export const ATTACHABLE_SLOTS = new Set(["hero", "service", "background", "cta", "social"]);

const UNSAFE_PLACEMENT = /gallery|proof|testimonial|review|award|team|result|before|after/i;
const GENERIC_ALT = /^(?:professional (?:work|service|workspace|image)|website image|featured image|service image)(?:\s+(?:by|for)\s+.+)?$/i;

export type ImageQaFinding = {
  slot: string;
  label: string;
  reason: string;
};

export type ImageQaOutcome = {
  /** Assets that may be attached to the site. */
  accepted: FirstBuildImageAsset[];
  /** Assets that were dropped, with a plain-language reason each. */
  rejected: ImageQaFinding[];
  /** True when every requested picture passed. */
  clean: boolean;
};

function altTextProblem(asset: FirstBuildImageAsset): string | null {
  const alt = (asset.altText ?? "").trim();
  if (alt.length < 8) return "the picture had no usable description for screen readers";
  if (/^image|^photo$|^picture$/i.test(alt) && alt.length < 20)
    return "the picture description was too generic to be useful";
  if (GENERIC_ALT.test(alt)) return "the picture description was too generic to identify its subject";
  return null;
}

function provenanceProblem(asset: FirstBuildImageAsset): string | null {
  if (!asset.provider?.trim() || !asset.model?.trim())
    return "Revora could not record where the picture came from";
  if (!asset.path?.trim()) return "the picture was not stored, so it cannot be shown";
  return null;
}

function placementProblem(asset: FirstBuildImageAsset): string | null {
  if (!ATTACHABLE_SLOTS.has(asset.slot))
    return "that part of the page must only show your own photos";
  if ((asset.placement ?? []).some((place) => UNSAFE_PLACEMENT.test(place)))
    return "that part of the page must only show your own work, so a starter picture was not used";
  return null;
}

/**
 * Grades generated starter pictures and returns only the ones that are safe and
 * complete enough to attach.
 */
export function gradeFirstBuildImages(assets: FirstBuildImageAsset[]): ImageQaOutcome {
  const accepted: FirstBuildImageAsset[] = [];
  const rejected: ImageQaFinding[] = [];
  const seenPaths = new Set<string>();
  const seenSlotLabels = new Set<string>();
  const seenSingularSlots = new Set<string>();
  const singularSlots = new Set(["hero", "background", "cta", "social"]);

  for (const asset of assets) {
    const reason =
      placementProblem(asset) ??
      provenanceProblem(asset) ??
      altTextProblem(asset) ??
      (seenPaths.has(asset.path) ? "the same picture was produced twice" : null) ??
      (singularSlots.has(asset.slot) && seenSingularSlots.has(asset.slot)
        ? "that spot already had a starter picture"
        : null) ??
      (seenSlotLabels.has(`${asset.slot}:${asset.label.toLowerCase()}`)
        ? "that spot already had a starter picture"
        : null);

    if (reason) {
      rejected.push({ slot: asset.slot, label: asset.label, reason });
      continue;
    }
    seenPaths.add(asset.path);
    if (singularSlots.has(asset.slot)) seenSingularSlots.add(asset.slot);
    seenSlotLabels.add(`${asset.slot}:${asset.label.toLowerCase()}`);
    accepted.push(asset);
  }

  return { accepted, rejected, clean: rejected.length === 0 };
}

/* ------------------------------------------------------- repair hand-off ---- */

export type ImageRepairStep =
  | { action: "retry_picture"; slot: string; label: string; reason: string }
  | { action: "block_required_media"; slot: string; label: string; reason: string }
  | { action: "ask_owner_photo"; slot: string; label: string; reason: string };

/**
 * Turns picture problems into the same kind of repair steps the visual loop
 * already runs, so a blocked or rejected starter picture is retried, blocks a
 * required slot, or is handed back to the owner — never silently replaced.
 */
export function imageRepairPlan(input: {
  rejected: ImageQaFinding[];
  skipped: { slot: string; label: string; reason: string }[];
}): ImageRepairStep[] {
  const steps: ImageRepairStep[] = [];

  for (const item of input.rejected) {
    if (/description|generic|twice|already had/i.test(item.reason)) {
      steps.push({ action: "retry_picture", slot: item.slot, label: item.label, reason: item.reason });
    } else if (/own photos|own work/i.test(item.reason)) {
      steps.push({ action: "ask_owner_photo", slot: item.slot, label: item.label, reason: item.reason });
    } else {
      steps.push({ action: "block_required_media", slot: item.slot, label: item.label, reason: item.reason });
    }
  }

  for (const item of input.skipped) {
    steps.push({
      action: /budget|cap|switched off|not available|unavailable/i.test(item.reason)
        ? "ask_owner_photo"
        : "retry_picture",
      slot: item.slot,
      label: item.label,
      reason: item.reason,
    });
  }

  return steps.slice(0, 12);
}
