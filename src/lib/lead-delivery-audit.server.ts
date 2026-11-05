import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUDIT_LOOKBACK_MS,
  auditLeadDelivery,
  type AuditAlertRow,
  type AuditLead,
  type AuditOrg,
  type AuditProfile,
  type AuditReport,
  type AuditWatchRow,
  type AuditWebhookConfig,
  type AuditWebhookRow,
} from "@/lib/lead-delivery-audit";

/**
 * Loads the stored delivery rows for the last 72 hours and runs the routing
 * audit over them. SELECT only: it sends no email or SMS, writes nothing and
 * touches no payment system. Safe to run against production from /admin or a test.
 */

type Db = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;

const MAX_LEADS = 2000;
const IN_CHUNK = 150;

const chunks = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function selectIn(db: Db, table: string, columns: string, column: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await db.from(table).select(columns).in(column, part).limit(10_000);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
  }
  return rows;
}

/** A table that a migration has not created yet: reported as "not checked", never as a pass. */
const tableMissing = (message: string) =>
  /does not exist|schema cache|could not find the table|undefined_table|42P01|PGRST205/i.test(message);

async function selectInOptional(db: Db, table: string, columns: string, column: string, ids: string[]): Promise<Row[] | null> {
  try {
    return await selectIn(db, table, columns, column, ids);
  } catch (error) {
    if (error instanceof Error && tableMissing(error.message)) return null;
    throw error;
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : value == null ? null : String(value));

export async function loadLeadDeliveryAudit(db: Db, now = Date.now()): Promise<AuditReport> {
  const { data: recent, error } = await db
    .from("leads")
    .select("id, organization_id, created_at, source")
    .gte("created_at", new Date(now - AUDIT_LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_LEADS);
  if (error) throw new Error(`leads: ${error.message}`);
  const leads: AuditLead[] = ((recent ?? []) as unknown as Row[]).map((r) => ({
    id: String(r["id"]),
    organization_id: String(r["organization_id"]),
    created_at: String(r["created_at"]),
    source: str(r["source"]),
  }));
  const leadIds = leads.map((l) => l.id);
  const orgIds = [...new Set(leads.map((l) => l.organization_id))];

  const orgs: AuditOrg[] = (await selectIn(db, "organizations", "id, name, is_demo, is_suspended", "id", orgIds)).map((r) => ({
    id: String(r["id"]),
    name: str(r["name"]),
    is_demo: r["is_demo"] === true,
    is_suspended: r["is_suspended"] === true,
  }));
  const profiles: AuditProfile[] = (
    await selectIn(db, "business_profiles", "organization_id, notification_email, email, owner_email, notify_on_lead, updated_at", "organization_id", orgIds)
  ).map((r) => ({
    organization_id: String(r["organization_id"]),
    notification_email: str(r["notification_email"]),
    email: str(r["email"]),
    owner_email: str(r["owner_email"]),
    notify_on_lead: typeof r["notify_on_lead"] === "boolean" ? r["notify_on_lead"] : null,
    updated_at: str(r["updated_at"]),
  }));
  // Selected by lead id only: a row filed under the wrong workspace is exactly what this must see.
  const alertRows: AuditAlertRow[] = (
    await selectIn(db, "lead_alert_log", "lead_id, organization_id, recipient, status, reason, created_at", "lead_id", leadIds)
  ).map((r) => ({
    lead_id: str(r["lead_id"]),
    organization_id: String(r["organization_id"]),
    recipient: str(r["recipient"]),
    status: String(r["status"]),
    reason: str(r["reason"]),
    created_at: String(r["created_at"]),
  }));
  const webhookRaw = await selectInOptional(
    db,
    "lead_delivery_logs",
    "lead_id, organization_id, delivery_status, retryable, reason, attempted_at",
    "lead_id",
    leadIds,
  );
  const webhookRows: AuditWebhookRow[] | null = webhookRaw
    ? webhookRaw.map((r) => ({
        lead_id: String(r["lead_id"]),
        organization_id: String(r["organization_id"]),
        delivery_status: String(r["delivery_status"]),
        retryable: typeof r["retryable"] === "boolean" ? r["retryable"] : null,
        reason: str(r["reason"]),
        attempted_at: String(r["attempted_at"]),
      }))
    : null;
  // Only whether a webhook is set is read; the URL itself is never carried into a report.
  const webhookConfigs: AuditWebhookConfig[] = (
    await selectIn(db, "website_settings", "organization_id, lead_webhook_url, updated_at", "organization_id", orgIds)
  ).map((r) => ({
    organization_id: String(r["organization_id"]),
    configured: typeof r["lead_webhook_url"] === "string" && r["lead_webhook_url"].trim().length > 0,
    updated_at: str(r["updated_at"]),
  }));
  const watchRaw = await selectInOptional(db, "lead_delivery_watch", "lead_id, state", "lead_id", leadIds);
  const watchRows: AuditWatchRow[] | null = watchRaw
    ? watchRaw.map((r) => ({ lead_id: String(r["lead_id"]), state: String(r["state"]) }))
    : null;

  return auditLeadDelivery({ leads, orgs, profiles, alertRows, webhookRows, webhookConfigs, watchRows, now });
}
