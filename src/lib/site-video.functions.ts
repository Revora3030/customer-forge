/**
 * Moving backgrounds for a website section.
 *
 * One authenticated call generates a short, silent, looping clip, stores it in
 * the workspace's own private media folder and points the section's media block
 * at it. Everything runs through the caller's own client, so RLS keeps one
 * client's website out of another's. The previous picture is kept as the still
 * frame the visitor sees first, and the whole change is reversible: the picture
 * path stays on the record until the owner replaces it.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import { writeComponentVisual } from "@/lib/site-style";
import { generateSiteVideo, paidVideoStatus } from "@/lib/ai/paid-video.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VIDEO_KINDS = new Set(["image", "media", "photo", "hero_image", "video"]);

/** Whether moving backgrounds can be made right now. Safe to show an owner. */
export const sectionVideoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => paidVideoStatus());

/** Sol's hero-video idea from the first build, if any. The owner still decides whether to make it. */
export const heroVideoBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => {
    const id = String(input?.organizationId ?? "");
    if (!UUID.test(id)) throw new Error("Invalid workspace");
    return { organizationId: id };
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("website_settings").select("generation").eq("organization_id", data.organizationId).maybeSingle();
    const brief = (row?.generation as Record<string, unknown> | null)?.["heroVideoBrief"];
    return { brief: typeof brief === "string" ? brief.slice(0, 600) : null };
  });

export const generateSectionVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      organizationId: string;
      componentId: string;
      prompt: string;
      alt?: string;
      tier?: "standard" | "premium";
      seconds?: number;
    }) => {
      const organizationId = String(input?.organizationId ?? "");
      const componentId = String(input?.componentId ?? "");
      if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
      if (!UUID.test(componentId)) throw new Error("Pick the picture you want to bring to life.");
      const prompt = String(input?.prompt ?? "").trim().slice(0, 1200);
      if (prompt.length < 10)
        throw new Error("Describe the moving background you want, in your own words.");
      const alt = String(input?.alt ?? "").trim().slice(0, 160);
      const seconds = Number(input?.seconds ?? 8);
      return {
        organizationId,
        componentId,
        prompt,
        alt,
        tier: input?.tier === "premium" ? ("premium" as const) : ("standard" as const),
        seconds: Number.isFinite(seconds) ? seconds : 8,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS gate: a member only ever sees their own workspace's blocks.
    const { data: component, error } = await supabase
      .from("website_components")
      .select("id, kind, label, media_url, settings")
      .eq("id", data.componentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !component) throw new Error("That part of the page could not be found.");
    if (!VIDEO_KINDS.has(String(component.kind)))
      throw new Error("A moving background can only replace a picture block.");

    const result = await generateSiteVideo(
      { prompt: data.prompt, tier: data.tier, seconds: data.seconds },
      { organizationId: data.organizationId, userId },
    );
    if (!result.ok) return { ok: false as const, message: result.message, reason: result.reason };

    const path = buildObjectPath(data.organizationId, `motion-${data.componentId}.mp4`);
    const uploaded = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, result.bytes, { contentType: "video/mp4", upsert: false });
    if (uploaded.error)
      return {
        ok: false as const,
        reason: "storage" as const,
        message: "The clip was made but could not be saved, so the section kept its picture.",
      };

    const previousPicture = typeof component.media_url === "string" ? component.media_url : null;
    const alt =
      data.alt || (component.label ? `${component.label} moving background` : "Moving background");

    const media = await supabase
      .from("media")
      .insert({
        organization_id: data.organizationId,
        url: path,
        category: "other",
        file_name: `motion-${data.componentId}.mp4`,
        size_bytes: result.bytes.byteLength,
        alt_text: alt,
      } as never)
      .select("id")
      .maybeSingle();
    if (media.error) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      return {
        ok: false as const,
        reason: "storage" as const,
        message: "The clip could not be added to your media library, so nothing was changed.",
      };
    }

    const settings = writeComponentVisual(component.settings, {
      media_kind: "video",
      alt,
      object_fit: "cover",
      source: "generated",
    });
    const update = await supabase
      .from("website_components")
      .update({ media_url: path, settings } as never)
      .eq("id", data.componentId)
      .eq("organization_id", data.organizationId);
    if (update.error) {
      await supabase.storage.from(MEDIA_BUCKET).remove([path]);
      if (media.data?.id)
        await supabase
          .from("media")
          .delete()
          .eq("id", media.data.id)
          .eq("organization_id", data.organizationId);
      return {
        ok: false as const,
        reason: "storage" as const,
        message: "The section could not be updated, so it kept its picture.",
      };
    }

    await supabase.from("ai_generations").insert({
      organization_id: data.organizationId,
      kind: "video_generation",
      model: result.model,
      instruction: data.prompt,
      result: { path, seconds: result.seconds, replaced: previousPicture } as unknown as never,
      created_by: userId,
    });

    return {
      ok: true as const,
      message: `A ${result.seconds}-second moving background is now live in your preview.`,
      model: result.model,
      seconds: result.seconds,
    };
  });
