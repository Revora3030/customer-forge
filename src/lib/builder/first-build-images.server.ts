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
import { inspectPhoto } from "@/lib/ai/photo-direction.server";
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

function maxStarterImages() {
  const raw = Number(process.env["FIRST_BUILD_IMAGE_MAX"] ?? "");
  // Every page that needs a picture must get one on the first build: the hero,
  // each service page, the about page, campaign support and closing sections.
  // The ceiling only keeps generation finite; it is not a quality budget.
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 28) : 24;
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
  },
): Promise<FirstBuildImageResult> {
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

  const assets: FirstBuildImageAsset[] = [];
  const skipped: FirstBuildImageEvidence["skipped"] = [];
  const models = new Set<string>();
  let provider: string | null = null;
  let firstBlockedMessage: string | null = null;
  let source: FirstBuildImageSource = "none";
  let paidCostMicrocents = 0;
  const paid = paidImageStatus();
  // Quality first. Sunburst owns hero/editorial frames and Flare owns supporting
  // imagery when enabled and inside the durable budget gate. The standard lane
  // is capability-aware failover, not the default merely because it is free.
  let standardBlocked = false;
  // A busy or briefly rate-limited picture service is not a closed one. Pause
  // and try again a few times before giving up on the remaining pictures, so a
  // momentary 429 no longer leaves most pages of a first build without images.
  let blockedStrikes = 0;
  const MAX_BLOCKED_STRIKES = 3;


  for (const [index, shot] of shots.entries()) {
    const spec = input.creative.brief.imageInventory.find(
      (item) => item.slot === shot.slot && item.label === shot.label,
    );
    if (!spec?.subject || !spec.altText) {
      skipped.push({ slot: shot.slot, label: shot.label, reason: "the AI picture campaign was incomplete" });
      continue;
    }
    // Most important instructions first: picture models (Flux caps prompts at
    // 2048 characters) weigh the start of the prompt most, and anything past
    // the cap is cut — so the subject and the safety rules lead, and the long
    // art-direction notes follow.
    const prompt = [
      `Photorealistic professional website photograph of ${spec.subject}. No text, logos, watermarks, signage or recognisable real people.`,
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

    type Made = { base64: string; mimeType: string; provider: string; model: string };
    let made: Made | null = null;

    if (paid.allowed) {
      const specialist = await generatePaidImageBase64(
        prompt,
        { organizationId: input.organizationId, userId: input.userId },
        /hero|masthead|opening|lead/i.test(`${shot.slot} ${shot.placement.join(" ")}`)
          ? "hero_master"
          : /about|story|editorial/i.test(`${shot.slot} ${shot.placement.join(" ")}`)
            ? "editorial_feature"
            : /service|offering/i.test(`${shot.slot} ${shot.placement.join(" ")}`)
              ? "service_photo"
              : "starter_photo",
      );
      if (specialist.ok) {
        made = specialist;
        paidCostMicrocents += specialist.costMicrocents;
        source = "premium";
      } else {
        firstBlockedMessage = firstBlockedMessage ?? specialist.message;
      }
    }

    for (let tries = 0; !made && !standardBlocked && tries < 2; tries += 1) {
      const standard = await generateImageBase64(prompt, {
        organizationId: input.organizationId,
        userId: input.userId,
      });
      if (standard.ok) {
        made = standard;
        source = source === "premium" ? source : "standard";
        blockedStrikes = 0;
        break;
      }
      firstBlockedMessage = firstBlockedMessage ?? standard.message;
      if (standard.blocked) {
        blockedStrikes += 1;
        if (blockedStrikes >= MAX_BLOCKED_STRIKES) {
          standardBlocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 4000 * blockedStrikes));
        continue;
      }
      if (tries === 1) skipped.push({ slot: shot.slot, label: shot.label, reason: standard.message });
    }

    if (!made) {
      if (standardBlocked) {
        skipped.push({
          slot: shot.slot,
          label: shot.label,
          reason: firstBlockedMessage ?? paid.message,
        });
        break;
      }
      continue;
    }

    // Terra inspects the finished frame before it is saved. One corrected
    // reshoot only. A picture Terra rejected is never saved: if the reshoot
    // fails or is also rejected, the slot is left empty rather than showing a
    // low-quality or off-brief picture. A reviewer that cannot answer never
    // costs the business a usable picture.
    const verdict = await inspectPhoto(
      { base64: made.base64, mimeType: made.mimeType },
      { prompt, placement: `${shot.slot} ${shot.placement.join(" ")}`.trim() },
      { organizationId: input.organizationId, userId: input.userId },
    );
    if (!verdict.publishable) {
      let replaced = false;
      if (paid.allowed) {
        const reshoot = await generatePaidImageBase64(
          verdict.revisedPrompt ?? `${prompt} Fix these problems: ${verdict.defects.join("; ")}.`,
          { organizationId: input.organizationId, userId: input.userId },
          /hero|masthead|opening|lead/i.test(`${shot.slot} ${shot.placement.join(" ")}`)
            ? "hero_master"
            : "editorial_feature",
        );
        if (reshoot.ok) {
          paidCostMicrocents += reshoot.costMicrocents;
          const recheck = await inspectPhoto(
            { base64: reshoot.base64, mimeType: reshoot.mimeType },
            { prompt: verdict.revisedPrompt ?? prompt, placement: shot.slot },
            { organizationId: input.organizationId, userId: input.userId },
          );
          if (recheck.publishable) {
            made = reshoot;
            source = "premium";
            replaced = true;
          }
        }
      }
      if (!replaced) {
        skipped.push({
          slot: shot.slot,
          label: shot.label,
          reason: `picture failed quality review (${verdict.defects.join("; ") || "off-brief"})`,
        });
        continue;
      }
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

    const altText = spec.altText;
    const { data: row, error: rowError } = await db
      .from("media")
      .insert({
        organization_id: input.organizationId,
        url: path,
        category: /hero|masthead|opening|lead/i.test(`${shot.slot} ${shot.placement.join(" ")}`) ? "hero" : "other",
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
      prompt,
      placement: shot.placement,
      aspectRatio: shot.aspect,
    });
  }

  // Quality gate: a picture that is unsafe for its slot, undescribed, unstored or
  // duplicated never reaches the website. Required slots fail materialization.
  const graded = gradeFirstBuildImages(assets);
  const kept = graded.accepted;
  const status = kept.length ? "generated" : skipped.length || graded.rejected.length ? "blocked" : "failed";
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