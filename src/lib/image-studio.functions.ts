/**
 * Authenticated AI Image Studio endpoints.
 *
 * Every call runs through the caller's own Supabase client, so one workspace can
 * never generate into — or read from — another workspace's media folder.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import { decodeBase64, generateImageBase64 } from "@/lib/image-studio.server";

export type StudioImageResult = {
  ok: boolean;
  blocked?: boolean;
  message?: string;
  /** Machine-readable outcome, so the builder never fabricates success. */
  code?: "READY" | "IMAGE_GENERATION_UNAVAILABLE" | "IMAGE_GENERATION_FAILED" | "FORBIDDEN";
  reason?: string;
  /** Storage object path, ready to store on a section or profile field. */
  path?: string;
  /** Short-lived preview URL. */
  preview?: string;
  mediaId?: string;
  /** Honest provenance shown in the builder: generated, uploaded or fallback. */
  source?: "generated";
  provider?: string;
  model?: string;
  cached?: boolean;
};

/** Aspect ratios the builder offers; folded into the brief, never invented. */
const ASPECT_GUIDANCE: Record<string, string> = {
  "16:9": "Wide 16:9 landscape framing suitable for a full-width banner.",
  "4:3": "Classic 4:3 landscape framing suitable for a content card.",
  "1:1": "Square 1:1 framing suitable for a tile or avatar-safe crop.",
  "3:2": "3:2 landscape framing suitable for a gallery photo.",
  "21:9": "Very wide 21:9 cinematic framing suitable for a hero strip.",
  "9:16": "Tall 9:16 portrait framing suitable for a phone-first panel.",
};

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function assertCanManage(
  supabase: { from: (table: string) => any },
  organizationId: string,
  userId: unknown,
) {
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "Couldn't verify workspace access.";
  if (!membership || !["owner", "admin", "editor"].includes(String(membership.role)))
    return "You don't have permission to add photos to this website.";
  return null;
}

export const generateStudioImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>;
    const organizationId = String(input["organizationId"] ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    const prompt = String(input["prompt"] ?? "")
      .trim()
      .slice(0, 4000);
    if (prompt.length < 20) throw new Error("Image brief is too short");
    const aspect = String(input["aspectRatio"] ?? "");
    const focal = String(input["focalPoint"] ?? "").slice(0, 20);
    return {
      organizationId,
      prompt,
      aspectRatio: aspect in ASPECT_GUIDANCE ? aspect : null,
      focalPoint: /^\d(?:\.\d+)? \d(?:\.\d+)?$/.test(focal) ? focal : null,
      altText: String(input["altText"] ?? "")
        .trim()
        .slice(0, 200),
      category: String(input["category"] ?? "other").slice(0, 40),
      label: String(input["label"] ?? "revora-image").slice(0, 60),
    };
  })
  .handler(async ({ data, context }): Promise<StudioImageResult> => {
    const supabase = context.supabase;

    const denied = await assertCanManage(supabase as never, data.organizationId, context.userId);
    if (denied) return { ok: false, message: denied, code: "FORBIDDEN" };

    const brief = data.aspectRatio
      ? `${data.prompt}\n\nFraming: ${ASPECT_GUIDANCE[data.aspectRatio]}`
      : data.prompt;

    const image = await generateImageBase64(brief, {
      organizationId: data.organizationId,
      userId: context.userId ? String(context.userId) : null,
    });
    if (!image.ok)
      return {
        ok: false,
        blocked: image.blocked,
        message: image.message,
        code: image.code,
        reason: image.reason,
      };

    const bytes = decodeBase64(image.base64);
    const extension = MIME_EXTENSION[image.mimeType.split(";")[0] ?? ""] ?? "png";
    const path = buildObjectPath(
      data.organizationId,
      `${data.label || "revora-image"}.${extension}`,
    );

    // An identical request that was already made and stored for this business is
    // reused, so the same picture is never saved to the library twice.
    if (image.cached) {
      const { data: existing } = await supabase
        .from("media")
        .select("id, url")
        .eq("organization_id", data.organizationId)
        .eq("size_bytes", bytes.byteLength)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingPath = existing?.["url"] ? String(existing["url"]) : null;
      if (existingPath) {
        const { data: reusedSigned } = await supabase.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(existingPath, 60 * 60);
        return {
          ok: true,
          code: "READY",
          path: existingPath,
          preview: reusedSigned?.signedUrl ?? existingPath,
          source: "generated",
          provider: image.provider,
          model: image.model,
          cached: true,
          ...(existing?.["id"] ? { mediaId: String(existing["id"]) } : {}),
        };
      }
    }


    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: image.mimeType, upsert: false });
    if (uploadError)
      return { ok: false, message: uploadError.message, code: "IMAGE_GENERATION_FAILED" };

    const { data: row, error: rowError } = await supabase
      .from("media")
      .insert({
        organization_id: data.organizationId,
        url: path,
        category: data.category,
        file_name: `${data.label || "revora-image"}.${extension}`,
        size_bytes: bytes.byteLength,
        alt_text: data.altText || null,
      } as never)
      .select("id")
      .maybeSingle();
    if (rowError) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return { ok: false, message: rowError.message, code: "IMAGE_GENERATION_FAILED" };
    }

    const { data: signed } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, 60 * 60);

    return {
      ok: true,
      code: "READY",
      path,
      preview: signed?.signedUrl ?? path,
      source: "generated",
      provider: image.provider,
      model: image.model,
      cached: image.cached,
      ...(row?.id ? { mediaId: String(row.id) } : {}),
    };
  });

export type StudioCapability = {
  available: boolean;
  reason: string;
  message: string;
  editSupported: boolean;
  /** Pictures left in today's free allowance across ready providers. */
  remainingToday: number | null;
  /** Provider labels only — never a credential value. */
  providers: { provider: string; models: number; remainingToday: number; dailyCap: number }[];
};

/**
 * Live free picture-making status for the builder UI. Membership is checked, and
 * only counts and provider names are returned — never a credential.
 */
export const studioImageStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const organizationId = String((data as Record<string, unknown>)?.["organizationId"] ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<StudioCapability> => {
    const denied = await assertCanManage(
      context.supabase as never,
      data.organizationId,
      context.userId,
    );
    if (denied)
      return {
        available: false,
        reason: "forbidden",
        message: denied,
        editSupported: false,
        remainingToday: null,
        providers: [],
      };

    const { imageGenerationCapability } = await import("@/lib/media/image-capability.server");
    const capability = await imageGenerationCapability();
    return {
      available: capability.available,
      reason: capability.reason,
      message: capability.message,
      editSupported: capability.editSupported,
      remainingToday: capability.providers.length
        ? capability.providers.reduce((total, entry) => total + entry.remainingToday, 0)
        : null,
      providers: capability.providers.map((entry) => ({
        provider: entry.provider,
        models: entry.models.length,
        remainingToday: entry.remainingToday,
        dailyCap: entry.dailyCap,
      })),
    };
  });
