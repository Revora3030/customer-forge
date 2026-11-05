/**
 * Sends owner Web Push alerts for a new lead (speed-to-lead).
 *
 * Workers-compatible: VAPID JWT signing and RFC 8291 aes128gcm payload
 * encryption via @block65/webcrypto-web-push (MIT, Web Crypto only; aes128gcm is
 * what Apple/iOS Web Push requires, unlike the legacy "aesgcm" draft).
 * Best effort by design: it never throws, so a push failure can never turn a
 * stored lead into a failed visitor submission. Endpoints the push service
 * reports as gone (404/410) are disabled, not deleted.
 */
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { leadPushPayload } from "./push-config";
import { readVapidConfig, type VapidConfig } from "./vapid.server";

type SubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

/** Narrow table contract: the generated Supabase types don't know this table until Lovable regenerates them. */
export type PushDb = {
  from(table: "push_subscriptions"): {
    select(columns: string): {
      eq(
        column: "organization_id",
        value: string,
      ): {
        is(
          column: "disabled_at",
          value: null,
        ): {
          limit(
            n: number,
          ): PromiseLike<{ data: SubscriptionRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: "id", value: string): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type LeadPushInput = {
  organizationId: string;
  leadId: string;
  businessName: string;
  kind: string;
  service?: string | null;
};

export type LeadPushResult = {
  sent: number;
  failed: number;
  disabled: number;
  skipped?: "not_configured" | "no_subscriptions" | "lookup_failed";
};

type Deps = {
  db: PushDb;
  config?: VapidConfig | null;
  fetchImpl?: typeof fetch;
  build?: typeof buildPushPayload;
  now?: () => Date;
};

export const MAX_DEVICES_PER_ORG = 25;

export async function sendLeadPush(input: LeadPushInput, deps: Deps): Promise<LeadPushResult> {
  const config = deps.config === undefined ? readVapidConfig() : deps.config;
  if (!config) return { sent: 0, failed: 0, disabled: 0, skipped: "not_configured" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const build = deps.build ?? buildPushPayload;
  const now = deps.now ?? (() => new Date());

  let rows: SubscriptionRow[];
  try {
    const { data, error } = await deps.db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("organization_id", input.organizationId)
      .is("disabled_at", null)
      .limit(MAX_DEVICES_PER_ORG);
    if (error) return { sent: 0, failed: 0, disabled: 0, skipped: "lookup_failed" };
    rows = data ?? [];
  } catch {
    return { sent: 0, failed: 0, disabled: 0, skipped: "lookup_failed" };
  }
  if (!rows.length) return { sent: 0, failed: 0, disabled: 0, skipped: "no_subscriptions" };

  const payload = leadPushPayload(input);
  const result: LeadPushResult = { sent: 0, failed: 0, disabled: 0 };

  await Promise.all(
    rows.map(async (row) => {
      const stamp = now().toISOString();
      try {
        const request = await build(
          {
            data: payload,
            options: {
              ttl: 15 * 60,
              urgency: "high",
              topic: `lead${input.leadId.replace(/-/g, "").slice(0, 28)}`,
            },
          },
          {
            endpoint: row.endpoint,
            expirationTime: null,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
        );
        const response = await fetchImpl(row.endpoint, {
          method: "POST",
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status >= 200 && response.status < 300) {
          result.sent += 1;
          await deps.db
            .from("push_subscriptions")
            .update({ last_success_at: stamp, failure_count: 0, updated_at: stamp })
            .eq("id", row.id);
          return;
        }
        result.failed += 1;
        const gone = response.status === 404 || response.status === 410;
        if (gone) result.disabled += 1;
        await deps.db
          .from("push_subscriptions")
          .update({
            last_failure_at: stamp,
            updated_at: stamp,
            ...(gone ? { disabled_at: stamp } : {}),
          })
          .eq("id", row.id);
      } catch {
        result.failed += 1;
      }
    }),
  );
  return result;
}
