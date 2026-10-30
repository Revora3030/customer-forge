import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInstagramDraft } from "./instagram-post";

async function ownerDb(context: { supabase: unknown; userId: unknown }) {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as SupabaseClient, String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}
export const getInstagramStatusFn = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await ownerDb(context);
  const { instagramStatus } = await import("./instagram.server");
  return instagramStatus(db, String(context.userId));
});
export const startInstagramConnectFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await ownerDb(context);
  const { startInstagramOAuth } = await import("./instagram.server");
  return startInstagramOAuth(db, String(context.userId));
});
export const saveInstagramDraftFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator(parseInstagramDraft).handler(async ({ context, data }) => {
  const db = await ownerDb(context);
  const { saveInstagramDraft } = await import("./instagram.server");
  return saveInstagramDraft(db, String(context.userId), data);
});
export const publishInstagramDraftFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((input: { postId: string; contentHash: string; approved: boolean; rightsConfirmed: boolean }) => {
    if (!/^[a-f0-9-]{36}$/i.test(input?.postId ?? "") || !/^[a-f0-9]{64}$/.test(input?.contentHash ?? "")) throw new Error("Choose a saved Instagram draft.");
    if (input.approved !== true || input.rightsConfirmed !== true) throw new Error("Approve this post and confirm you can use its image.");
    return input;
  }).handler(async ({ context, data }) => {
    const db = await ownerDb(context);
    const { publishInstagramDraft } = await import("./instagram.server");
    return publishInstagramDraft(db, String(context.userId), data);
  });
export const disconnectInstagramFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = await ownerDb(context);
  const result = await db.from("jarvis_instagram_connections").delete().eq("user_id", String(context.userId));
  if (result.error) throw new Error("Couldn't disconnect Instagram.");
  // Invalidate outstanding OAuth attempts so an older popup cannot reconnect.
  const states = await db.from("jarvis_instagram_oauth").update({ used_at: new Date().toISOString() }).eq("user_id", String(context.userId)).is("used_at", null);
  if (states.error) throw new Error("Disconnected, but couldn't close pending sign-ins. Please refresh.");
  return { disconnected: true };
});
export const cancelInstagramDraftFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((input: { postId: string }) => {
    if (!/^[a-f0-9-]{36}$/i.test(input?.postId ?? "")) throw new Error("Choose a saved draft.");
    return input;
  }).handler(async ({ context, data }) => {
    const db = await ownerDb(context);
    const result = await db.from("jarvis_instagram_posts").update({ status: "cancelled" }).eq("id", data.postId).eq("user_id", String(context.userId)).eq("status", "draft").select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Only an unsubmitted draft can be discarded.");
    return { cancelled: true };
  });