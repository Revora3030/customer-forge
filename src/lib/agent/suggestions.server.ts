/**
 * PAI-21: proactive suggestions. A daily pass per workspace:
 *  1. collect cheap SQL signals (counts and dates only, no model);
 *  2. if nothing fired, stop: zero model calls;
 *  3. otherwise word each fired signal (model optional, facts fallback), keep at
 *     most 3 live, and skip any signal the owner dismissed or snoozed recently.
 * "Do it" never acts on its own. It only asks the owner for an approval
 * (agent_approvals); the run starts after that tap is consumed, and any
 * customer-facing step inside the run still needs its own approval.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeApproval, requestApproval, type ApprovalDeps } from "./approvals.server";

export const MAX_ACTIVE_SUGGESTIONS = 3;
export const DISMISS_DAYS = 14;
export const SUGGESTION_TOOL = "suggestion.start_run";
const DAY = 86_400_000;

export type SignalKind =
  | "unanswered_leads"
  | "no_review_asks"
  | "empty_hours"
  | "domain_unverified"
  | "traffic_drop"
  | "stale_site";

/** Facts read from the workspace. `undefined`/`null` means "unknown": the signal never fires on unknown data. */
export type SignalSnapshot = {
  now: Date;
  /** Leads still status "new" created more than 24 h ago. */
  unansweredLeads?: { count: number; oldestAt: string | null; ids: string[] } | null;
  /** Last time the business asked a customer for a review. null = known never; undefined = no data source. */
  lastReviewAskAt?: string | null;
  reviewAsksKnown?: boolean;
  /** Open hours in the next 7 days and booked appointments in them. */
  openDaysNext7?: number | null;
  bookingsNext7?: number | null;
  domain?: { customDomain: string | null; verified: boolean; status: string | null } | null;
  /** Page views in the last 7 days and the 7 before. */
  views?: { last7: number; prior7: number } | null;
  lastPublishedAt?: string | null;
};

export type FiredSignal = {
  signal: SignalKind;
  /** Plain facts, shown as "why" and stored as evidence. */
  evidence: Record<string, unknown>;
  title: string;
  body: string;
  actionGoal: string;
};

const days = (from: string, now: Date) => Math.floor((now.getTime() - new Date(from).getTime()) / DAY);

/** Pure: which signals fire, in priority order. Never calls a model. */
export function detectSignals(s: SignalSnapshot): FiredSignal[] {
  const out: FiredSignal[] = [];
  const u = s.unansweredLeads;
  if (u && u.count > 0) {
    out.push({
      signal: "unanswered_leads",
      evidence: { count: u.count, oldestAt: u.oldestAt, leadIds: u.ids.slice(0, 10) },
      title: `${u.count} lead${u.count === 1 ? "" : "s"} waiting over 24 hours`,
      body: `${u.count} new lead${u.count === 1 ? " has" : "s have"} had no reply for more than a day.`,
      actionGoal: "Draft a reply to each lead that has waited more than 24 hours. Ask me before sending anything.",
    });
  }
  if (s.reviewAsksKnown) {
    const since = s.lastReviewAskAt ? days(s.lastReviewAskAt, s.now) : null;
    if (since === null || since >= 30) {
      out.push({
        signal: "no_review_asks",
        evidence: { lastReviewAskAt: s.lastReviewAskAt ?? null, daysSince: since },
        title: "No review requests in 30 days",
        body: since === null ? "You haven't asked any customer for a review yet." : `Your last review request went out ${since} days ago.`,
        actionGoal: "Pick recent happy customers and draft review requests. Ask me before sending any.",
      });
    }
  }
  if (typeof s.openDaysNext7 === "number" && s.openDaysNext7 > 0 && s.bookingsNext7 === 0) {
    out.push({
      signal: "empty_hours",
      evidence: { openDaysNext7: s.openDaysNext7, bookingsNext7: 0 },
      title: "Nothing booked in the next 7 days",
      body: `You're open ${s.openDaysNext7} day${s.openDaysNext7 === 1 ? "" : "s"} this week and have no bookings.`,
      actionGoal: "Suggest ways to fill this week's open hours, such as a short offer for past customers. Ask me before sending anything.",
    });
  }
  const d = s.domain;
  if (d && d.customDomain && !d.verified) {
    out.push({
      signal: "domain_unverified",
      evidence: { customDomain: d.customDomain, status: d.status },
      title: "Your domain isn't connected yet",
      body: `${d.customDomain} is added but not verified, so visitors can't reach your site there.`,
      actionGoal: `Check the DNS records for ${d.customDomain} and tell me exactly what to change.`,
    });
  }
  const v = s.views;
  if (v && v.prior7 >= 20 && v.last7 <= v.prior7 * 0.6) {
    const drop = Math.round((1 - v.last7 / v.prior7) * 100);
    out.push({
      signal: "traffic_drop",
      evidence: { last7: v.last7, prior7: v.prior7, dropPercent: drop },
      title: `Site visits down ${drop}% this week`,
      body: `${v.last7} visits in the last 7 days, compared with ${v.prior7} the week before.`,
      actionGoal: "Look into why site visits dropped this week and suggest fixes.",
    });
  }
  if (s.lastPublishedAt && days(s.lastPublishedAt, s.now) >= 90) {
    const age = days(s.lastPublishedAt, s.now);
    out.push({
      signal: "stale_site",
      evidence: { lastPublishedAt: s.lastPublishedAt, daysSince: age },
      title: "Your site hasn't changed in 3 months",
      body: `The last publish was ${age} days ago.`,
      actionGoal: "Suggest fresh updates for my site (photos, services, seasonal info). Don't publish without asking me.",
    });
  }
  return out;
}

