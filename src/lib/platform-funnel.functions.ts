/**
 * Authoritative Revora platform funnel.
 *
 * Every number here comes from database state that only the server can write:
 *
 *  - Unique sessions / page views  -> `marketing_conversions` page_view rows
 *                                    (browser telemetry, labelled as sessions,
 *                                    never presented as unique humans)
 *  - Accounts created              -> `platform_accounts`, one row per Supabase
 *                                    Auth user (primary key = user id)
 *  - Trials started                -> `platform_trials`, unique per workspace
 *  - Active trials                 -> workspace still trialing, not demo, not
 *                                    suspended, trial_ends_at in the future
 *  - Paid customers                -> verified Stripe subscription state in
 *                                    `subscriptions` (written only by the
 *                                    signature-verified webhook)
 *
 * A browser can never manufacture an account, a trial or a paid customer:
 * accounts are recorded from the authenticated user id, trials from a database
 * function, and paid state exclusively from Stripe webhooks.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { fetchAllRows } from "@/lib/paginate";

const clean = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};

/**
 * Records the authoritative "account created" row for the signed-in person.
 * Idempotent: the primary key is the auth user id, so repeated calls (refresh,
 * double click, retry, second device) can never add a second account.
 */
export const recordAccountCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input?: {
        landingPath?: string | null;
        referrer?: string | null;
        utmSource?: string | null;
        utmCampaign?: string | null;
      } | null,
    ) => ({
      landingPath: clean(input?.landingPath, 200),
      referrer: clean(input?.referrer, 300),
      utmSource: clean(input?.utmSource, 80),
      utmCampaign: clean(input?.utmCampaign, 120),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: context.userId,
        first_landing_path: data.landingPath,
        first_referrer: data.referrer,
        first_utm_source: data.utmSource,
        first_utm_campaign: data.utmCampaign,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[funnel] account_created insert failed", error.code ?? error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  });

/**
 * Idempotent, atomic workspace provisioning.
 * The database function creates organization + owner membership + business
 * profile + the authoritative trial row in one transaction, and returns the
 * existing workspace when the person already has one.
 */
export const provisionWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      industry?: string | null;
      email?: string | null;
      phone?: string | null;
      city?: string | null;
      state?: string | null;
      website?: string | null;
      description?: string | null;
    }) => ({
      name: clean(input?.name, 120) ?? "My business",
      industry: clean(input?.industry, 80),
      profile: {
        email: clean(input?.email, 160),
        phone: clean(input?.phone, 40),
        city: clean(input?.city, 80),
        state: clean(input?.state, 40),
        website: clean(input?.website, 200),
        description: clean(input?.description, 600),
      },
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: organizationId, error } = await supabaseAdmin.rpc("provision_workspace_server", {
      _user_id: context.userId,
      _name: data.name,
      ...(data.industry ? { _industry: data.industry } : {}),
      _profile: data.profile as never,
      _trial_days: GROWTH_SYSTEM.fullAccessTrialDays,
    });
    if (error || !organizationId) {
      console.error(
        "[funnel] provision_workspace failed",
        error?.code ?? error?.message ?? "empty",
      );
      throw new Error("We could not prepare your workspace. Please try again.");
    }
    return { organizationId: organizationId as string };
  });

/**
 * Where a number comes from:
 *  - "database": written by the server only (accounts, trials, payments). Exact.
 *  - "measured":  first-party browser measurement (page views, sessions,
 *                 visitors). Real traffic, but ad blockers and private windows
 *                 can hide some visits, so treat it as a floor, not a census.
 */
export type FunnelSource = "database" | "measured";

export interface FunnelStage {
  key: string;
  label: string;
  /** null means the underlying query failed — never render this as 0. */
  count: number | null;
  /** Percentage of the previous meaningful stage, or null when not applicable. */
  rate: number | null;
  rateLabel?: string | undefined;
  source: FunnelSource;
  /** Plain-language note shown under the number. */
  note?: string | undefined;
}

export interface PlatformFunnel {
  days: number;
  from: string;
  to: string;
  stages: FunnelStage[];
  /** Step-by-step conversion rates, as percentages. null = not computable. */
  rates: {
    visitorsToAccounts: number | null;
    accountsToTrials: number | null;
    trialsToPaid: number | null;
    visitorsToPaid: number | null;
  };
  /** Trials the payment webhook has confirmed turned into paid customers. */
  convertedTrials: number | null;
  /** Present only when at least one query failed. */
  errors: string[];
}

