/**
 * First-build image lane.
 *
 * Generates starter website photography only after the normal creative brief has
 * chosen real image slots. Owner uploads always win. If the free picture service
 * is missing, blocked, over budget or returns a bad asset, this module returns a
 * precise evidence report. Required media is then blocked by the materializer;
 * it is never replaced by deterministic abstract artwork.
 *
 * Generated starter images are never treated as proof of the business's real
 * work, team, awards or results. They are saved with provenance and attached to
 * renderable hero/service/about/CTA slots only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { generateImageBase64, decodeBase64 } from "@/lib/image-studio.server";
import { generatePaidImageBase64, paidImageStatus } from "@/lib/ai/paid-image.server";
import {
  acceptedForUse,
  inspectPhoto,
  reviewUnavailablePolicy,
  shouldReshoot,
} from "@/lib/ai/photo-direction.server";
import { createBackoffGate, mapConcurrent } from "@/lib/concurrency";
import { gradeFirstBuildImages } from "@/lib/builder/first-build-image-qa";
import type {
  FirstBuildImageAsset,
  FirstBuildImageEvidence,
  FirstBuildImageSource,
} from "@/lib/builder/first-build-images.types";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-contract";
import type { PlannedShot } from "@/lib/builder/image-campaign";

type Db = SupabaseClient;

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type {
  FirstBuildImageAsset,
  FirstBuildImageEvidence,
} from "@/lib/builder/first-build-images.types";

export type FirstBuildImageResult = {
  assets: FirstBuildImageAsset[];
  evidence: FirstBuildImageEvidence;
};

/**
 * Wall-clock budget for the whole first-build picture stage. Once it is spent
 * no new picture is started: the build moves on to write pages, menus and
 * buttons, and the unfilled slots are reported (and picked up by the picture
 * repair afterwards) instead of the worker being cut off mid-stage.
 */
export function firstBuildImageBudgetMs() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_BUDGET_MS"] ?? "");
  return Number.isFinite(raw) && raw >= 30_000 ? Math.min(Math.floor(raw), 600_000) : 240_000;
}

function maxStarterImages() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_MAX"] ?? "");
  // Every page that needs a picture must get one on the first build: the hero,
  // each service page, the about page, campaign support and closing sections.
  // The ceiling only keeps generation finite; it is not a quality budget.
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 28) : 24;
}

/**
 * How many pictures are made at once. Small on purpose: free picture services
 * rate-limit aggressively, and a shared backoff gate slows every lane on a 429.
 */
export function firstBuildImageConcurrency() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_CONCURRENCY"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 6) : 3;
}

function safeSlot(shot: PlannedShot) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(shot.slot)) return false;
  if (shot.placement.some((place) => /gallery|proof|testimonial|review|award|team|result|before|after/i.test(place))) return false;
  return !/testimonial|review|award|team|result|completed work|proof|before|after/i.test(`${shot.slot} ${shot.label} ${shot.purpose}`);
}

/**
 * The art-direction sentence for this slot, taken from the creative brief that
 * was decided before any page row existed. Presentation only — never a claim.
 */
function artDirectionNote(creative: FirstBuildCreativeDirection, shot: PlannedShot): string {
  const spec = creative.brief?.imageInventory.find(
    (item) => item.slot === shot.slot && item.label === shot.label,
  );
  const campaign = [
    creative.imagery.language,
    creative.imagery.treatment,
    creative.brief?.photography.lighting,
    creative.brief?.photography.environment,
  ].filter(Boolean).join(". ");
  if (!spec) return campaign ? `Campaign direction: ${campaign}.` : "";
  return [
    `Campaign direction: ${campaign}.`,
    `Art direction: ${spec.camera}.`,
    `Framing: ${spec.framing}.`,
    `Mood: ${spec.mood}.`,
    `Keep clear negative space on the ${spec.negativeSpace} for headline text.`,
    `${spec.mobileCrop}.`,
  ].join(" ");
}

function fileStem(shot: PlannedShot, index: number) {
  return `first-build-${index + 1}-${shot.slot}-${shot.label || "image"}`;
}

