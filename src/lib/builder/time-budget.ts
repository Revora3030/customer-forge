/**
 * Time-budget rules for the tail of a first build (root cause #5).
 *
 * Work after the section layouts (site chrome, link check, QA repair, hero
 * stock video) is not checkpointed, so it must not start when the run is about
 * to be cut off. Pure, so the rules are unit tested.
 */

/** The hero stock video is optional; below this much time it is skipped. */
export const HERO_VIDEO_MIN_REMAINING_MS = 60_000;

export function remainingMs(deadline: number, now = Date.now()): number {
  return Number.isFinite(deadline) ? deadline - now : Number.POSITIVE_INFINITY;
}

/** True when the run has too little time left to attach the optional hero video. */
export function shouldSkipHeroVideo(deadline: number, now = Date.now()): boolean {
  return remainingMs(deadline, now) < HERO_VIDEO_MIN_REMAINING_MS;
}

export const HERO_VIDEO_SKIPPED_MESSAGE =
  "The top-of-page video was skipped to finish your build on time; the top picture stays. You can add the video from the website's top video panel.";
