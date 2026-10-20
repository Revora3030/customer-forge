import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

function inboundId(input: unknown): string {
  const id = typeof (input as { inboundId?: unknown } | null)?.inboundId === "string" ? (input as { inboundId: string }).inboundId.trim() : "";
  if (!ID.test(id)) throw new Error("That reply wasn't found.");
  return id;
}

/** Super-admin only: prospect replies read from Gmail, newest first, with Gmail setup status. */
export const listProspectInboxFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listProspectInbox } = await import("./prospect-replies.server");
    return listProspectInbox(db, 30);
  });

/** Super-admin only: sends the operator's (edited) draft in the prospect's thread. */
export const approveReplyDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const id = inboundId(input);
    const body = typeof (input as { body?: unknown }).body === "string" ? (input as { body: string }).body.slice(0, 4000) : "";
    if (body.trim().length < 2) throw new Error("Write the reply first.");
    return { inboundId: id, body };
  })
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { approveReplyDraft } = await import("./prospect-replies.server");
    return approveReplyDraft(db, { ...data, actorId: String(context.userId) });
  });

/** Super-admin only: marks a reply as handled without answering it. */
export const dismissInboundFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ({ inboundId: inboundId(input) }))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { dismissInbound } = await import("./prospect-replies.server");
    return dismissInbound(db, { ...data, actorId: String(context.userId) });
  });