const pct = (numerator: number | null, denominator: number | null) => {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  const value = (numerator / denominator) * 100;
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

/**
 * Super-admin funnel: unique sessions -> accounts -> trials -> active trials ->
 * paid customers, for the selected UTC window. Demo workspaces are excluded
 * from every customer metric. A failed query returns `null` (rendered as
 * "Analytics unavailable"), never 0.
 */
export const getPlatformFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({
    days: Math.min(365, Math.max(1, Math.round(Number(input?.days ?? 30)))),
  }))
  .handler(async ({ context, data }): Promise<PlatformFunnel> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const to = new Date();
    const from = new Date(to.getTime() - data.days * 86_400_000);
    const since = from.toISOString();
    const errors: string[] = [];

    // 1. Page views, unique sessions and unique visitors (browser telemetry).
    //    A session is one browsing visit; a visitor is one browser, counted
    //    once however often it comes back (privacy-safe random id, no personal
    //    data). Rows recorded before visitor ids existed have none, so those
    //    sessions are added on so the visitor count is never understated.
    let sessions: number | null = null;
    let visitors: number | null = null;
    let views: number | null = null;
    {
      const { eventPath, isPublicMarketingPath } = await import("@/lib/marketing-paths");
      const seenSessions = new Set<string>();
      const seenVisitors = new Set<string>();
      let sessionsWithoutVisitor = new Set<string>();
      let count = 0;
      // Every page view in the window is counted — no page ceiling.
      const paged = await fetchAllRows<{
        session_id: string | null;
        visitor_id: string | null;
        landing_path: string | null;
        metadata: unknown;
      }>((from, to) =>
        supabaseAdmin
          .from("marketing_conversions")
          .select("session_id, visitor_id, landing_path, metadata")
          .eq("event_name", "page_view")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      const failed = Boolean(paged.error);
      if (failed) errors.push("sessions");
      for (const row of paged.rows) {
        // Revora's own admin/workspace screens are staff tools, not visits.
        if (!isPublicMarketingPath(eventPath(row))) continue;
        count += 1;
        if (row.session_id) seenSessions.add(row.session_id);
        if (row.visitor_id) seenVisitors.add(row.visitor_id);
        else if (row.session_id) sessionsWithoutVisitor.add(row.session_id);
      }

      if (!failed) {
        sessions = seenSessions.size;
        // Sessions that carry a visitor id must not be double counted.
        sessionsWithoutVisitor = new Set(
          [...sessionsWithoutVisitor].filter((id) => !seenVisitors.has(id)),
        );
        visitors = seenVisitors.size + sessionsWithoutVisitor.size;
        views = count;
      }
    }

    // 2. Accounts created (one row per Supabase Auth user). Auth is the source
    //    of truth, so reconcile first: every real sign-up gets exactly one row,
    //    and nothing is ever invented.
    const reconcile = await supabaseAdmin.rpc("sync_platform_accounts");
    if (reconcile.error) errors.push("accounts");
    const accountsQuery = await supabaseAdmin
      .from("platform_accounts")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", since);
    if (accountsQuery.error) errors.push("accounts");
    const accounts = accountsQuery.error ? null : (accountsQuery.count ?? 0);

    // 3/4. Trials — authoritative rows joined to non-demo workspaces.
    const trialRows = await supabaseAdmin
      .from("platform_trials")
      .select("organization_id, started_at, trial_ends_at, converted_at")
      .gte("started_at", since);

    const orgRows = await supabaseAdmin
      .from("organizations")
      .select("id, is_demo, is_suspended, subscription_status, trial_ends_at");
    if (trialRows.error) errors.push("trials");
    if (orgRows.error) errors.push("workspaces");

    const realOrgs = new Map(
      (orgRows.data ?? []).filter((o) => !o.is_demo).map((o) => [o.id, o] as const),
    );
    const trialsStarted =
      trialRows.error || orgRows.error
        ? null
        : new Set(
            (trialRows.data ?? [])
              .filter((t) => realOrgs.has(t.organization_id))
              .map((t) => t.organization_id),
          ).size;

    const now = Date.now();
    const activeTrials = orgRows.error
      ? null
      : [...realOrgs.values()].filter(
          (o) =>
            !o.is_suspended &&
            o.subscription_status === "trialing" &&
            o.trial_ends_at !== null &&
            new Date(o.trial_ends_at).getTime() > now,
        ).length;

    // 5. Paid customers — verified LIVE Stripe state only. A paid customer is a
    //    real (non-demo) workspace with a LIVE active subscription OR a
    //    completed LIVE setup payment. Sandbox rows are never counted.
    const subs = await supabaseAdmin
      .from("subscriptions")
      .select("organization_id, status, provider_subscription_id, created_at")
      .eq("payment_provider", "stripe")
      .eq("environment", "live");
    if (subs.error) errors.push("paid");

    const setupPayments = await fetchAllRows<{ organization_id: string | null }>((from, to) =>
      supabaseAdmin
        .from("payments")
        .select("organization_id")
        .eq("payment_provider", "stripe")
        .eq("environment", "live")
        .eq("status", "completed")
        .range(from, to),
    );
    if (setupPayments.error) errors.push("paid");

    const activeLiveSubscribers = new Set(
      (subs.data ?? [])
        .filter(
          (s) =>
            s.status === "active" && s.organization_id !== null && realOrgs.has(s.organization_id),
        )
        .map((s) => s.organization_id as string),
    );
    const paidOrgs = new Set(activeLiveSubscribers);
    for (const row of setupPayments.rows) {
      if (row.organization_id && realOrgs.has(row.organization_id))
        paidOrgs.add(row.organization_id);
    }
    const paid = subs.error || setupPayments.error || orgRows.error ? null : paidOrgs.size;

    // Trials in this window the payment webhook has confirmed converted.
    const convertedTrials =
      trialRows.error || orgRows.error
        ? null
        : new Set(
            (trialRows.data ?? [])
              .filter((t) => t.converted_at !== null && realOrgs.has(t.organization_id))
              .map((t) => t.organization_id),
          ).size;

    const stages: FunnelStage[] = [
      {
        key: "visitors",
        label: "Unique visitors",
        count: visitors,
        rate: null,
        rateLabel: views === null ? undefined : `${views} page views in total`,
        source: "measured",
        note: "Distinct browsers that opened a public page. Measured in the browser, so blocked scripts and private windows are not counted — read it as a minimum.",
      },
      {
        key: "sessions",
        label: "Unique sessions",
        count: sessions,
        rate: null,
        rateLabel: "browsing visits — one visitor can have several",
        source: "measured",
        note: "Separate browsing visits. One visitor coming back three times is three sessions.",
      },
      {
        key: "accounts",
        label: "Accounts created",
        count: accounts,
        rate: pct(accounts, visitors),
        rateLabel: "of unique visitors",
        source: "database",
        note: "One row per real sign-up, written by the server. Exact.",
      },
      {
        key: "trials",
        label: `${GROWTH_SYSTEM.fullAccessWindow} trials started`,
        count: trialsStarted,
        rate: pct(trialsStarted, accounts),
        rateLabel: "of accounts",
        source: "database",
        note: "One per workspace created, demo workspaces excluded. Exact.",
      },
      {
        key: "active_trials",
        label: "Active trials right now",
        count: activeTrials,
        rate: null,
        source: "database",
        note: "Trials that have not expired and are not suspended.",
      },
      {
        key: "paid",
        label: "Paid customers",
        count: paid,
        rate: pct(paid, trialsStarted),
        rateLabel: "of trials",
        source: "database",
        note: "Confirmed paid subscriptions written only by the verified payment webhook — never checkout starts.",
      },
    ];

    return {
      days: data.days,
      from: since,
      to: to.toISOString(),
      stages,
      rates: {
        visitorsToAccounts: pct(accounts, visitors),
        accountsToTrials: pct(trialsStarted, accounts),
        trialsToPaid: pct(convertedTrials ?? paid, trialsStarted),
        visitorsToPaid: pct(paid, visitors),
      },
      convertedTrials,
      errors,
    };
  });

