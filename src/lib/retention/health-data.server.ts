/**
 * Loads the records the customer health score reads, for every real client
 * workspace (not demos, not suspended, not Revora's own). Read-only: nothing
 * here writes, sends or changes anything.
 */
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";
import { scoreCustomerHealth, type HealthInput, type HealthResult } from "@/lib/retention/health-score";

type Db = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;

const DAY = 86_400_000;
const PAGE = 1000;
const MAX_PAGES = 20;

export type ClientHealth = {
  organizationId: string;
  name: string;
  /** Paid setup or has a subscription: a customer rather than a prospect or trial. */
  isCustomer: boolean;
  /** Null when the onboarding flag is not readable. */
  onboardingCompleted: boolean | null;
  health: HealthResult;
};

/** Reads every page of a query (PostgREST caps a single response). */
async function readAll(label: string, query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await query(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

const str = (value: unknown) => (typeof value === "string" && value ? value : null);
const bool = (value: unknown) => (typeof value === "boolean" ? value : null);

function groupBy(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const row of rows) {
    const id = str(row["organization_id"]);
    if (!id) continue;
    const list = out.get(id);
    if (list) list.push(row);
    else out.set(id, [row]);
  }
  return out;
}

export async function loadClientHealth(db: Db, now = Date.now(), onlyOrgIds?: readonly string[]): Promise<ClientHealth[]> {
  let orgQuery = db
    .from("organizations")
    .select("id, name, created_at, onboarding_completed, onboarding_step, setup_paid_at, subscription_status")
    .eq("is_demo", false)
    .eq("is_suspended", false)
    .neq("id", PLATFORM_OWNER_ORG_ID)
    .limit(1000);
  if (onlyOrgIds?.length) orgQuery = orgQuery.in("id", [...onlyOrgIds]);
  const { data: orgData, error: orgError } = await orgQuery;
  if (orgError) throw new Error(`organizations: ${orgError.message}`);
  const orgs = (orgData ?? []) as Row[];
  const ids = orgs.map((o) => String(o["id"]));
  if (!ids.length) return [];

  const since70 = new Date(now - 70 * DAY).toISOString();
  const since14 = new Date(now - 14 * DAY).toISOString();
  const [sites, publishes, profiles, subs, leads, activities] = await Promise.all([
    readAll("website_settings", (a, b) =>
      db.from("website_settings").select("organization_id, published, last_published_at, custom_domain, domain_verified, dns_ok, ssl_ok, revora_host_ok").in("organization_id", ids).range(a, b),
    ),
    readAll("publish_events", (a, b) => db.from("publish_events").select("organization_id, created_at").in("organization_id", ids).order("created_at", { ascending: true }).range(a, b)),
    readAll("business_profiles", (a, b) => db.from("business_profiles").select("organization_id, phone, city, service_area, address").in("organization_id", ids).range(a, b)),
    readAll("subscriptions", (a, b) => db.from("subscriptions").select("organization_id, status, cancel_at_period_end, updated_at").in("organization_id", ids).order("updated_at", { ascending: false }).range(a, b)),
    readAll("leads", (a, b) => db.from("leads").select("organization_id, created_at, status, last_contacted_at").neq("source", TEST_LEAD_SOURCE).in("organization_id", ids).gte("created_at", since70).range(a, b)),
    readAll("lead_activities", (a, b) =>
      db.from("lead_activities").select("organization_id, created_at").in("organization_id", ids).not("actor_id", "is", null).gte("created_at", since14).range(a, b),
    ),
  ]);
  const siteBy = groupBy(sites);
  const publishBy = groupBy(publishes);
  const profileBy = groupBy(profiles);
  const subBy = groupBy(subs);
  const leadBy = groupBy(leads);
  const activityBy = groupBy(activities);

  return orgs.map((org) => {
    const id = String(org["id"]);
    const site = siteBy.get(id)?.[0];
    const firstPublish = str(publishBy.get(id)?.[0]?.["created_at"]);
    const profile = profileBy.get(id)?.[0];
    const sub = subBy.get(id)?.[0];
    const orgLeads = leadBy.get(id) ?? [];
    const status = str(sub?.["status"]) ?? str(org["subscription_status"]);
    const input: HealthInput = {
      now,
      createdAt: str(org["created_at"]),
      onboardingCompleted: bool(org["onboarding_completed"]),
      onboardingStep: str(org["onboarding_step"]),
      site: site
        ? {
            published: bool(site["published"]),
            liveSince: firstPublish ?? str(site["last_published_at"]),
            customDomain: str(site["custom_domain"]),
            domainVerified: bool(site["domain_verified"]),
            dnsOk: bool(site["dns_ok"]),
            sslOk: bool(site["ssl_ok"]),
            revoraHostOk: bool(site["revora_host_ok"]),
          }
        : null,
      leadDates: orgLeads.map((l) => String(l["created_at"] ?? "")),
      newLeadDates: orgLeads.filter((l) => l["status"] === "new").map((l) => String(l["created_at"] ?? "")),
      staffActivityDates: [
        ...(activityBy.get(id) ?? []).map((a) => String(a["created_at"] ?? "")),
        ...orgLeads.map((l) => str(l["last_contacted_at"])).filter((t): t is string => t !== null),
      ],
      profile: profile ? { phone: str(profile["phone"]), city: str(profile["city"]), serviceArea: str(profile["service_area"]), address: str(profile["address"]) } : null,
      billing: status ? { status, cancelAtPeriodEnd: bool(sub?.["cancel_at_period_end"]) } : null,
    };
    return {
      organizationId: id,
      name: String(org["name"] ?? "a workspace"),
      isCustomer: Boolean(org["setup_paid_at"]) || Boolean(sub),
      onboardingCompleted: input.onboardingCompleted,
      health: scoreCustomerHealth(input),
    };
  });
}
