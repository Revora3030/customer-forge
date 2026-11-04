/**
 * Dashboard server functions for owner Web Push alerts. Writes go through the
 * caller's own Supabase session, so RLS (own rows, org members only) applies.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseSubscription } from "./push-config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PushTable = {
  upsert(
    values: Record<string, unknown>,
    options: { onConflict: string },
  ): PromiseLike<{ error: { message: string } | null }>;
  delete(): {
    eq(
      column: string,
      value: string,
    ): {
      eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

function pushTable(client: unknown): PushTable {
  return (client as { from(table: "push_subscriptions"): PushTable }).from("push_subscriptions");
}

/** The VAPID public key (public by design) or null when push isn't configured. */
export const getPushPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readVapidConfig } = await import("./vapid.server");
    return { publicKey: readVapidConfig()?.publicKey ?? null };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; subscription: unknown; userAgent?: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Unknown workspace.");
    const subscription = parseSubscription(input?.subscription);
    if (!subscription) throw new Error("This browser returned an invalid push subscription.");
    return {
      organizationId,
      subscription,
      userAgent: String(input?.userAgent ?? "").slice(0, 512) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const stamp = new Date().toISOString();
    const { error } = await pushTable(context.supabase).upsert(
      {
        organization_id: data.organizationId,
        user_id: context.userId,
        endpoint: data.subscription.endpoint,
        p256dh: data.subscription.p256dh,
        auth: data.subscription.auth,
        user_agent: data.userAgent,
        updated_at: stamp,
        disabled_at: null,
        failure_count: 0,
      },
      { onConflict: "organization_id,endpoint" },
    );
    if (error) throw new Error("Couldn't turn on push alerts for this device.");
    return { ok: true as const };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; endpoint: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const endpoint = String(input?.endpoint ?? "").trim();
    if (!UUID.test(organizationId) || !/^https:\/\//.test(endpoint))
      throw new Error("Invalid request.");
    return { organizationId, endpoint };
  })
  .handler(async ({ data, context }) => {
    const { error } = await pushTable(context.supabase)
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error("Couldn't turn off push alerts for this device.");
    return { ok: true as const };
  });
