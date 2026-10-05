/**
 * Website picture approval and single-picture regeneration (spec D).
 *
 * Every call runs through the caller's own Supabase client, so RLS on
 * image_records / media / storage keeps one workspace out of another's
 * pictures. Writes require manager or above (checked here and by RLS).
 *
 * Regenerating replaces ONE picture: the new image is stored as a new library
 * item, the slot's components that showed the old picture are pointed at the
 * new one in the draft, and nothing is published. Owner photos are never
 * regenerated.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import {
  isRenderableImageResponse,
  normaliseSlot,
  regenerationBrief,
  transitionImage,
  type ImageRecordState,
  type ImageStatus,
} from "@/lib/builder/image-records";

const UUID = /^[0-9a-f-]{36}$/i;

export type ImageRecord = {
  id: string;
  slot: string;
  direction: string;
  altText: string | null;
  source: "generated" | "owner" | "stock";
  status: ImageStatus;
  rejectionReason: string | null;
  mediaId: string | null;
  path: string | null;
  preview: string | null;
  renderedVerifiedAt: string | null;
  generation: number;
  provider: string | null;
  model: string | null;
};

type Row = {
  id: string;
  slot: string;
  direction: string;
  alt_text: string | null;
  source: ImageRecord["source"];
  status: ImageStatus;
  rejection_reason: string | null;
  media_id: string | null;
  rendered_url: string | null;
  rendered_verified_at: string | null;
  generation: number;
  provider: string | null;
  model: string | null;
};

const COLUMNS =
  "id, slot, direction, alt_text, source, status, rejection_reason, media_id, rendered_url, rendered_verified_at, generation, provider, model";

// image_records is new in migration 20261005140000; use an untyped view of the
// caller's RLS client until the generated types are refreshed.
const db = (client: unknown) => client as SupabaseClient;

async function requireManager(supabase: unknown, organizationId: string, userId: string) {
  const { requireOrgRole } = await import("@/lib/org-authz.server");
  await requireOrgRole(supabase as never, organizationId, userId, "manager");
}

async function loadRecord(supabase: unknown, organizationId: string, id: string): Promise<Row> {
  const { data, error } = await db(supabase)
    .from("image_records")
    .select(COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Couldn't read that picture right now.");
  if (!data) throw new Error("That picture is no longer on this website.");
  return data as Row;
}

/** Lists every picture record with a short-lived preview URL. */
export const listImageRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<{ records: ImageRecord[] }> => {
    const { data: rows, error } = await db(context.supabase)
      .from("image_records")
      .select(COLUMNS)
      .eq("organization_id", data.organizationId)
      .order("slot");
    if (error) throw new Error("Couldn't load your website pictures.");
    const list = (rows ?? []) as Row[];
    const paths = list.map((row) => row.rendered_url).filter((p): p is string => Boolean(p) && !/^https?:/i.test(p!));
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data: urls } = await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60);
      for (const entry of urls ?? []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
    return {
      records: list.map((row) => ({
        id: row.id,
        slot: row.slot,
        direction: row.direction,
        altText: row.alt_text,
        source: row.source,
        status: row.status,
        rejectionReason: row.rejection_reason,
        mediaId: row.media_id,
        path: row.rendered_url,
        preview: row.rendered_url ? (signed.get(row.rendered_url) ?? row.rendered_url) : null,
        renderedVerifiedAt: row.rendered_verified_at,
        generation: row.generation,
        provider: row.provider,
        model: row.model,
      })),
    };
  });

/**
 * Records (or refreshes) the picture currently used in a slot. Called by the
 * builder after a picture lands on the site; idempotent per slot.
 */