export function firstBuildImageShots(
  creative: FirstBuildCreativeDirection,
  _photoCount: number,
  occupiedSlots: ReadonlySet<PlannedShot["slot"]> = new Set(),
): PlannedShot[] {
  const unique = new Set<string>();
  const shots: PlannedShot[] = [];
  const campaignShots: PlannedShot[] = creative.brief.imageInventory.map((item) => ({
    slot: item.slot as PlannedShot["slot"],
    label: item.label,
    purpose: item.purpose,
    aspect: item.aspectRatio,
    placement: item.section,
    subjectHint: item.subject,
  }));
  for (const shot of campaignShots) {
    if (!safeSlot(shot)) continue;
    // An existing owner picture is presumed to cover the hero first. It should
    // not suppress safe supporting marketing pictures for the rest of the site.
    if (occupiedSlots.has(shot.slot)) continue;
    const key = `${shot.slot}:${shot.label.toLowerCase()}`;
    if (unique.has(key)) continue;
    unique.add(key);
    shots.push(shot);
  }
  return shots.slice(0, maxStarterImages());
}

export async function generateFirstBuildImages(
  db: Db,
  input: {
    organizationId: string;
    userId: string | null;
    businessName: string;
    city: string | null;
    photoCount: number;
    occupiedSlots?: ReadonlySet<PlannedShot["slot"]>;
    creative: FirstBuildCreativeDirection;
    /** Absolute time (ms) after which no new picture is started. */
    deadline?: number;
    /** Called after each finished picture so the caller can renew its lease. */
    onShotDone?: () => unknown;
    /**
     * Pictures an earlier attempt of THIS build already made and stored
     * (an interrupted worker never reaches its clean-up). Reused by file name
     * so a retry does not spend minutes re-making them.
     */
    reusable?: { id: string; url: string; file_name: string | null; alt_text: string | null; attribution: string | null }[];
  },
): Promise<FirstBuildImageResult> {
  const deadline = input.deadline ?? Date.now() + firstBuildImageBudgetMs();
  const shots = firstBuildImageShots(input.creative, input.photoCount, input.occupiedSlots);
  if (shots.length === 0) {
    const ownerCovered = input.occupiedSlots?.size && shots.length === 0;
    return {
      assets: [],
      evidence: {
        status: ownerCovered ? "owner_photos" : "blocked",
        requested: shots.length,
        generated: 0,
        attached: 0,
        skipped: shots.map((shot) => ({ slot: shot.slot, label: shot.label, reason: "no safe generated slot" })),
        provider: null,
        models: [],
        message: ownerCovered
          ? "Owner-supplied photos cover the available picture roles."
          : "No safe first-build picture slots were available. Required picture areas cannot be published until a real image is available.",
      },
    };
  }

  const skipped: FirstBuildImageEvidence["skipped"] = [];
  const models = new Set<string>();
  let provider: string | null = null;
  let firstBlockedMessage: string | null = null;
  // Mutated from inside the concurrent lanes; held in an object so TypeScript
  // does not narrow it to its initial literal at the read sites below.
  const lane: { source: FirstBuildImageSource } = { source: "none" };
  let paidCostMicrocents = 0;
  const paid = paidImageStatus();
  // When the paid picture lane is out of budget, switched off, or its model is
  // unreachable, stop asking it for every remaining picture. It used to be
  // retried per shot, which slowed every build and left the free lane to pick
  // up the pieces one failure at a time.
  let paidUsable = paid.allowed;
  const PAID_STOP = new Set(["disabled", "no_key", "model_unavailable", "budget_exhausted", "ledger_unavailable"]);
  // Quality first. Sunburst owns hero/editorial frames and Flare owns supporting
  // imagery when enabled and inside the durable budget gate. The standard lane
  // is capability-aware failover, not the default merely because it is free.
  let standardBlocked = false;
  // A busy or briefly rate-limited picture service is not a closed one. Pause
  // and try again a few times before giving up on the remaining pictures, so a
  // momentary 429 no longer leaves most pages of a first build without images.
  // The pause is SHARED across the concurrent pool: one 429 slows every lane
  // instead of each lane hammering the provider on its own.
  let blockedStrikes = 0;
  const MAX_BLOCKED_STRIKES = 3;
  const backoff = createBackoffGate();
  const caller = { organizationId: input.organizationId, userId: input.userId };
  const policy = reviewUnavailablePolicy();
  let reviewFallbacks = 0;

  type Made = { base64: string; mimeType: string; provider: string; model: string };

  const standardShot = async (prompt: string): Promise<Made | null> => {
    await backoff.wait();
    if (standardBlocked) return null;
    const standard = await generateImageBase64(prompt, caller);
    if (standard.ok) {
      blockedStrikes = 0;
      return standard;
    }
    firstBlockedMessage = firstBlockedMessage ?? standard.message;
    if (standard.blocked) {
      blockedStrikes += 1;
      if (blockedStrikes >= MAX_BLOCKED_STRIKES) standardBlocked = true;
      else backoff.trip(4000 * blockedStrikes);
    }
    return null;
  };

  const placementOf = (shot: PlannedShot) => `${shot.slot} ${shot.placement.join(" ")}`.trim();

  async function makeShot(shot: PlannedShot, index: number): Promise<FirstBuildImageAsset | null> {
    // Out of time: keep the build moving. The hero (index 0) is always tried.
    if (index > 0 && Date.now() >= deadline) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: "picture time budget reached; left for the picture repair" });
      return null;
    }
    const spec = input.creative.brief.imageInventory.find(
      (item) => item.slot === shot.slot && item.label === shot.label,
    );
    if (!spec?.subject || !spec.altText) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: "the AI picture campaign was incomplete" });
      return null;
    }
    const stem = `${fileStem(shot, index)}.`;
    const earlier = (input.reusable ?? []).find(
      (row) => row.file_name?.startsWith(stem) && row.url.startsWith(`${input.organizationId}/`),
    );
    if (earlier) {
      const [earlierProvider, ...earlierModel] = String(earlier.attribution ?? "reused").split(" ");
      provider = earlierProvider || "reused";
      models.add(earlierModel.join(" ") || "reused");
      return {
        slot: shot.slot,
        label: shot.label,
        altText: earlier.alt_text || spec.altText,
        path: earlier.url,
        mediaId: earlier.id,
        provider: earlierProvider || "reused",
        model: earlierModel.join(" ") || "reused",
        prompt: "",
        placement: shot.placement,
        aspectRatio: shot.aspect,
      };
    }
    if (standardBlocked && !paidUsable) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: firstBlockedMessage ?? paid.message });
      return null;
    }
    // Most important instructions first: picture models (Flux caps prompts at
    // 2048 characters) weigh the start of the prompt most, and anything past
    // the cap is cut — so the subject and the safety rules lead, and the long
    // art-direction notes follow.
    const prompt = [
      `Photorealistic professional website photograph of ${spec.subject}. Single photograph, not a collage or split-screen. No text, letters, numbers, logos, car badges, emblems, licence plates, watermarks, signage or recognisable real people.`,
      `Purpose: ${spec.purpose}.`,
      spec.action ? `Action: ${spec.action}.` : "",
      spec.environment ? `Environment: ${spec.environment}.` : "",
      spec.lighting ? `Lighting: ${spec.lighting}.` : "",
      spec.camera ? `Camera: ${spec.camera}.` : "",
      spec.framing ? `Framing: ${spec.framing}.` : "",
      `Aspect ratio: ${spec.aspectRatio}. Focal point: ${spec.focalPoint}. Keep clear negative space on the ${spec.negativeSpace}.`,
      spec.mobileCrop ? `Mobile crop: ${spec.mobileCrop}.` : "",
      spec.palette ? `Palette: ${spec.palette}.` : "",
      spec.mood ? `Mood: ${spec.mood}.` : "",
      artDirectionNote(input.creative, shot),
      ...spec.constraints,
      "Starter marketing image only. Do not depict a real employee, actual customer, award, review, brand logo, licence plate, address, or before-and-after result.",
      "Shot on a full-frame camera with natural light, shallow depth of field, true-to-life colour, editorial magazine quality — not an illustration or generic stock composition.",
    ].filter(Boolean).join(" ");

    let made: Made | null = null;
    let madePremium = false;

    if (paidUsable) {
      const specialist = await generatePaidImageBase64(
        prompt,
        caller,
        /hero|masthead|opening|lead/i.test(placementOf(shot))
          ? "hero_master"
          : /about|story|editorial/i.test(placementOf(shot))
            ? "editorial_feature"
            : /service|offering/i.test(placementOf(shot))
              ? "service_photo"
              : "starter_photo",
      );
      if (specialist.ok) {
        made = specialist;
        madePremium = true;
        paidCostMicrocents += specialist.costMicrocents;
      } else {
        firstBlockedMessage = firstBlockedMessage ?? specialist.message;
        if (PAID_STOP.has(specialist.reason)) paidUsable = false;
      }
    }

    for (let tries = 0; !made && !standardBlocked && tries < 2; tries += 1) made = await standardShot(prompt);

    if (!made) {
      skipped.push({
        slot: shot.slot,
        label: shot.label,
        reason: standardBlocked ? (firstBlockedMessage ?? paid.message) : (firstBlockedMessage ?? "the picture service did not return a picture"),
      });
      return null;
    }

    // Terra inspects the finished frame before it is saved. Only a genuine
    // content rejection (Terra saw the pixels and found a defect) may trigger a
    // corrected reshoot. An infrastructure failure of the review never
    // regenerates the picture: inspectPhoto already retried the review itself
    // once, and the picture is then kept under the safe fallback (or left out
    // when the operator chose the strict policy).
    const verdict = await inspectPhoto(
      { base64: made.base64, mimeType: made.mimeType },
      { prompt, placement: placementOf(shot) },
      caller,
    );
    if (!acceptedForUse(verdict, policy)) {
      let replaced = false;
      if (shouldReshoot(verdict)) {
        const brief = verdict.revisedPrompt ?? `${prompt} Fix these problems: ${verdict.defects.join("; ")}.`;
        // One corrected reshoot on the best lane available. A second free
        // reshoot used to double the cost of every rejected frame.
        let reshoot: Made | null = null;
        let reshootPremium = false;
        if (paidUsable) {
          const premium = await generatePaidImageBase64(
            brief,
            caller,
            /hero|masthead|opening|lead/i.test(placementOf(shot)) ? "hero_master" : "editorial_feature",
          );
          if (premium.ok) {
            paidCostMicrocents += premium.costMicrocents;
            reshoot = premium;
            reshootPremium = true;
          }
        }
        if (!reshoot) reshoot = await standardShot(brief);
        if (reshoot) {
          const recheck = await inspectPhoto(
            { base64: reshoot.base64, mimeType: reshoot.mimeType },
            { prompt: brief, placement: placementOf(shot) },
            caller,
          );
          // The reshoot was made from Terra's own correction; a review outage on
          // the recheck follows the same safe-fallback policy as the first look.
          if (acceptedForUse(recheck, policy)) {
            if (recheck.reviewFailed) reviewFallbacks += 1;
            made = reshoot;
            madePremium = reshootPremium;
            replaced = true;
          }
        }
      }
      if (!replaced) {
        skipped.push({
          slot: shot.slot,
          label: shot.label,
          reason: verdict.reviewFailed
            ? "the picture could not be quality-checked, so it was not used"
            : `picture failed quality review (${verdict.defects.join("; ") || "off-brief"})`,
        });
        return null;
      }
    } else if (verdict.reviewFailed) {
      reviewFallbacks += 1;
      console.warn(
        `[first-build-images] visual review unavailable for ${shot.slot}/${shot.label}; kept under safe fallback (no reshoot).`,
      );
    }

    const image = made;
    lane.source = madePremium ? "premium" : lane.source === "premium" ? "premium" : "standard";
    const mime = image.mimeType.split(";")[0]?.trim().toLowerCase() ?? "image/png";
    const extension = MIME_EXTENSION[mime] ?? "png";
    const bytes = decodeBase64(image.base64);
    const path = buildObjectPath(input.organizationId, `${fileStem(shot, index)}.${extension}`);

    const { error: uploadError } = await db.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: uploadError.message });
      return null;
    }

    const altText = spec.altText;
    const { data: row, error: rowError } = await db
      .from("media")
      .insert({
        organization_id: input.organizationId,
        url: path,
        category: /hero|masthead|opening|lead/i.test(placementOf(shot)) ? "hero" : "other",
        file_name: `${fileStem(shot, index)}.${extension}`,
        size_bytes: bytes.byteLength,
        alt_text: altText,
        source: "generated",
        license: "Revora AI generated starter image",
        attribution: `${image.provider} ${image.model}`,
      } as never)
      .select("id")
      .maybeSingle();

    if (rowError) {
      await db.storage.from(MEDIA_BUCKET).remove([path]);
      skipped.push({ slot: shot.slot, label: shot.label, reason: rowError.message });
      return null;
    }

    provider = image.provider;
    models.add(image.model);
    return {
      slot: shot.slot,
      label: shot.label,
      altText,
      path,
      mediaId: row?.["id"] ? String(row["id"]) : null,
      provider: image.provider,
      model: image.model,
      prompt,
      placement: shot.placement,
      aspectRatio: shot.aspect,
    };
  }

  // BOUNDED CONCURRENCY. Pictures used to be made strictly one after another
  // (12–24 frames at 15–20s each = 5–8 minutes of serial waiting). A small pool
  // keeps every provider inside its rate limits while cutting the picture phase
  // to roughly a minute. Results keep campaign order so the hero stays first.
  const made = await mapConcurrent(shots, firstBuildImageConcurrency(), async (shot, index) => {
    try {
      return await makeShot(shot, index);
    } catch (error) {
      skipped.push({
        slot: shot.slot,
        label: shot.label,
        reason: error instanceof Error ? error.message : "the picture could not be made",
      });
      return null;
    } finally {
      try {
        await input.onShotDone?.();
      } catch {
        // Lease renewal is best effort; the background heartbeat also runs.
      }
    }
  });
  const assets = made.filter((asset): asset is FirstBuildImageAsset => asset !== null);
  if (reviewFallbacks > 0)
    console.warn(`[first-build-images] ${reviewFallbacks} picture(s) kept without a completed visual review.`);

  // Quality gate: a picture that is unsafe for its slot, undescribed, unstored or
  // duplicated never reaches the website. Required slots fail materialization.
  const graded = gradeFirstBuildImages(assets);
  const kept = graded.accepted;
  const status = kept.length ? "generated" : skipped.length || graded.rejected.length ? "blocked" : "failed";
  const source = lane.source;
  const laneLabel = source === "premium" ? "specialist picture team" : "standard capability-matched picture service";

  return {
    assets: kept,
    evidence: {
      status,
      requested: shots.length,
      generated: kept.length,
      attached: 0,
      skipped,
      rejected: graded.rejected,
      provider,
      models: [...models],
      source: kept.length ? source : "none",
      paidNote: paid.message,
      paidCostMicrocents,
      message: kept.length
        ? `Made ${kept.length} starter website picture(s) with the ${laneLabel}.${
            graded.rejected.length
              ? ` ${graded.rejected.length} more were rejected by the picture check and were not attached.`
              : ""
          }`
        : (firstBlockedMessage ??
          graded.rejected[0]?.reason ??
          "Starter picture making did not complete. Required picture areas were blocked instead of receiving placeholder artwork."),
    },
  };
}

export function firstBuildImageEvidenceJson(evidence: FirstBuildImageEvidence): Json {
  return evidence as unknown as Json;
}

/** Removes only assets created by this generation attempt. Owner media is never touched. */
export async function cleanupFirstBuildImages(db: Db, orgId: string, assets: FirstBuildImageAsset[]): Promise<void> {
  // Only this tenant's own storage folder may be touched.
  const paths = [...new Set(assets.map((asset) => asset.path).filter((path) => Boolean(path) && path.startsWith(`${orgId}/`)))];
  const ids = [...new Set(assets.map((asset) => asset.mediaId).filter((id): id is string => Boolean(id)))];
  if (paths.length) await db.storage.from(MEDIA_BUCKET).remove(paths);
  if (ids.length) await db.from("media").delete().eq("organization_id", orgId).in("id", ids);
}