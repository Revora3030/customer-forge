/**
 * Server side of "canceled sites go offline after a grace period"
 * (rules in src/lib/site-hosting.ts). Runs hourly from pg_cron
 * (`revora-site-hosting`, migration 20261030140000) through
 * /api/public/jobs/site-hosting, and the Stripe webhook restores a site the
 * moment its workspace subscribes again.
 *
 * Every read here fails open: if the table is missing (migration not applied
 * yet) or unreadable, no site is taken offline.
 */
import { fetchAllRows } from "@/lib/paginate";
import { hostingExempt, planHosting, type HostingGrace, type HostingOrg, type HostingSub } from "@/lib/site-hosting";

type Result<T> = { data: T | null; error: { message: string; code?: string | null } | null };
// The sweep only needs a handful of PostgREST calls; a loose client keeps it testable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

/** When this workspace's website was taken offline after its grace period, else null. */
export async function hostingOfflineAt(db: Db, organizationId: string): Promise<string | null> {
  try {
    const { data, error } = (await db
      .from("site_hosting_grace")
      .select("offline_at")
      .eq("organization_id", organizationId)
      .maybeSingle()) as Result<{ offline_at: string | null }>;
    if (error || !data?.offline_at) return null;
    return data.offline_at;
  } catch {
    return null;
  }
}

/** The subset of these workspaces whose website is offline after the grace period. */
export async function hostingOfflineOrgIds(db: Db, organizationIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let start = 0; start < organizationIds.length; start += 200) {
    const batch = organizationIds.slice(start, start + 200);
    try {
      const { data, error } = (await db
        .from("site_hosting_grace")
        .select("organization_id, offline_at")
        .in("organization_id", batch)
        .not("offline_at", "is", null)) as Result<{ organization_id: string; offline_at: string | null }[]>;
      if (error) continue;
      for (const row of data ?? []) if (row.offline_at) out.add(row.organization_id);
    } catch {
      /* fail open */
    }
  }
  return out;
}

/** The workspace subscribed again: its website is back immediately. Never throws. */
export async function restoreSiteHosting(db: Db, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = (await db
      .from("site_hosting_grace")
      .delete()
      .eq("organization_id", organizationId)
      .select("organization_id")) as Result<{ organization_id: string }[]>;
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

export type SiteHostingSweepResult = {
  created: number;
  restored: number;
  warned: number;
  offline: number;
  errors: number;
};

export async function runSiteHostingSweep(
  db: Db,
  options: {
    now?: () => Date;
    /** Sends the 3-day warning; returns false when nothing could be sent. */
    warn: (organizationId: string, offlineAfter: string) => Promise<boolean>;
  },
): Promise<SiteHostingSweepResult> {
  const now = (options.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const result: SiteHostingSweepResult = { created: 0, restored: 0, warned: 0, offline: 0, errors: 0 };

  const subs = await fetchAllRows<HostingSub>((from, to) =>
    db
      .from("subscriptions")
      .select("organization_id, status, current_period_end, provider_subscription_id, updated_at")
      .eq("environment", "live")
      .eq("payment_provider", "stripe")
      .order("id")
      .range(from, to),
  );
  if (subs.error) throw new Error(`subscriptions unavailable: ${subs.error.code ?? subs.error.message}`);
  const graces = await fetchAllRows<HostingGrace>((from, to) =>
    db
      .from("site_hosting_grace")
      .select("organization_id, ended_at, offline_after, warning_sent_at, offline_at")
      .order("organization_id")
      .range(from, to),
  );
  if (graces.error) throw new Error(`site_hosting_grace unavailable: ${graces.error.code ?? graces.error.message}`);

  const ids = [...new Set([...subs.rows.map((s) => s.organization_id), ...graces.rows.map((g) => g.organization_id)])];
  const orgs: HostingOrg[] = [];
  for (let start = 0; start < ids.length; start += 200) {
    const { data, error } = (await db
      .from("organizations")
      .select("id, is_demo")
      .in("id", ids.slice(start, start + 200))) as Result<HostingOrg[]>;
    if (error) throw new Error(`organizations unavailable: ${error.code ?? error.message}`);
    orgs.push(...(data ?? []));
  }

  const plan = planHosting({ subs: subs.rows, graces: graces.rows, orgs, now });

  for (const orgId of plan.restore) {
    if (await restoreSiteHosting(db, orgId)) result.restored += 1;
    else result.errors += 1;
  }

  for (const row of plan.create) {
    const { error } = (await db
      .from("site_hosting_grace")
      .upsert({ ...row, updated_at: nowIso }, { onConflict: "organization_id", ignoreDuplicates: true })) as Result<null>;
    if (error) result.errors += 1;
    else result.created += 1;
  }

  for (const item of plan.warn) {
    const org = orgs.find((o) => o.id === item.organization_id);
    if (hostingExempt(org)) continue;
    // Claim first so two overlapping runs can never email the owner twice.
    const { data: claimed, error } = (await db
      .from("site_hosting_grace")
      .update({ warning_sent_at: nowIso, offline_after: item.offline_after, updated_at: nowIso })
      .eq("organization_id", item.organization_id)
      .is("warning_sent_at", null)
      .select("organization_id")) as Result<{ organization_id: string }[]>;
    if (error) {
      result.errors += 1;
      continue;
    }
    if (!claimed?.length) continue;
    try {
      // An unpublished site has nothing to take offline, so there is nothing to warn about.
      const { data: settings } = (await db
        .from("website_settings")
        .select("published")
        .eq("organization_id", item.organization_id)
        .maybeSingle()) as Result<{ published: boolean | null }>;
      if (settings?.published) {
        await options.warn(item.organization_id, item.offline_after);
        result.warned += 1;
      }
    } catch (error) {
      console.error("[site-hosting] warning failed", error instanceof Error ? error.message : "unknown");
      result.errors += 1;
      // Release the claim so the next run tries again (and the site stays up meanwhile).
      await db
        .from("site_hosting_grace")
        .update({ warning_sent_at: null, updated_at: nowIso })
        .eq("organization_id", item.organization_id);
    }
  }

  if (plan.takeOffline.length) {
    const { data, error } = (await db
      .from("site_hosting_grace")
      .update({ offline_at: nowIso, updated_at: nowIso })
      .in("organization_id", plan.takeOffline)
      .is("offline_at", null)
      .not("warning_sent_at", "is", null)
      .lte("offline_after", nowIso)
      .select("organization_id")) as Result<{ organization_id: string }[]>;
    if (error) result.errors += 1;
    else result.offline = (data ?? []).length;
  }

  return result;
}
