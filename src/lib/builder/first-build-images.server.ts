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

export type FirstBuildImageAsset = {
  slot: PlannedShot["slot"];
  label: string;
  altText: string;
  path: string;
  mediaId: string | null;
  provider: string;
  model: string;
  prompt: string;
  placement: string[];
  aspectRatio: PlannedShot["aspect"];
};

export type FirstBuildImageEvidence = {
  status: "generated" | "owner_photos" | "fallback_artwork" | "failed";
  requested: number;
  generated: number;
  attached: number;
  skipped: { slot: string; label: string; reason: string }[];
  provider: string | null;
  models: string[];
  message: string;
};

export type FirstBuildImageResult = {
  assets: FirstBuildImageAsset[];
  evidence: FirstBuildImageEvidence;
};

function maxStarterImages() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_MAX"] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 6) : 4;
}

function safeSlot(shot: PlannedShot) {
  if (!SAFE_STARTER_SLOTS.has(shot.slot)) return false;
  if (shot.placement.some((place) => /gallery|proof|testimonial|team/i.test(place))) return false;
  return !/team|result|completed work|proof/i.test(`${shot.label} ${shot.purpose}`);
}

function fileStem(shot: PlannedShot, index: number) {
  return `first-build-${index + 1}-${shot.slot}-${shot.label || "image"}`;
}

export function firstBuildImageShots(
  creative: FirstBuildCreativeDirection,
  photoCount: number,
): PlannedShot[] {
  if (photoCount > 0) return [];
  const unique = new Set<string>();
  const shots: PlannedShot[] = [];
  for (const shot of creative.imagery.shots) {
    if (!safeSlot(shot)) continue;
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
    creative: FirstBuildCreativeDirection;
  },
): Promise<FirstBuildImageResult> {
  if (input.photoCount > 0) {
    return {
      assets: [],
      evidence: {
        status: "owner_photos",
        requested: 0,
        generated: 0,
        attached: 0,
        skipped: [],
        provider: null,
        models: [],
        message: "Owner-supplied photos were already present, so generated starter images were not used.",
      },
    };
  }

  const direction =
    VISUAL_DIRECTIONS.find((item) => item.id === input.creative.imagery.directionId) ?? null;
  const shots = firstBuildImageShots(input.creative, input.photoCount);
  if (!direction || shots.length === 0) {
    return {
      assets: [],
      evidence: {
        status: "fallback_artwork",
        requested: shots.length,
        generated: 0,
        attached: 0,
        skipped: shots.map((shot) => ({ slot: shot.slot, label: shot.label, reason: "no safe generated slot" })),
        provider: null,
        models: [],
        message: "No safe first-build picture slots were available, so Revora used abstract artwork.",
      },
    };
  }

  const assets: FirstBuildImageAsset[] = [];
  const skipped: FirstBuildImageEvidence["skipped"] = [];
  const models = new Set<string>();
  let provider: string | null = null;
  let firstBlockedMessage: string | null = null;

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
      extra:
        "Starter website image only. Do not depict a real employee, actual customer, award, review, brand logo, licence plate, address, or before-and-after result.",
    });

    const image = await generateImageBase64(brief.prompt, {
      organizationId: input.organizationId,
      userId: input.userId,
    }, { paidFallback: true });
    if (!image.ok) {
      firstBlockedMessage = firstBlockedMessage ?? image.message;
      skipped.push({ slot: shot.slot, label: shot.label, reason: image.message });
      if (image.blocked) break;
      continue;
    }

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

    provider = provider ?? image.provider;
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

  const status = assets.length ? "generated" : skipped.length ? "fallback_artwork" : "failed";
  return {
    assets,
    evidence: {
      status,
      requested: shots.length,
      generated: assets.length,
      attached: 0,
      skipped,
      provider,
      models: [...models],
      message: assets.length
        ? `Generated ${assets.length} starter website image(s) from the free picture service.`
        : (firstBlockedMessage ?? "Starter picture generation did not complete, so Revora used abstract artwork."),
    },
  };
}

export function firstBuildImageEvidenceJson(evidence: FirstBuildImageEvidence): Json {
  return evidence as unknown as Json;
}