/**
 * Hosting after a cancellation (pure rules; the sweep lives in
 * site-hosting.server.ts).
 *
 * When a live subscription has ended (canceled by the owner, or canceled by
 * Stripe after failed payments) the public website stays online for
 * HOSTING_GRACE_DAYS more days. The owner is warned HOSTING_WARNING_DAYS
 * before it goes offline. After that the site answers with a neutral
 * "currently unavailable" page (410 + noindex) and leaves every sitemap, until
 * the workspace subscribes again. Demo and Revora-owned workspaces are exempt.
 *
 * Every owner gets the full warning: a subscription that ended long before
 * this rule existed is given at least HOSTING_WARNING_DAYS from the moment it
 * is first seen, never an instant takedown.
 */
import { isPlatformOwnerOrg } from "@/lib/platform-owner";

export const HOSTING_GRACE_DAYS = 14;
export const HOSTING_WARNING_DAYS = 3;
const DAY = 86_400_000;

/** Subscription states that keep (or bring back) a website. */
export const KEEPS_SITE_ONLINE = new Set(["active", "trialing", "past_due"]);

export type HostingSub = {
  organization_id: string;
  status: string;
  current_period_end: string | null;
  provider_subscription_id: string | null;
  updated_at?: string | null;
};

export type HostingGrace = {
  organization_id: string;
  ended_at: string;
  offline_after: string;
  warning_sent_at: string | null;
  offline_at: string | null;
};

export type HostingOrg = { id: string; is_demo?: boolean | null };

export type HostingPlan = {
  create: { organization_id: string; stripe_subscription_id: string | null; ended_at: string; offline_after: string }[];
  restore: string[];
  warn: { organization_id: string; offline_after: string }[];
  takeOffline: string[];
};

export function hostingExempt(org: HostingOrg | null | undefined): boolean {
  return !org || Boolean(org.is_demo) || isPlatformOwnerOrg(org.id);
}

/** When the website of a subscription that ended at `endedAt` goes offline. */
export function offlineAfter(endedAt: string, now: Date, graceDays = HOSTING_GRACE_DAYS): string {
  const grace = new Date(endedAt).getTime() + graceDays * DAY;
  const minimumNotice = now.getTime() + HOSTING_WARNING_DAYS * DAY;
  return new Date(Math.max(grace, minimumNotice)).toISOString();
}

/**
 * Decides what the sweep does. Only live-mode subscriptions are passed in.
 * A workspace's site is "ended" when none of its subscriptions keeps it
 * online and at least one canceled subscription's paid period is over.
 */
export function planHosting(input: {
  subs: HostingSub[];
  graces: HostingGrace[];
  orgs: HostingOrg[];
  now: Date;
}): HostingPlan {
  const nowIso = input.now.toISOString();
  const orgs = new Map(input.orgs.map((o) => [o.id, o]));
  const byOrg = new Map<string, HostingSub[]>();
  for (const sub of input.subs) {
    const list = byOrg.get(sub.organization_id) ?? [];
    list.push(sub);
    byOrg.set(sub.organization_id, list);
  }
  const graceByOrg = new Map(input.graces.map((g) => [g.organization_id, g]));
  const plan: HostingPlan = { create: [], restore: [], warn: [], takeOffline: [] };

  for (const grace of input.graces) {
    const subs = byOrg.get(grace.organization_id) ?? [];
    const exempt = orgs.has(grace.organization_id) && hostingExempt(orgs.get(grace.organization_id));
    if (exempt || subs.some((s) => KEEPS_SITE_ONLINE.has(s.status))) plan.restore.push(grace.organization_id);
  }
  const restored = new Set(plan.restore);

  for (const [orgId, subs] of byOrg) {
    if (graceByOrg.has(orgId)) continue;
    if (!orgs.has(orgId) || hostingExempt(orgs.get(orgId))) continue;
    if (subs.some((s) => KEEPS_SITE_ONLINE.has(s.status))) continue;
    const ended = subs
      .filter((s) => s.status === "canceled")
      .map((s) => ({ sub: s, at: s.current_period_end ?? s.updated_at ?? null }))
      .filter((e): e is { sub: HostingSub; at: string } => Boolean(e.at) && e.at! <= nowIso)
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (!ended) continue;
    plan.create.push({
      organization_id: orgId,
      stripe_subscription_id: ended.sub.provider_subscription_id,
      ended_at: ended.at,
      offline_after: offlineAfter(ended.at, input.now),
    });
  }

  const open = [
    ...input.graces.filter((g) => !restored.has(g.organization_id)),
    ...plan.create.map((c) => ({ ...c, warning_sent_at: null, offline_at: null })),
  ];
  const warnFrom = (offline: string) => new Date(offline).getTime() - HOSTING_WARNING_DAYS * DAY;
  for (const g of open) {
    if (g.offline_at) continue;
    if (!g.warning_sent_at) {
      // The owner is always warned first; a late warning moves the date out.
      if (input.now.getTime() >= warnFrom(g.offline_after)) {
        plan.warn.push({ organization_id: g.organization_id, offline_after: offlineAfter(g.offline_after, input.now, 0) });
      }
    } else if (g.offline_after <= nowIso) {
      plan.takeOffline.push(g.organization_id);
    }
  }
  return plan;
}
