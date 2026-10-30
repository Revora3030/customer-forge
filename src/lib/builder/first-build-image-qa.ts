/**
 * STARTER-PICTURE QUALITY GATE
 * ============================
 *
 * A generated starter picture is only allowed onto a website when it passes every
 * check below. This is a pure function so it can be tested without a network,
 * a database or a browser.
 *
 * A rejected picture is removed and handed to the repair/blocking path. It is
 * never replaced with built-in artwork or silently treated as complete.
 */

import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.types";

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
  /**
   * Accepted pictures too small to fill the screen sharply. They stay on the
   * site, but are marked `fullBleed: false` so the renderer frames them
   * instead of stretching them edge to edge.
   */
  demoted: ImageQaFinding[];
  /** True when every requested picture passed. */
  clean: boolean;
};

/* ---------------------------------------------------- resolution check ---- */

/**
 * Smallest picture allowed to fill a full-bleed hero or scene: HD (1280×720).
 * Below that a laptop-width hero visibly upscales and goes soft.
 */
export const FULL_BLEED_MIN_WIDTH = 1280;
export const FULL_BLEED_MIN_HEIGHT = 720;
/** Narrowest picture allowed in a card or column. */
export const INLINE_MIN_WIDTH = 480;

export type ImageRole = "full-bleed" | "inline";

const FULL_BLEED_PLACEMENT = /hero|masthead|opening|scene|cover|banner|backdrop|full-?bleed|splash/i;

/** Whether a picture is destined to fill the screen edge to edge. */
export function imageRole(asset: Pick<FirstBuildImageAsset, "slot" | "placement">): ImageRole {
  return FULL_BLEED_PLACEMENT.test(asset.slot) || (asset.placement ?? []).some((place) => FULL_BLEED_PLACEMENT.test(place))
    ? "full-bleed"
    : "inline";
}

/**
 * Plain-language problem when a picture is too small for its role, or null.
 * Unknown sizes never block: an owner photo without recorded dimensions is
 * still used, and the renderer keeps its own guard.
 */
export function imageResolutionIssue(
  size: { width?: number | null; height?: number | null },
  role: ImageRole,
): string | null {
  const width = Number(size.width) || 0;
  const height = Number(size.height) || 0;
  if (!width || !height) return null;
  if (role === "full-bleed" && (width < FULL_BLEED_MIN_WIDTH || height < FULL_BLEED_MIN_HEIGHT))
    return `the picture is ${width}×${height}px, too small to fill the screen sharply (needs ${FULL_BLEED_MIN_WIDTH}×${FULL_BLEED_MIN_HEIGHT}px), so it is shown framed instead`;
  if (role === "inline" && width < INLINE_MIN_WIDTH)
    return `the picture is ${width}px wide, too small to show without looking blurry`;
  return null;
}

/**
 * Whether a resolved picture may be stretched edge to edge. A picture marked
 * `full_bleed: false` by the gate, or known to be undersized, is framed.
 */
export function fitsFullBleed(visual: { width?: number | null; height?: number | null; full_bleed?: boolean | null } | null | undefined): boolean {
  if (!visual) return true;
  if (visual.full_bleed === false) return false;
  return imageResolutionIssue(visual, "full-bleed") === null;
}

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
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(asset.slot))
    return "the AI-authored image role was not safe to store";
  if (UNSAFE_PLACEMENT.test(`${asset.slot} ${asset.label}`))
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
  const demoted: ImageQaFinding[] = [];
  const seenPaths = new Set<string>();
  const seenSlotLabels = new Set<string>();

  for (const asset of assets) {
    const reason =
      placementProblem(asset) ??
      provenanceProblem(asset) ??
      altTextProblem(asset) ??
      (seenPaths.has(asset.path) ? "the same picture was produced twice" : null) ??
      (seenSlotLabels.has(`${asset.slot}:${asset.label.toLowerCase()}`)
        ? "that spot already had a starter picture"
        : null);

    if (reason) {
      rejected.push({ slot: asset.slot, label: asset.label, reason });
      continue;
    }
    // An inline picture that is simply too small would look blurry anywhere.
    const inlineIssue = imageRole(asset) === "inline" ? imageResolutionIssue(asset, "inline") : null;
    if (inlineIssue) {
      rejected.push({ slot: asset.slot, label: asset.label, reason: inlineIssue });
      continue;
    }
    seenPaths.add(asset.path);
    seenSlotLabels.add(`${asset.slot}:${asset.label.toLowerCase()}`);
    // Graceful fallback: an undersized hero is kept (the section never loses
    // its picture) but is never stretched full-bleed.
    const heroIssue = imageRole(asset) === "full-bleed" ? imageResolutionIssue(asset, "full-bleed") : null;
    if (heroIssue) {
      demoted.push({ slot: asset.slot, label: asset.label, reason: heroIssue });
      accepted.push({ ...asset, fullBleed: false });
      continue;
    }
    accepted.push(asset);
  }

  return { accepted, rejected, demoted, clean: rejected.length === 0 };
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