export type SuggestionRow = {
  id: string;
  organization_id: string;
  signal: SignalKind;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  action_goal: string;
  status: "active" | "accepted" | "dismissed" | "snoozed" | "resolved";
  approval_id: string | null;
  suppressed_until: string | null;
  created_at: string;
};

export interface SuggestionRepo {
  collect(organizationId: string, now: Date): Promise<SignalSnapshot>;
  /** Active rows plus dismissed/snoozed rows whose suppressed_until is still in the future. */
  current(organizationId: string, now: Date): Promise<SuggestionRow[]>;
  insert(organizationId: string, s: FiredSignal): Promise<void>;
  resolve(ids: string[]): Promise<void>;
  get(organizationId: string, id: string): Promise<SuggestionRow | null>;
  update(id: string, patch: Partial<Pick<SuggestionRow, "status" | "approval_id" | "suppressed_until">>): Promise<void>;
}

/** Optional wording pass. Only called when at least one signal fired; must not change facts. */
export type Wording = (fired: FiredSignal[]) => Promise<Array<{ title?: string; body?: string }>>;

export type PassResult = { fired: number; created: number; resolved: number; modelCalls: number };

export async function runSuggestionPass(
  repo: SuggestionRepo,
  organizationId: string,
  opts: { now?: Date; word?: Wording } = {},
): Promise<PassResult> {
  const now = opts.now ?? new Date();
  const fired = detectSignals(await repo.collect(organizationId, now));
  const current = await repo.current(organizationId, now);
  const active = current.filter((r) => r.status === "active");
  const firedKinds = new Set(fired.map((f) => f.signal));
  // A live suggestion whose signal no longer fires is resolved.
  const stale = active.filter((r) => !firedKinds.has(r.signal)).map((r) => r.id);
  if (stale.length) await repo.resolve(stale);
  if (!fired.length) return { fired: 0, created: 0, resolved: stale.length, modelCalls: 0 };

  const blocked = new Set(current.map((r) => r.signal)); // active, or dismissed/snoozed and still suppressed
  const room = MAX_ACTIVE_SUGGESTIONS - active.filter((r) => firedKinds.has(r.signal)).length;
  const fresh = fired.filter((f) => !blocked.has(f.signal)).slice(0, Math.max(0, room));
  if (!fresh.length) return { fired: fired.length, created: 0, resolved: stale.length, modelCalls: 0 };

  let worded = fresh;
  let modelCalls = 0;
  if (opts.word) {
    modelCalls = 1;
    try {
      const w = await opts.word(fresh);
      worded = fresh.map((f, i) => ({
        ...f,
        title: (w[i]?.title ?? "").trim().slice(0, 120) || f.title,
        body: (w[i]?.body ?? "").trim().slice(0, 600) || f.body,
      }));
    } catch {
      worded = fresh; // facts-only wording is always available
    }
  }
  for (const f of worded) await repo.insert(organizationId, f);
  return { fired: fired.length, created: worded.length, resolved: stale.length, modelCalls };
}

