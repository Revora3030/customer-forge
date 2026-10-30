import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super-admin only; reads and writes with the server's elevated access. */
async function guardedAdmin(context: { supabase: unknown; userId: unknown }): Promise<SupabaseClient> {
  const { assertSuperAdmin } = await import("./admin.server");
  await assertSuperAdmin(context.supabase as Parameters<typeof assertSuperAdmin>[0], String(context.userId));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function pendingLeadCount(db: SupabaseClient): Promise<number | null> {
  const { count, error } = await db.from("prospect_import_queue").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error || count === null ? null : count;
}

/** Everything waiting for the founder: bot requests, plus counts for Jarvis proposals and leads. */
export const listFounderApprovalsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await guardedAdmin(context);
    const { listActionRequests, ActionRequestError } = await import("./agent-action-requests.server");
    const { listApprovals } = await import("./jarvis-approvals.server");
    // The bot-request queue failing (e.g. its table isn't migrated on this
    // database yet) must not blank the whole screen: it used to throw, the
    // client retried with backoff, and the page sat on its loading rows.
    // The reason is returned instead, and the other counts still show.
    let queueError: string | null = null;
    const [requests, jarvis, leads] = await Promise.all([
      listActionRequests(db).catch((error: unknown) => {
        queueError = error instanceof ActionRequestError ? error.message : "Couldn't load the approval queue.";
        return [] as Awaited<ReturnType<typeof listActionRequests>>;
      }),
      listApprovals(db, String(context.userId)).catch(() => null),
      pendingLeadCount(db).catch(() => null),
    ]);
    return {
      requests,
      queueError: queueError as string | null,
      jarvisWaiting: jarvis ? jarvis.filter((item) => item.state === "pending" || item.state === "failed").length : null,
      leadsWaiting: leads,
    };
  });

const decision = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/** One tap: approve or reject one pending bot request. */
export const decideAgentActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => decision.parse(input))
  .handler(async ({ context, data }) => {
    const db = await guardedAdmin(context);
    const { decideActionRequest, ActionRequestError } = await import("./agent-action-requests.server");
    try {
      const request = await decideActionRequest(db, { id: data.id, approve: data.approve, userId: String(context.userId), note: data.note });
      return { ok: true as const, request };
    } catch (error) {
      if (error instanceof ActionRequestError) return { ok: false as const, message: error.message };
      throw error;
    }
  });
