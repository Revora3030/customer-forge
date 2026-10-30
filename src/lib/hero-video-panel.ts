import type { HeroVideoStatus } from "@/lib/builder/hero-stock-video";

export const HERO_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_HERO_UPLOAD_BYTES = 40 * 1024 * 1024;

/** Plain-words reason an owner's file cannot be used, or null when it can. */
export function heroUploadProblem(file: { type: string; size: number }): string | null {
  if (!HERO_VIDEO_TYPES.includes(file.type)) return "Use an MP4, WebM or MOV video.";
  if (file.size > MAX_HERO_UPLOAD_BYTES) return "That video is over 40 MB. Use a shorter clip (5–10 seconds is plenty).";
  return null;
}

const WHEN = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : ` (${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })})`;
};

/** What the last attach attempt did, in the owner's words. */
export function heroVideoStatusLine(status: HeroVideoStatus | null): string | null {
  if (!status) return null;
  const who = status.trigger === "build" ? "After the last build" : "Last time";
  if (status.status === "added") return `${who}: ${status.message}${WHEN(status.at)}`;
  if (status.status === "exists") return null;
  return `${who}, no new video was added: ${status.message}${WHEN(status.at)}`;
}

/** A warning when the top section has nowhere to play a loop. */
export function heroVideoSlotNote(slot: "scene" | "picture" | "none" | "unknown"): string | null {
  return slot === "none"
    ? "Your home page's top section has no picture, so a video has nowhere to play. Ask your AI team for a full-width photo at the top, then add the video."
    : null;
}