export interface FunnelDetails {
  /** Per-day traffic, so the visitor and session stages can be opened up too. */
  traffic: { day: string; views: number; sessions: number; visitors: number }[];
  accounts: { id: string; createdAt: string }[];
  trials: {
    organizationId: string;
    name: string | null;
    startedAt: string;
    trialEndsAt: string;
    status: string;
    active: boolean;
  }[];
  paid: {
    organizationId: string;
    name: string | null;
    status: string;
    subscriptionId: string | null;
    customerId: string | null;
    since: string | null;
  }[];
}

/** Drill-down for each funnel stage. Ids and timestamps only — no PII. */
export const getFunnelDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { days?: number }) => ({
    days: Math.min(365, Math.max(1, Math.round(Number(input?.days ?? 30)))),
  }))
  .handler(async ({ context, data }): Promise<FunnelDetails> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    // Every drill-down list is read to exhaustion: a fixed ceiling would quietly
    // hide real accounts, trials or traffic from the report.
    const [trafficRes, accountsRes, trialsRes, orgsRes, subsRes] = await Promise.all([
      fetchAllRows<{
        created_at: string;
        session_id: string | null;
        visitor_id: string | null;
        landing_path: string | null;
        metadata: unknown;
      }>((from, to) =>
        supabaseAdmin
          .from("marketing_conversions")
          .select("created_at, session_id, visitor_id, landing_path, metadata")
          .eq("event_name", "page_view")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),

      fetchAllRows<{ user_id: string; created_at: string }>((from, to) =>
        supabaseAdmin
          .from("platform_accounts")
          .select("user_id, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      fetchAllRows<{ organization_id: string; started_at: string; trial_ends_at: string }>(
        (from, to) =>
          supabaseAdmin
            .from("platform_trials")
            .select("organization_id, started_at, trial_ends_at")
            .gte("started_at", since)
            .order("started_at", { ascending: false })
            .range(from, to),
      ),
      supabaseAdmin
        .from("organizations")
        .select("id, name, is_demo, is_suspended, subscription_status, trial_ends_at"),
      // Paid drill-down is verified LIVE Stripe state only — sandbox rows are
      // bookkeeping, never customers.
      supabaseAdmin
        .from("subscriptions")
        .select(
          "organization_id, status, provider_subscription_id, provider_customer_id, current_period_start, created_at",
        )
        .eq("payment_provider", "stripe")
        .eq("environment", "live"),
    ]);

    const firstError =
      trafficRes.error ?? accountsRes.error ?? trialsRes.error ?? orgsRes.error ?? subsRes.error;
    if (firstError) {
      console.error("[funnel] details query failed", firstError.code ?? firstError.message);
      throw new Error("Analytics unavailable");
    }

    const orgs = new Map((orgsRes.data ?? []).map((o) => [o.id, o] as const));
    const now = Date.now();

    // Group traffic by UTC day: page views, distinct sessions, distinct visitors.
    const { eventPath, isPublicMarketingPath } = await import("@/lib/marketing-paths");
    const byDay = new Map<
      string,
      { views: number; sessions: Set<string>; visitors: Set<string> }
    >();
    for (const row of trafficRes.rows) {
      if (!isPublicMarketingPath(eventPath(row))) continue;
      const day = row.created_at.slice(0, 10);

      const bucket = byDay.get(day) ?? {
        views: 0,
        sessions: new Set<string>(),
        visitors: new Set<string>(),
      };
      bucket.views += 1;
      if (row.session_id) bucket.sessions.add(row.session_id);
      if (row.visitor_id) bucket.visitors.add(row.visitor_id);
      else if (row.session_id) bucket.visitors.add(`session:${row.session_id}`);
      byDay.set(day, bucket);
    }

    return {
      traffic: [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, bucket]) => ({
          day,
          views: bucket.views,
          sessions: bucket.sessions.size,
          visitors: bucket.visitors.size,
        })),
      accounts: accountsRes.rows.map((a) => ({ id: a.user_id, createdAt: a.created_at })),
      trials: trialsRes.rows
        .filter((t) => orgs.get(t.organization_id) && !orgs.get(t.organization_id)!.is_demo)
        .map((t) => {
          const org = orgs.get(t.organization_id)!;
          return {
            organizationId: t.organization_id,
            name: org.name,
            startedAt: t.started_at,
            trialEndsAt: t.trial_ends_at,
            status: org.subscription_status,
            active:
              !org.is_suspended &&
              org.subscription_status === "trialing" &&
              new Date(t.trial_ends_at).getTime() > now,
          };
        }),
      paid: (subsRes.data ?? [])
        .filter(
          (s) =>
            s.status === "active" &&
            s.organization_id !== null &&
            orgs.get(s.organization_id) &&
            !orgs.get(s.organization_id)!.is_demo,
        )
        .map((s) => ({
          organizationId: s.organization_id as string,
          name: orgs.get(s.organization_id as string)?.name ?? null,
          status: s.status,
          subscriptionId: s.provider_subscription_id,
          customerId: s.provider_customer_id,
          since: s.current_period_start ?? s.created_at,
        })),
    };
  });