export const upsertImageRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: {
    organizationId: string;
    slot: string;
    direction?: string;
    altText?: string;
    source?: string;
    mediaId?: string | null;
    path?: string | null;
    provider?: string | null;
    model?: string | null;
  }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    const slot = normaliseSlot(input?.slot);
    if (!slot) throw new Error("Invalid picture slot");
    const path = input?.path ? String(input.path) : null;
    if (path && (!path.startsWith(`${organizationId}/`) || path.includes("..")))
      throw new Error("That picture doesn't belong to this website");
    const source = input?.source === "owner" || input?.source === "stock" ? input.source : "generated";
    return {
      organizationId,
      slot,
      direction: String(input?.direction ?? "").slice(0, 4000),
      altText: input?.altText ? String(input.altText).slice(0, 200) : null,
      source: source as ImageRecord["source"],
      mediaId: input?.mediaId && UUID.test(String(input.mediaId)) ? String(input.mediaId) : null,
      path,
      provider: input?.provider ? String(input.provider).slice(0, 80) : null,
      model: input?.model ? String(input.model).slice(0, 120) : null,
    };
  })
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, data.organizationId, context.userId);
    const { data: row, error } = await db(context.supabase)
      .from("image_records")
      .upsert(
        {
          organization_id: data.organizationId,
          slot: data.slot,
          direction: data.direction,
          alt_text: data.altText,
          source: data.source,
          media_id: data.mediaId,
          rendered_url: data.path,
          rendered_verified_at: null,
          provider: data.provider,
          model: data.model,
          status: data.source === "owner" ? "approved" : "pending",
        },
        { onConflict: "organization_id,slot" },
      )
      .select("id")
      .single();
    if (error || !row) throw new Error("Couldn't save that picture record.");
    return { id: String((row as { id: string }).id) };
  });

/** Approves or rejects one picture. A rejection reason guides regeneration. */
export const decideImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; recordId: string; decision: "approve" | "reject"; reason?: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const recordId = String(input?.recordId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    if (!UUID.test(recordId)) throw new Error("Invalid picture");
    const decision = input?.decision === "reject" ? "reject" : "approve";
    return { organizationId, recordId, decision, reason: String(input?.reason ?? "").trim().slice(0, 500) } as const;
  })
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, data.organizationId, context.userId);
    const row = await loadRecord(context.supabase, data.organizationId, data.recordId);
    const next = transitionImage(row as ImageRecordState, data.decision);
    if (!next.ok) throw new Error(next.reason);
    const { error } = await db(context.supabase)
      .from("image_records")
      .update({
        status: next.status,
        rejection_reason: data.decision === "reject" ? data.reason || null : null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("organization_id", data.organizationId)
      .eq("status", row.status);
    if (error) throw new Error("Couldn't save your decision. Try again.");
    return { status: next.status };
  });

/**
 * Regenerates ONE picture from its recorded direction (plus the rejection
 * reason). On success the draft's components that showed the old picture are
 * pointed at the new one; on failure the old picture stays in place.
 */