export type SuggestionActionResult = { ok: true; approvalId?: string } | { ok: false; reason: string; message: string };

/** Dismiss: hidden, and the same signal can't come back for 14 days. */
export async function dismissSuggestion(repo: SuggestionRepo, organizationId: string, id: string, now = new Date()): Promise<SuggestionActionResult> {
  const row = await repo.get(organizationId, id);
  if (!row) return { ok: false, reason: "not_found", message: "That suggestion doesn't exist." };
  await repo.update(id, { status: "dismissed", suppressed_until: new Date(now.getTime() + DISMISS_DAYS * DAY).toISOString() });
  return { ok: true };
}

export async function snoozeSuggestion(repo: SuggestionRepo, organizationId: string, id: string, snoozeDays: number, now = new Date()): Promise<SuggestionActionResult> {
  const row = await repo.get(organizationId, id);
  if (!row) return { ok: false, reason: "not_found", message: "That suggestion doesn't exist." };
  const n = Math.min(30, Math.max(1, Math.floor(snoozeDays)));
  await repo.update(id, { status: "snoozed", suppressed_until: new Date(now.getTime() + n * DAY).toISOString() });
  return { ok: true };
}

const approvalArgs = (row: SuggestionRow) => ({ suggestionId: row.id, signal: row.signal, goal: row.action_goal });

/** "Do it": only creates an owner approval. Nothing runs yet. */
export async function acceptSuggestion(
  repo: SuggestionRepo,
  approvals: ApprovalDeps,
  organizationId: string,
  id: string,
  userId: string | null,
): Promise<SuggestionActionResult> {
  const row = await repo.get(organizationId, id);
  if (!row || row.status !== "active") return { ok: false, reason: "not_found", message: "That suggestion isn't active any more." };
  const res = await requestApproval(approvals, {
    organizationId,
    tool: SUGGESTION_TOOL,
    args: approvalArgs(row),
    summary: `Start: ${row.title}`,
    requestedBy: userId,
  });
  if (!res.ok) return res;
  await repo.update(id, { status: "accepted", approval_id: res.approval.id });
  return { ok: true, approvalId: res.approval.id };
}

/** After the owner approved: consume the approval (exact args) and start the run. */
export async function startApprovedSuggestion(
  repo: SuggestionRepo,
  approvals: ApprovalDeps,
  organizationId: string,
  id: string,
  startRun: (goal: string, meta: { suggestionId: string; signal: SignalKind }) => Promise<{ runId: string }>,
): Promise<{ ok: true; runId: string } | { ok: false; reason: string; message: string }> {
  const row = await repo.get(organizationId, id);
  if (!row || row.status !== "accepted" || !row.approval_id) {
    return { ok: false, reason: "not_accepted", message: "Tap \"Do it\" first." };
  }
  const consumed = await consumeApproval(approvals, {
    organizationId,
    tool: SUGGESTION_TOOL,
    args: approvalArgs(row),
    approvalId: row.approval_id,
  });
  if (!consumed.ok) return consumed;
  const { runId } = await startRun(row.action_goal, { suggestionId: row.id, signal: row.signal });
  await repo.update(id, { status: "resolved" });
  return { ok: true, runId };
}

/* ------------------------------ Supabase repo ------------------------------ */

