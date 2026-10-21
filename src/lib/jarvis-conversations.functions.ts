import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseConversationId, parseRenameTitle, parseSearchTerm } from "./jarvis-conversations";

export type JarvisConversation = { id: string; title: string; archived: boolean; updated_at: string };

type Ctx = { supabase: unknown; userId: unknown };

/** Jarvis is super-admin only; RLS additionally limits rows to the caller. */
async function ownerDb(context: Ctx) {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  return context.supabase as import("@supabase/supabase-js").SupabaseClient;
}

export const listJarvisConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { query?: string; archived?: boolean } | undefined) => ({
    query: parseSearchTerm(input?.query), archived: input?.archived === true,
  }))
  .handler(async ({ context, data }): Promise<JarvisConversation[]> => {
    const db = await ownerDb(context);
    const userId = String(context.userId);
    let ids: string[] | null = null;
    if (data.query) {
      const hits = await db.from("jarvis_messages").select("conversation_id")
        .eq("user_id", userId).ilike("content", `%${data.query}%`).limit(200);
      if (hits.error) throw new Error("Couldn't search your conversations.");
      ids = [...new Set((hits.data ?? []).map((r) => r.conversation_id).filter((v): v is string => !!v))];
    }
    let q = db.from("jarvis_conversations").select("id,title,archived,updated_at")
      .eq("user_id", userId).eq("archived", data.archived);
    if (data.query) {
      const term = `%${data.query}%`;
      q = ids && ids.length ? q.or(`title.ilike.${term},id.in.(${ids.join(",")})`) : q.ilike("title", term);
    }
    const res = await q.order("updated_at", { ascending: false }).limit(50);
    if (res.error) throw new Error("Couldn't load your conversations.");
    return (res.data ?? []) as JarvisConversation[];
  });

export const createJarvisConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JarvisConversation> => {
    const db = await ownerDb(context);
    const res = await db.from("jarvis_conversations").insert({ user_id: String(context.userId) })
      .select("id,title,archived,updated_at").single();
    if (res.error) throw new Error("Couldn't start a new conversation.");
    return res.data as JarvisConversation;
  });

export const updateJarvisConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; title?: string; archived?: boolean }) => {
    const id = parseConversationId(input?.id);
    if (!id) throw new Error("Pick a conversation first.");
    const patch: { title?: string; archived?: boolean } = {};
    if (input.title !== undefined) patch.title = parseRenameTitle(input.title);
    if (typeof input.archived === "boolean") patch.archived = input.archived;
    if (!Object.keys(patch).length) throw new Error("Nothing to change.");
    return { id, patch };
  })
  .handler(async ({ context, data }) => {
    const db = await ownerDb(context);
    const res = await db.from("jarvis_conversations").update(data.patch)
      .eq("id", data.id).eq("user_id", String(context.userId)).select("id").maybeSingle();
    if (res.error || !res.data) throw new Error("Couldn't update that conversation.");
    return { ok: true as const };
  });
