/**
 * Redelivers lead webhooks that failed for a transient reason. The first
 * attempt happens inline at capture time; this pass picks up what is left in
 * `lead_delivery_logs`. Every attempt reuses the lead's original idempotency
 * key, so a receiver that already got the lead can never create it twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLeadWebhookPayload, dispatchLeadWebhook } from "@/lib/lead-routing.server";

type Db = Pick<SupabaseClient, "from">;

/** Minimum wait after attempt N before attempt N+1: 1m, 5m, 15m, 1h, 6h. */
export const WEBHOOK_RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000] as const;
const LOOKBACK_MS = 2 * 86_400_000;

export type DeliveryLogRow = {
  organization_id: string;
  lead_id: string;
  delivery_status: string;
  retryable: boolean;
  attempted_at: string;
};

export type WebhookRetryCandidate = { organizationId: string; leadId: string; attempts: number };

export type WebhookRetryRun = {
  scanned: number;
  delivered: number;
  failed: number;
  skipped: number;
  details: { organizationId?: string; status: string; reason?: string }[];
};

/**
 * Leads whose newest attempt failed for a retryable reason, that were never
 * delivered, still have retries left and have waited out the backoff. Grouped
 * per workspace+lead so one tenant's rows can never decide another's retry.
 */
export function pickWebhookRetries(rows: readonly DeliveryLogRow[], now = Date.now()): WebhookRetryCandidate[] {
  const groups = new Map<string, DeliveryLogRow[]>();
  for (const row of rows) {
    if (!row.organization_id || !row.lead_id) continue;
    const key = `${row.organization_id}|${row.lead_id}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const picked: WebhookRetryCandidate[] = [];
  for (const list of groups.values()) {
    if (list.some((row) => row.delivery_status === "delivered")) continue;
    const newest = [...list].sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at))[0];
    if (!newest || newest.delivery_status !== "failed" || !newest.retryable) continue;
    const attempts = list.filter((row) => row.delivery_status === "failed").length;
    const wait = WEBHOOK_RETRY_BACKOFF_MS[attempts - 1];
    if (wait === undefined) continue; // retries exhausted
    const last = Date.parse(newest.attempted_at);
    if (!Number.isFinite(last) || now - last < wait) continue;
    picked.push({ organizationId: newest.organization_id, leadId: newest.lead_id, attempts });
  }
  return picked;
}

export async function runLeadWebhookRetries(db: Db, appUrl: string, now = Date.now()): Promise<WebhookRetryRun> {
  const run: WebhookRetryRun = { scanned: 0, delivered: 0, failed: 0, skipped: 0, details: [] };
  const { data, error } = await db
    .from("lead_delivery_logs")
    .select("organization_id, lead_id, delivery_status, retryable, attempted_at")
    .gte("attempted_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("attempted_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`lead_delivery_logs: ${error.message}`);

  for (const candidate of pickWebhookRetries((data ?? []) as DeliveryLogRow[], now)) {
    run.scanned += 1;
    const skip = (reason: string) => {
      run.skipped += 1;
      run.details.push({ organizationId: candidate.organizationId, status: "skipped", reason });
    };

    const { data: org } = await db
      .from("organizations")
      .select("id, slug, is_suspended")
      .eq("id", candidate.organizationId)
      .maybeSingle();
    if (!org?.id || org.is_suspended === true) {
      skip("workspace_unavailable");
      continue;
    }
    const { data: lead } = await db
      .from("leads")
      .select("id, organization_id, name, email, phone, service_interest, message")
      .eq("id", candidate.leadId)
      .eq("organization_id", candidate.organizationId)
      .maybeSingle();
    if (!lead || lead.id !== candidate.leadId || lead.organization_id !== candidate.organizationId) {
      skip("lead_missing");
      continue;
    }
    // The current endpoint and secret, not whatever was set at capture time.
    const [{ data: settings }, { data: signing }] = await Promise.all([
      db.from("website_settings").select("lead_webhook_url").eq("organization_id", candidate.organizationId).maybeSingle(),
      db.from("lead_webhook_secrets").select("secret").eq("organization_id", candidate.organizationId).maybeSingle(),
    ]);
    const url = typeof settings?.lead_webhook_url === "string" ? settings.lead_webhook_url : null;
    if (!url) {
      skip("webhook_not_configured");
      continue;
    }

    const payload = buildLeadWebhookPayload({
      organizationId: candidate.organizationId,
      leadId: lead.id,
      name: String(lead.name ?? ""),
      email: lead.email,
      phone: lead.phone,
      service: lead.service_interest,
      message: lead.message,
      // The submitting page is not stored; the workspace's own site is the honest origin.
      sourceUrl: `${appUrl.replace(/\/+$/, "")}/s/${org.slug}`,
    });
    const result = await dispatchLeadWebhook(url, payload, signing?.secret ?? null);
    if (result.ok) run.delivered += 1;
    else run.failed += 1;

    const { error: logError } = await db.from("lead_delivery_logs").insert({
      organization_id: candidate.organizationId,
      lead_id: lead.id,
      delivery_status: result.ok ? (result.skipped ? "skipped" : "delivered") : "failed",
      http_status: result.ok ? null : result.statusCode,
      reason: result.ok ? null : result.reason,
      retryable: result.ok ? false : result.retryable,
      attempted_at: result.attemptedAt,
      idempotency_key: payload.idempotency_key,
    });
    run.details.push({
      organizationId: candidate.organizationId,
      status: result.ok ? "delivered" : "failed",
      ...(logError ? { reason: "log_not_saved" } : result.ok ? {} : { reason: result.reason }),
    });
  }
  return run;
}
