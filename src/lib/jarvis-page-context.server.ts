import type { SupabaseClient } from "@supabase/supabase-js";
import { JARVIS_PAGES, pageKey, speakBrief, type JarvisPageKey, type PageBrief, type PageFact } from "./jarvis-page-context";

/**
 * Live facts for the admin page the owner is on. Every number is an exact
 * count or sum read now with server credentials; a query that fails becomes
 * null ("couldn't read"), never zero. Demo workspaces and sandbox payments are
 * left out of business numbers.
 */

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

// Untyped query builder: one helper counts rows on many tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseQuery = any;
type Filter = (query: LooseQuery) => LooseQuery;

async function exact(db: SupabaseClient, table: string, filter: Filter = (q) => q): Promise<number | null> {
  try {
    const result = await filter(db.from(table).select("*", { count: "exact", head: true }));
    return result.error ? null : (result.count ?? 0);
  } catch {
    return null;
  }
}

/** Sums one numeric column across every matching row, 1,000 rows per page. */
async function sum(db: SupabaseClient, table: string, column: string, filter: Filter): Promise<number | null> {
  try {
    let total = 0;
    for (let from = 0; from < 50_000; from += 1000) {
      const result = await filter(db.from(table).select(column)).range(from, from + 999);
      if (result.error) return null;
      const rows = (result.data ?? []) as Record<string, unknown>[];
      for (const row of rows) total += Number(row[column] ?? 0) || 0;
      if (rows.length < 1000) return Math.round(total * 100) / 100;
    }
    return null;
  } catch {
    return null;
  }
}

const usd = (value: number | null) =>
  value === null ? null : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const attention = (label: string, value: number | null): PageFact => ({
  label,
  value,
  ...(typeof value === "number" && value > 0 ? { tone: "attention" as const } : {}),
});

const realOrgs: Filter = (q) => q.eq("is_demo", false);

async function overview(db: SupabaseClient): Promise<PageFact[]> {
  const [clients, paying, trialing, pastDue, leads, errors, failedBuilds] = await Promise.all([
    exact(db, "organizations", realOrgs),
    exact(db, "organizations", (q) => realOrgs(q).eq("subscription_status", "active")),
    exact(db, "organizations", (q) => realOrgs(q).eq("subscription_status", "trialing")),
    exact(db, "organizations", (q) => realOrgs(q).eq("subscription_status", "past_due")),
    exact(db, "leads", (q) => q.gte("created_at", ago(7 * DAY))),
    exact(db, "error_events", (q) => q.gte("created_at", ago(DAY)).eq("level", "error")),
    exact(db, "generation_jobs", (q) => q.gte("created_at", ago(DAY)).eq("status", "failed")),
  ]);
  return [
    attention("Past-due clients", pastDue),
    attention("Errors in the last 24 hours", errors),
    attention("Failed website builds in the last 24 hours", failedBuilds),
    { label: "Paying clients", value: paying },
    { label: "Clients on trial", value: trialing },
    { label: "Client workspaces", value: clients },
    { label: "New leads this week", value: leads },
  ];
}

async function clients(db: SupabaseClient): Promise<PageFact[]> {
  const week = ago(7 * DAY);
  const [total, newThisWeek, suspended, setupUnpaid, trialsEnding] = await Promise.all([
    exact(db, "organizations", realOrgs),
    exact(db, "organizations", (q) => realOrgs(q).gte("created_at", week)),
    exact(db, "organizations", (q) => realOrgs(q).eq("is_suspended", true)),
    exact(db, "organizations", (q) => realOrgs(q).is("setup_paid_at", null)),
    exact(db, "organizations", (q) =>
      realOrgs(q).eq("subscription_status", "trialing").lte("trial_ends_at", new Date(Date.now() + 3 * DAY).toISOString()),
    ),
  ]);
  return [
    attention("Trials ending in the next 3 days", trialsEnding),
    attention("Suspended clients", suspended),
    { label: "Client workspaces", value: total },
    { label: "New this week", value: newThisWeek },
    { label: "Setup not paid yet", value: setupUnpaid },
  ];
}

async function websites(db: SupabaseClient): Promise<PageFact[]> {
  const [open, urgent, published, building] = await Promise.all([
    exact(db, "website_requests", (q) => q.neq("status", "completed")),
    exact(db, "website_requests", (q) => q.neq("status", "completed").in("priority", ["urgent", "high"])),
    exact(db, "website_settings", (q) => q.eq("publish_state", "published")),
    exact(db, "generation_jobs", (q) => q.in("status", ["queued", "processing"])),
  ]);
  return [
    attention("High-priority website requests", urgent),
    { label: "Open website requests", value: open },
    { label: "Builds running now", value: building },
    { label: "Published client sites", value: published },
  ];
}

async function monitoring(db: SupabaseClient): Promise<PageFact[]> {
  const day = ago(DAY);
  const [errors, failedBuilds, stuck, completed] = await Promise.all([
    exact(db, "error_events", (q) => q.gte("created_at", day).eq("level", "error")),
    exact(db, "generation_jobs", (q) => q.gte("created_at", day).eq("status", "failed")),
    exact(db, "generation_jobs", (q) => q.eq("status", "processing").lt("lease_expires_at", new Date().toISOString())),
    exact(db, "generation_jobs", (q) => q.gte("created_at", day).eq("status", "completed")),
  ]);
  return [
    attention("Errors in the last 24 hours", errors),
    attention("Failed builds in the last 24 hours", failedBuilds),
    attention("Builds stuck past their lease", stuck),
    { label: "Builds finished in the last 24 hours", value: completed },
  ];
}