export const regenerateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; recordId: string; note?: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const recordId = String(input?.recordId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    if (!UUID.test(recordId)) throw new Error("Invalid picture");
    return { organizationId, recordId, note: String(input?.note ?? "").trim().slice(0, 400) };
  })
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, data.organizationId, context.userId);
    const client = db(context.supabase);
    const row = await loadRecord(context.supabase, data.organizationId, data.recordId);
    const start = transitionImage(row as ImageRecordState, "regenerate");
    if (!start.ok) throw new Error(start.reason);
    // Claim the slot (compare-and-set on status) so two clicks never run twice.
    const { data: claimed } = await client
      .from("image_records")
      .update({ status: "regenerating" })
      .eq("id", row.id)
      .eq("organization_id", data.organizationId)
      .eq("status", row.status)
      .select("id");
    if (!claimed?.length) throw new Error("A new picture is already being made.");

    const fail = async (message: string) => {
      await client
        .from("image_records")
        .update({ status: "failed" })
        .eq("id", row.id)
        .eq("organization_id", data.organizationId)
        .eq("status", "regenerating");
      return { ok: false as const, message };
    };

    try {
      const { generateImageBase64, decodeBase64 } = await import("@/lib/image-studio.server");
      const image = await generateImageBase64(regenerationBrief(row.direction, row.rejection_reason, data.note), {
        organizationId: data.organizationId,
        userId: String(context.userId),
      });
      if (!image.ok) return await fail(image.message ?? "No picture model is available right now. Your current picture is unchanged.");
      const bytes = decodeBase64(image.base64);
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[image.mimeType.split(";")[0] ?? ""] ?? "png";
      const path = buildObjectPath(data.organizationId, `${row.slot.replace(/[^a-z0-9]+/g, "-")}-v${row.generation + 1}.${extension}`);
      const { error: uploadError } = await context.supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, bytes, { contentType: image.mimeType, upsert: false });
      if (uploadError) return await fail("The new picture couldn't be saved. Your current picture is unchanged.");
      const { data: media, error: mediaError } = await context.supabase
        .from("media")
        .insert({
          organization_id: data.organizationId,
          url: path,
          category: "other",
          file_name: path.split("/").pop() ?? path,
          size_bytes: bytes.byteLength,
          alt_text: row.alt_text,
          source: "generated",
        } as never)
        .select("id")
        .maybeSingle();
      if (mediaError) {
        await context.supabase.storage.from(MEDIA_BUCKET).remove([path]);
        return await fail("The new picture couldn't be added to your library. Your current picture is unchanged.");
      }
      // Point the draft's components that showed the old picture at the new one.
      if (row.rendered_url) {
        await context.supabase
          .from("website_components")
          .update({ media_url: path })
          .eq("organization_id", data.organizationId)
          .eq("media_url", row.rendered_url);
      }
      const done = transitionImage({ ...(row as ImageRecordState), status: "regenerating" }, "regenerated");
      await client
        .from("image_records")
        .update({
          status: done.ok ? done.status : "pending",
          generation: done.ok ? done.generation : row.generation + 1,
          media_id: (media as { id?: string } | null)?.id ?? null,
          rendered_url: path,
          rendered_verified_at: null,
          rejection_reason: null,
          provider: image.provider ?? null,
          model: image.model ?? null,
        })
        .eq("id", row.id)
        .eq("organization_id", data.organizationId);
      return { ok: true as const, path };
    } catch (error) {
      console.warn("[image-records] regeneration failed", (error as Error)?.message);
      return await fail("The new picture couldn't be made. Your current picture is unchanged.");
    }
  });

/**
 * Verifies that each picture's stored file really renders: signs its URL and
 * fetches it, recording success only for a 2xx image response.
 */
export const verifyRenderedImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, data.organizationId, context.userId);
    const client = db(context.supabase);
    const { data: rows } = await client
      .from("image_records")
      .select("id, rendered_url")
      .eq("organization_id", data.organizationId)
      .not("rendered_url", "is", null);
    const results: { id: string; ok: boolean }[] = [];
    for (const row of (rows ?? []) as { id: string; rendered_url: string }[]) {
      let ok = false;
      try {
        // Only this workspace's own storage objects are fetched (signed URLs on
        // our storage host); arbitrary external URLs are never requested.
        const url = /^https?:/i.test(row.rendered_url)
          ? null
          : (await context.supabase.storage.from(MEDIA_BUCKET).createSignedUrl(row.rendered_url, 120)).data?.signedUrl;
        if (url) {
          const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
          ok = isRenderableImageResponse(response.status, response.headers.get("content-type"));
          await response.body?.cancel().catch(() => undefined);
        }
      } catch {
        ok = false;
      }
      await client
        .from("image_records")
        .update({ rendered_verified_at: ok ? new Date().toISOString() : null })
        .eq("id", row.id)
        .eq("organization_id", data.organizationId);
      results.push({ id: row.id, ok });
    }
    return { checked: results.length, verified: results.filter((r) => r.ok).length, results };
  });
