/**
 * GRACEFUL DEGRADE (first build).
 *
 * A first build used to fail the whole attempt when the picture stage made no
 * pictures, or when an OPTIONAL design pass broke. Each failed attempt re-ran
 * the paid AI steps and the per-build spend cap could be reached with no site
 * at all.
 *
 * Now those two stages degrade: the draft completes without the missing
 * pictures (never with invented or borrowed ones), and a durable follow-up
 * repair is recorded so the gap is fixed afterwards instead of silently kept.
 *
 * What does NOT degrade: the creative direction, the wording, the page plan
 * and the REQUIRED section layouts. Those stay "designed by the AI team, never
 * a default". The $6 per-build spend cap (build-spend.ts) is untouched.
 *
 * Pure: no network, so the worker, the repair loop and the tests share it.
 */
import { firstBuildPictureGap } from "@/lib/builder/first-build-picture-gate";
import { normaliseSlot } from "@/lib/builder/image-records";

export type DegradedStepKind = "pictures" | "layout_polish";

export type FollowUpRepair = {
  kind: DegradedStepKind;
  status: "pending";
  /** Plain-language reason, safe to show the owner. */
  reason: string;
  /** Picture slots (pictures) or page count (layout_polish) the repair covers. */
  slots: string[];
  recordedAt: string;
};

export type PictureShot = { slot: string; label: string; purpose?: string | undefined; subjectHint?: string | undefined };

/** A picture record the existing "regenerate picture" action can retry. */
export type FailedPictureRecord = {
  slot: string;
  direction: string;
  source: "generated";
  status: "failed";
  rejection_reason: string;
};

export type PictureDegrade = {
  followUp: FollowUpRepair;
  records: FailedPictureRecord[];
  attention: string;
  ownerNote: string;
};

const clip = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Decides whether the picture stage degrades. Returns null when the site has
 * pictures (owner photos or generated ones). The follow-up lists only the slots
 * the AI's own shot list asked for; nothing is invented.
 */
export function degradePictures(input: {
  ownerPhotoCount: number;
  generatedStatus: string;
  keptPictures: number;
  message?: string | null | undefined;
  shots: readonly PictureShot[];
  now?: Date;
}): PictureDegrade | null {
  const gap = firstBuildPictureGap({
    ownerPhotoCount: input.ownerPhotoCount,
    generatedStatus: input.generatedStatus,
    keptPictures: input.keptPictures,
  });
  if (!gap) return null;
  const reason = clip(input.message || gap, 300);
  const records: FailedPictureRecord[] = [];
  const seen = new Set<string>();
  for (const shot of input.shots) {
    const slot = normaliseSlot(shot.slot);
    if (!slot || seen.has(slot)) continue;
    seen.add(slot);
    const direction = clip([shot.label, shot.purpose, shot.subjectHint].filter(Boolean).join(" — "), 4000);
    if (!direction) continue;
    records.push({ slot, direction, source: "generated", status: "failed", rejection_reason: clip(reason, 200) });
  }
  return {
    followUp: {
      kind: "pictures",
      status: "pending",
      reason,
      slots: records.map((r) => r.slot),
      recordedAt: (input.now ?? new Date()).toISOString(),
    },
    records,
    attention:
      "Pictures: your draft was built without pictures because none could be made right now. Add photos of your own work, or ask Revora to retry the pictures — they are queued for repair.",
    ownerNote:
      " Pictures could not be made in time, so the draft has none yet — add your own photos or retry the pictures from the Pictures tab.",
  };
}

/** Optional design rounds (craft repair, team improvement) that were skipped or broke. */
export function degradeLayoutPolish(input: { optionalSkipped: number; optionalFailed: number; now?: Date }): {
  followUp: FollowUpRepair;
  attention: string;
} | null {
  const skipped = Math.max(0, input.optionalSkipped || 0);
  const failed = Math.max(0, input.optionalFailed || 0);
  if (skipped + failed === 0) return null;
  const parts: string[] = [];
  if (skipped) parts.push(`${skipped} page${skipped === 1 ? "" : "s"} skipped the optional design polish to stay within the time limit`);
  if (failed) parts.push(`${failed} polish round${failed === 1 ? "" : "s"} could not run`);
  const reason = `${parts.join(" and ")}. Every section still has its AI-designed layout.`;
  return {
    followUp: { kind: "layout_polish", status: "pending", reason, slots: [], recordedAt: (input.now ?? new Date()).toISOString() },
    attention: "Design polish: some pages are saved without the optional polish round. Ask Revora to improve the design to run it.",
  };
}

/** Merges new follow-ups into the stored list, one pending entry per kind. */
export function mergeFollowUps(existing: unknown, added: readonly FollowUpRepair[]): FollowUpRepair[] {
  const list = Array.isArray(existing) ? (existing as FollowUpRepair[]).filter((x) => x && typeof x === "object" && "kind" in x) : [];
  const kinds = new Set(added.map((a) => a.kind));
  return [...list.filter((x) => !(x.status === "pending" && kinds.has(x.kind))), ...added];
}