async function analytics(db: SupabaseClient): Promise<PageFact[]> {
  const week = ago(7 * DAY);
  const [events, leads, conversions] = await Promise.all([
    exact(db, "analytics_events", (q) => q.gte("created_at", week)),
    exact(db, "leads", (q) => q.gte("created_at", week)),
    exact(db, "marketing_conversions", (q) => q.gte("created_at", week)),
  ]);
  return [
    { label: "Tracked site events this week", value: events },
    { label: "Leads captured this week", value: leads },
    { label: "Marketing conversions this week", value: conversions },
  ];
}

async function payments(db: SupabaseClient): Promise<PageFact[]> {
  const month = ago(30 * DAY);
  const live: Filter = (q) => q.eq("environment", "live");
  const [gross, refunded, failed, disputed] = await Promise.all([
    sum(db, "payments", "amount", (q) =>
      live(q).in("status", ["completed", "refunded", "partially_refunded", "disputed"]).gte("created_at", month),
    ),
    sum(db, "payments", "refunded_amount", (q) => live(q).gte("created_at", month)),
    exact(db, "payments", (q) => live(q).eq("status", "failed").gte("created_at", month)),
    exact(db, "payments", (q) => live(q).eq("status", "disputed")),
  ]);
  return [
    attention("Open disputes", disputed),
    attention("Failed payments in the last 30 days", failed),
    { label: "Collected in the last 30 days", value: usd(gross) },
    { label: "Refunded in the last 30 days", value: usd(refunded) },
    { label: "Net in the last 30 days", value: gross === null || refunded === null ? null : usd(gross - refunded) },
  ];
}

async function domains(db: SupabaseClient): Promise<PageFact[]> {
  const [connected, waiting] = await Promise.all([
    exact(db, "website_settings", (q) => q.not("custom_domain", "is", null).eq("dns_ok", true).eq("ssl_ok", true)),
    exact(db, "website_settings", (q) => q.not("custom_domain", "is", null).or("dns_ok.is.false,ssl_ok.is.false,dns_ok.is.null,ssl_ok.is.null")),
  ]);
  return [attention("Domains waiting on DNS or HTTPS", waiting), { label: "Domains live", value: connected }];
}

async function backups(db: SupabaseClient): Promise<PageFact[]> {
  try {
    const latest = await db.from("data_backups").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) return [{ label: "Last backup", value: null }];
    const at = (latest.data as { created_at?: string } | null)?.created_at;
    if (!at) return [{ label: "Last backup", value: "never", tone: "attention" }];
    const hours = Math.round((Date.now() - new Date(at).getTime()) / 3_600_000);
    return [
      { label: "Last backup", value: hours < 1 ? "under an hour ago" : `${hours} hours ago`, ...(hours > 48 ? { tone: "attention" as const } : {}) },
    ];
  } catch {
    return [{ label: "Last backup", value: null }];
  }
}

async function ai(db: SupabaseClient): Promise<PageFact[]> {
  try {
    const result = await db.from("ai_provider_runtime").select("provider, open_until, failures");
    if (result.error) return [{ label: "AI providers", value: null }];
    const rows = (result.data ?? []) as { provider: string; open_until: string | null; failures: number | null }[];
    const cooling = rows.filter((row) => row.open_until && new Date(row.open_until).getTime() > Date.now());
    return [
      attention("AI providers cooling down after failures", cooling.length),
      { label: "AI providers tracked", value: rows.length },
    ];
  } catch {
    return [{ label: "AI providers", value: null }];
  }
}

async function client(db: SupabaseClient, orgId: string | null): Promise<PageFact[]> {
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) return [];
  const week = ago(7 * DAY);
  const [org, leads, openLeads, published] = await Promise.all([
    db.from("organizations").select("name, subscription_status, setup_paid_at").eq("id", orgId).maybeSingle(),
    exact(db, "leads", (q) => q.eq("organization_id", orgId).gte("created_at", week)),
    exact(db, "leads", (q) => q.eq("organization_id", orgId).eq("status", "new")),
    exact(db, "website_settings", (q) => q.eq("organization_id", orgId).eq("publish_state", "published")),
  ]);
  const row = org.error ? null : (org.data as { name: string; subscription_status: string; setup_paid_at: string | null } | null);
  return [
    { label: "Client", value: row?.name ?? null },
    { label: "Subscription", value: row?.subscription_status ?? null, ...(row?.subscription_status === "past_due" ? { tone: "attention" as const } : {}) },
    { label: "Setup paid", value: row ? (row.setup_paid_at ? "yes" : "no") : null },
    { label: "Website live", value: published === null ? null : published > 0 ? "yes" : "no" },
    { label: "New leads this week", value: leads },
    attention("Leads nobody has contacted", openLeads),
  ];
}

const COLLECTORS: Partial<Record<JarvisPageKey, (db: SupabaseClient, path: string) => Promise<PageFact[]>>> = {
  overview,
  clients,
  client: (db, path) => client(db, path.split("/")[3] ?? null),
  websites,
  monitoring,
  analytics,
  payments,
  domains,
  backups,
  ai,
};

export async function collectPageBrief(db: SupabaseClient, path: string): Promise<PageBrief> {
  const page = pageKey(path);
  const collect = COLLECTORS[page] ?? overview;
  const facts = await collect(db, path);
  const title = JARVIS_PAGES[page];
  return { page, title, facts, spoken: speakBrief(title, facts), checkedAt: new Date().toISOString() };
}
