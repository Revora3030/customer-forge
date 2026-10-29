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

function gmailInput(input: unknown) {
  const row = (input ?? {}) as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof row[key] === "string" ? row[key].trim().slice(0, max) : "");
  return {
    clientId: text("clientId", 200),
    clientSecret: text("clientSecret", 300),
    refreshToken: text("refreshToken", 512),
    senderEmail: text("senderEmail", 200),
    mailingAddress: text("mailingAddress", 300),
  };
}

/** Super-admin only: saves Gmail OAuth and the mailing address on the autopilot settings row. Blank fields keep the saved secret. */
export const saveGmailConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(gmailInput)
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { saveGmailSettings } = await import("./gmail/stored-config.server");
    return saveGmailSettings(db, data, String(context.userId));
  });

/** Super-admin only: mints a Gmail token and reads the mailbox address. Sends no mail. */
export const testGmailConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(gmailInput)
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { withStoredGmail } = await import("./gmail/stored-config.server");
    const { gmailConfig, testGmailConnection } = await import("./gmail/client.server");
    return withStoredGmail(db, async () => {
      const saved = gmailConfig();
      const config = {
        clientId: data.clientId || saved?.clientId || "",
        clientSecret: data.clientSecret || saved?.clientSecret || "",
        refreshToken: data.refreshToken || saved?.refreshToken || "",
        sender: (data.senderEmail || saved?.sender || "").toLowerCase(),
      };
      const missing = [
        !config.clientId ? "GMAIL_CLIENT_ID" : "",
        !config.clientSecret ? "GMAIL_CLIENT_SECRET" : "",
        !config.refreshToken ? "GMAIL_REFRESH_TOKEN" : "",
        !config.sender ? "GMAIL_SENDER_EMAIL" : "",
      ].filter(Boolean);
      if (missing.length) return { ok: false as const, message: `Still missing ${missing.join(", ")}.` };
      const result = await testGmailConnection(config);
      if (!result.ok) return { ok: false as const, message: result.reason === "gmail_auth_failed" ? "Gmail rejected those credentials." : "Gmail could not be reached." };
      return { ok: true as const, email: result.email };
    });
  });

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
