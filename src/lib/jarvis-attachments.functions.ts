import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  JARVIS_ATTACHMENT_BUCKET,
  classifyUpload,
  storagePathFor,
} from "./jarvis-attachments-policy.mjs";

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Remaining uploads this month. A missing or unreadable quota row fails closed to zero. */
export const getJarvisUploadQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { getUploadQuota } = await import("./jarvis-attachments.server");
    return getUploadQuota(db, String(context.userId));
  });

/** Validates the request, then returns a short-lived signed upload target at a server-generated path. */
export const createJarvisUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { filename: string; mimeType: string; size: number }) => ({
    filename: input?.filename,
    mimeType: input?.mimeType,
    size: input?.size,
  }))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const userId = String(context.userId);
    const check = classifyUpload(data);
    if (!check.ok) throw new Error(check.reason);
    const { getUploadQuota } = await import("./jarvis-attachments.server");
    const quota = await getUploadQuota(db, userId);
    if (quota.remaining <= 0) throw new Error("You've used this month's upload allowance.");
    const path = storagePathFor(userId, crypto.randomUUID(), check.ext);
    const signed = await db.storage.from(JARVIS_ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error("Couldn't prepare the upload.");
    return {
      bucket: JARVIS_ATTACHMENT_BUCKET,
      path,
      token: signed.data.token,
      contentType: check.mime,
      maxBytes: check.maxBytes,
      remaining: quota.remaining,
    };
  });

/** Verifies the uploaded bytes, reserves one upload slot atomically, then analyzes the file. */
export const finalizeJarvisAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { path: string; filename?: string }) => ({
    path: input?.path,
    filename: typeof input?.filename === "string" ? input.filename : "",
  }))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { finalizeUpload } = await import("./jarvis-attachments.server");
    return finalizeUpload(db, String(context.userId), data.path, data.filename);
  });

export const deleteJarvisAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input?.id }))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { deleteAttachment } = await import("./jarvis-attachments.server");
    return deleteAttachment(db, String(context.userId), data.id);
  });