const COLS = "id, organization_id, signal, title, body, evidence, action_goal, status, approval_id, suppressed_until, created_at";
type Q = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Service-role repo for the daily pass. Every query is filtered by organization_id. */
export function supabaseSuggestionRepo(admin: SupabaseClient | unknown): SuggestionRepo {
  const db = admin as SupabaseClient & { from: (t: string) => Q };
  const fail = (what: string) => (e: unknown) => {
    if (e) throw new Error(`Couldn't ${what}.`);
  };
  return {
    async collect(org, now) {
      const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
      const ahead = new Date(now.getTime() + 7 * DAY).toISOString();
      const [leads, appts, profile, site, last7, prior7] = await Promise.all([
        db.from("leads").select("id, created_at").eq("organization_id", org).eq("status", "new").lt("created_at", iso(DAY)).order("created_at").limit(50),
        db.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("starts_at", now.toISOString()).lt("starts_at", ahead),
        db.from("business_profiles").select("hours").eq("organization_id", org).maybeSingle(),
        db.from("website_settings").select("custom_domain, domain_verified, domain_status, last_published_at").eq("organization_id", org).maybeSingle(),
        db.from("analytics_events").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("event_type", "page_view").gte("created_at", iso(7 * DAY)),
        db.from("analytics_events").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("event_type", "page_view").gte("created_at", iso(14 * DAY)).lt("created_at", iso(7 * DAY)),
      ]);
      const leadRows = (leads.error ? null : leads.data) as Array<{ id: string; created_at: string }> | null;
      const s = site.error
        ? null
        : (site.data as { custom_domain: string | null; domain_verified: boolean; domain_status: string | null; last_published_at: string | null } | null);
      return {
        now,
        unansweredLeads: leadRows ? { count: leadRows.length, oldestAt: leadRows[0]?.created_at ?? null, ids: leadRows.map((l) => l.id) } : null,
        // No tenant review-request table exists yet (review_requests is prospecting data), so this signal stays off.
        reviewAsksKnown: false,
        openDaysNext7: profile.error ? null : openDays((profile.data as { hours?: unknown } | null)?.hours, now),
        bookingsNext7: appts.error ? null : (appts.count ?? null),
        domain: s ? { customDomain: s.custom_domain ?? null, verified: !!s.domain_verified, status: s.domain_status ?? null } : null,
        views: last7.error || prior7.error ? null : { last7: last7.count ?? 0, prior7: prior7.count ?? 0 },
        lastPublishedAt: s?.last_published_at ?? null,
      };
    },
    async current(org, now) {
      const { data, error } = await db
        .from("agent_suggestions")
        .select(COLS)
        .eq("organization_id", org)
        .or(`status.eq.active,and(status.in.(dismissed,snoozed),suppressed_until.gt.${now.toISOString()})`)
        .limit(100);
      fail("read suggestions")(error);
      return (data ?? []) as SuggestionRow[];
    },
    async insert(org, f) {
      const { error } = await db.from("agent_suggestions").insert({
        organization_id: org, signal: f.signal, title: f.title, body: f.body, evidence: f.evidence, action_goal: f.actionGoal,
      });
      // A racing pass may already have inserted the same live signal (unique index); that's fine.
      if (error && (error as { code?: string }).code !== "23505") throw new Error("Couldn't save a suggestion.");
    },
    async resolve(ids) {
      const { error } = await db.from("agent_suggestions").update({ status: "resolved", updated_at: new Date().toISOString() }).in("id", ids).eq("status", "active");
      fail("resolve suggestions")(error);
    },
    async get(org, id) {
      const { data, error } = await db.from("agent_suggestions").select(COLS).eq("organization_id", org).eq("id", id).maybeSingle();
      fail("read the suggestion")(error);
      return (data ?? null) as SuggestionRow | null;
    },
    async update(id, patch) {
      const { error } = await db.from("agent_suggestions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      fail("update the suggestion")(error);
    },
  };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Days in the next 7 with stored, non-closed hours. null when hours are unreadable. */
export function openDays(hours: unknown, now: Date): number | null {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const h = hours as Record<string, unknown>;
  const keyed = (k: string) => h[k] ?? h[k.slice(0, 3)] ?? h[{ sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" }[k]!];
  if (!DAY_KEYS.some((k) => keyed(k) !== undefined)) return null;
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    const v = keyed(DAY_KEYS[new Date(now.getTime() + i * DAY).getUTCDay()]!);
    if (v && typeof v === "object" && !(v as { closed?: boolean }).closed) n += 1;
  }
  return n;
}
