/**
 * First-build image lane.
 *
 * Generates starter website photography only after the normal creative brief has
 * chosen real image slots. Owner uploads always win. If the free picture service
 * is missing, blocked, over budget or returns a bad asset, this module returns a
 * precise evidence report and the site keeps its deterministic abstract artwork.
 *
 * Generated starter images are never treated as proof of the business's real
 * work, team, awards or results. They are saved with provenance and attached to
 * renderable hero/service/CTA slots only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { generateImageBase64, decodeBase64 } from "@/lib/image-studio.server";
import { generatePaidImageBase64, paidImageStatus } from "@/lib/ai/paid-image.server";
import { gradeFirstBuildImages } from "@/lib/builder/first-build-image-qa";
import type {
  FirstBuildImageAsset,
  FirstBuildImageEvidence,
  FirstBuildImageSource,
} from "@/lib/builder/first-build-images.types";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import {
  CANDIDATE_STYLES,
  VISUAL_DIRECTIONS,
  altTextFor,
  buildImageBrief,
  type PlannedShot,
} from "@/lib/visual-direction";

type Db = SupabaseClient;

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const SAFE_STARTER_SLOTS = new Set<PlannedShot["slot"]>([
  "hero",
  "service",
  "background",
  "cta",
  "social",
]);

export type {
  FirstBuildImageAsset,
  FirstBuildImageEvidence,
} from "@/lib/builder/first-build-images.types";

export type FirstBuildImageResult = {
  assets: FirstBuildImageAsset[];
  evidence: FirstBuildImageEvidence;
};

function maxStarterImages() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_MAX"] ?? "");
  // Enough coverage for the hero, several service pages and campaign support,
  // while keeping generation finite and respecting the configured cost lane.
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 12) : 10;
}

function safeSlot(shot: PlannedShot) {
  if (!SAFE_STARTER_SLOTS.has(shot.slot)) return false;
  if (shot.placement.some((place) => /gallery|proof|testimonial|team/i.test(place))) return false;
  return !/team|result|completed work|proof/i.test(`${shot.label} ${shot.purpose}`);
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
  const singularSlots = new Set<PlannedShot["slot"]>(["hero", "background", "cta", "social"]);
  const shots: PlannedShot[] = [];
  for (const shot of creative.imagery.shots) {
    if (!safeSlot(shot)) continue;
    // An existing owner picture is presumed to cover the hero first. It should
    // not suppress safe supporting marketing pictures for the rest of the site.
    if (occupiedSlots.has(shot.slot)) continue;
    const key = singularSlots.has(shot.slot) ? shot.slot : `${shot.slot}:${shot.label.toLowerCase()}`;
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
  },
): Promise<FirstBuildImageResult> {
  const direction =
    VISUAL_DIRECTIONS.find((item) => item.id === input.creative.imagery.directionId) ?? null;
  const shots = firstBuildImageShots(input.creative, input.photoCount, input.occupiedSlots);
  if (!direction || shots.length === 0) {
    const ownerCovered = input.occupiedSlots?.size && shots.length === 0;
    return {
      assets: [],
      evidence: {
        status: ownerCovered ? "owner_photos" : "fallback_artwork",
        requested: shots.length,
        generated: 0,
        attached: 0,
        skipped: shots.map((shot) => ({ slot: shot.slot, label: shot.label, reason: "no safe generated slot" })),
        provider: null,
        models: [],
        message: ownerCovered
          ? "Owner-supplied photos cover the available picture roles."
          : "No safe first-build picture slots were available, so Revora used abstract artwork.",
      },
    };
  }

  const assets: FirstBuildImageAsset[] = [];
  const skipped: FirstBuildImageEvidence["skipped"] = [];
  const models = new Set<string>();
  let provider: string | null = null;
  let firstBlockedMessage: string | null = null;
  let source: FirstBuildImageSource = "none";
  let paidCostMicrocents = 0;
  const paid = paidImageStatus();
  // Free first, always. The paid backup is only ever reached when the free
  // service is genuinely unavailable AND the operator switched it on, and every
  // paid picture is charged against the same durable monthly cap.
  let freeBlocked = false;


  for (const [index, shot] of shots.entries()) {
    const style = CANDIDATE_STYLES[index % CANDIDATE_STYLES.length] ?? CANDIDATE_STYLES[0];
    const brief = buildImageBrief({
      direction,
      shot,
      style,
      businessName: input.businessName,
      city: input.city,
      primaryColor: input.creative.fingerprint.colorSystem,
      accentColor: input.creative.fingerprint.colorSystem,
      seed: `${input.organizationId}:${shot.slot}:${index}`,
      extra: [
        artDirectionNote(input.creative, shot),
        "Starter website image only. Do not depict a real employee, actual customer, award, review, brand logo, licence plate, address, or before-and-after result.",
      ]
        .filter(Boolean)
        .join(" "),
    });

    type Made = { base64: string; mimeType: string; provider: string; model: string };
    let made: Made | null = null;

    if (!freeBlocked) {
      const free = await generateImageBase64(brief.prompt, {
        organizationId: input.organizationId,
        userId: input.userId,
      });
      if (free.ok) {
        made = free;
        source = source === "paid" ? source : "free";
      } else {
        firstBlockedMessage = firstBlockedMessage ?? free.message;
        if (free.blocked) freeBlocked = true;
        else skipped.push({ slot: shot.slot, label: shot.label, reason: free.message });
      }
    }

    if (!made && paid.allowed) {
      // Job-aware routing: the hero frame the page is composed around goes to the
      // premium picture tier, supporting photography to the fast tier.
      const backup = await generatePaidImageBase64(
        brief.prompt,
        { organizationId: input.organizationId, userId: input.userId },
        shot.slot === "hero" ? "hero_master" : shot.slot === "service" ? "service_photo" : "starter_photo",
      );
      if (backup.ok) {
        made = backup;
        paidCostMicrocents += backup.costMicrocents;
        source = "paid";
      } else {
        firstBlockedMessage = firstBlockedMessage ?? backup.message;
        skipped.push({ slot: shot.slot, label: shot.label, reason: backup.message });
        if (backup.reason === "budget_exhausted" || backup.reason === "disabled") break;
      }
    }

    if (!made) {
      if (freeBlocked && !paid.allowed) {
        skipped.push({
          slot: shot.slot,
          label: shot.label,
          reason: firstBlockedMessage ?? paid.message,
        });
        break;
      }
      continue;
    }

    const image = made;
    const mime = image.mimeType.split(";")[0]?.trim().toLowerCase() ?? "image/png";
    const extension = MIME_EXTENSION[mime] ?? "png";
    const bytes = decodeBase64(image.base64);
    const path = buildObjectPath(input.organizationId, `${fileStem(shot, index)}.${extension}`);

    const { error: uploadError } = await db.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: uploadError.message });
      continue;
    }

    const altText = altTextFor(shot, input.businessName);
    const { data: row, error: rowError } = await db
      .from("media")
      .insert({
        organization_id: input.organizationId,
        url: path,
        category: shot.slot === "hero" ? "hero" : shot.slot === "service" ? "work" : "other",
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
      continue;
    }

    provider = image.provider;
    models.add(image.model);
    assets.push({
      slot: shot.slot,
      label: shot.label,
      altText,
      path,
      mediaId: row?.["id"] ? String(row["id"]) : null,
      provider: image.provider,
      model: image.model,
      prompt: brief.prompt,
      placement: shot.placement,
      aspectRatio: shot.aspect,
    });
  }

  // Quality gate: a picture that is unsafe for its slot, undescribed, unstored or
  // duplicated never reaches the website. That slot keeps Revora's own artwork.
  const graded = gradeFirstBuildImages(assets);
  const kept = graded.accepted;
  const status = kept.length ? "generated" : skipped.length || graded.rejected.length ? "fallback_artwork" : "failed";
  const laneLabel = source === "paid" ? "paid backup picture service" : "free picture service";

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
              ? ` ${graded.rejected.length} more were rejected by the picture check and those spots kept Revora's own artwork.`
              : ""
          }`
        : (firstBlockedMessage ??
          graded.rejected[0]?.reason ??
          "Starter picture making did not complete, so Revora used its own artwork."),
    },
  };
}

export function firstBuildImageEvidenceJson(evidence: FirstBuildImageEvidence): Json {
  return evidence as unknown as Json;
}

/** Removes only assets created by this generation attempt. Owner media is never touched. */
export async function cleanupFirstBuildImages(db: Db, assets: FirstBuildImageAsset[]): Promise<void> {
  const paths = [...new Set(assets.map((asset) => asset.path).filter(Boolean))];
  const ids = [...new Set(assets.map((asset) => asset.mediaId).filter((id): id is string => Boolean(id)))];
  if (paths.length) await db.storage.from(MEDIA_BUCKET).remove(paths);
  if (ids.length) await db.from("media").delete().in("id", ids);
}