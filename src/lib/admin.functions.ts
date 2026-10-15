import { createServerFn } from "@tanstack/react-start";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NewClientInput } from "@/lib/admin-types";
import { fetchAllRows } from "@/lib/paginate";

type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
type PublishState = Database["public"]["Enums"]["publish_state"];

/** Platform-wide metrics for the super admin dashboard. */
export const getPlatformMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [orgs, sites, leads, appts, plans] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, subscription_status, is_suspended, plan_id"),
      supabaseAdmin.from("website_settings").select("publish_state, domain_status"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin.from("plans").select("id, monthly_price"),
    ]);

    const orgRows = orgs.data ?? [];
    const priceOf = (id: string | null) =>
      Number((plans.data ?? []).find((p) => p.id === id)?.monthly_price ?? 0);

    return {
      clients: orgRows.length,
      active: orgRows.filter((o) => o.subscription_status === "active" && !o.is_suspended).length,
      suspended: orgRows.filter((o) => o.is_suspended).length,
      trialing: orgRows.filter((o) => o.subscription_status === "trialing").length,
      published: (sites.data ?? []).filter((s) => s.publish_state === "published").length,
      domainsLive: (sites.data ?? []).filter(
        (s) => s.domain_status === "connected" || s.domain_status === "ssl_active",
      ).length,
      leads30d: leads.count ?? 0,
      bookings30d: appts.count ?? 0,
      mrr: orgRows
        .filter((o) => o.subscription_status === "active" && !o.is_suspended)
        .reduce((sum, o) => sum + priceOf(o.plan_id), 0),
    };
  });

/** All client tenants with launch state. */
export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readiness } = await import("@/lib/readiness");

    const { data: orgs, error } = await supabaseAdmin
      .from("organizations")
      .select(
        "id, name, slug, industry, plan_id, subscription_status, is_suspended, is_demo, created_at, setup_paid_at, setup_checkout_session_id",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (orgs ?? []).map((o) => o.id);
    if (!ids.length) return [];

    const [profiles, sites, services, media, forms, leads, appts, events, subs, pays] =
      await Promise.all([
        supabaseAdmin.from("business_profiles").select("*").in("organization_id", ids),
        supabaseAdmin.from("website_settings").select("*").in("organization_id", ids),
        supabaseAdmin
          .from("services")
          .select("organization_id, bookable, is_active")
          .in("organization_id", ids),
        supabaseAdmin.from("media").select("organization_id").in("organization_id", ids),
        supabaseAdmin
          .from("quote_forms")
          .select("organization_id, is_active")
          .in("organization_id", ids),
        supabaseAdmin.from("leads").select("organization_id").in("organization_id", ids),
        supabaseAdmin.from("appointments").select("organization_id").in("organization_id", ids),
        // Read every event: a fixed ceiling silently understates readiness.
        fetchAllRows<{ organization_id: string }>((from, to) =>
          supabaseAdmin
            .from("analytics_events")
            .select("organization_id")
            .in("organization_id", ids)
            .range(from, to),
        ),
        // Financial truth is LIVE Stripe only.
        supabaseAdmin
          .from("subscriptions")
          .select(
            "organization_id, status, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, price_id",
          )
          .in("organization_id", ids)
          .eq("payment_provider", "stripe")
          .eq("environment", "live"),
        supabaseAdmin
          .from("payments")
          .select("organization_id, amount, status")
          .in("organization_id", ids)
          .eq("environment", "live"),
      ]);

    const countBy = (rows: { organization_id: string }[] | null, id: string) =>
      (rows ?? []).filter((r) => r.organization_id === id).length;

    return (orgs ?? []).map((org) => {
      const profile = (profiles.data ?? []).find((p) => p.organization_id === org.id) ?? null;
      const settings = (sites.data ?? []).find((s) => s.organization_id === org.id) ?? null;
      const orgServices = (services.data ?? []).filter((s) => s.organization_id === org.id);
      const score = readiness({
        profile,
        settings,
        servicesCount: orgServices.filter((s) => s.is_active).length,
        bookableCount: orgServices.filter((s) => s.bookable && s.is_active).length,
        mediaCount: countBy(media.data, org.id),
        quoteFormCount: (forms.data ?? []).filter(
          (f) => f.organization_id === org.id && f.is_active,
        ).length,
        analyticsCount: countBy(events.rows, org.id),
      }).score;

      const sub = (subs.data ?? []).find((s) => s.organization_id === org.id) ?? null;
      const orgPayments = (pays.data ?? []).filter((p) => p.organization_id === org.id);
      const paidTotal = orgPayments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + Number(p.amount), 0);

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        industry: org.industry,
        plan_id: org.plan_id,
        subscription_status: org.subscription_status,
        is_suspended: org.is_suspended,
        is_demo: org.is_demo,
        created_at: org.created_at,
        owner_name: profile?.owner_name ?? null,
        owner_email: profile?.owner_email ?? profile?.email ?? null,
        owner_phone: profile?.phone ?? null,
        city: profile?.city ?? null,
        custom_domain: settings?.custom_domain ?? null,
        domain_status: settings?.domain_status ?? "not_connected",
        domain_checked_at: settings?.domain_checked_at ?? null,
        domain_error: settings?.domain_error ?? null,
        publish_state: settings?.publish_state ?? "draft",

        // Billing
        setup_paid_at: org.setup_paid_at,
        setup_session_id: org.setup_checkout_session_id,
        subscription_state: sub?.status ?? null,
        stripe_customer_id: sub?.provider_customer_id ?? null,
        stripe_subscription_id: sub?.provider_subscription_id ?? null,
        current_period_end: sub?.current_period_end ?? null,
        cancel_at_period_end: Boolean(sub?.cancel_at_period_end),
        paid_total: paidTotal,
        payment_count: orgPayments.length,

        leads: countBy(leads.data, org.id),
        appointments: countBy(appts.data, org.id),
        readinessScore: score,
      };
    });
  });

/** Everything the admin needs for one client: profile, launch state, handoff, activity. */
export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input.organizationId),
  }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, DOMAIN_TARGET } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.organizationId;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
    const [
      org,
      profile,
      settings,
      social,
      services,
      media,
      pages,
      sectionRows,
      versions,
      quoteRequests,
      forms,
      leads,
      appts,
      events,
      team,
      sub,
      support,
    ] = await Promise.all([
      supabaseAdmin.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabaseAdmin.from("business_profiles").select("*").eq("organization_id", id).maybeSingle(),
      supabaseAdmin.from("website_settings").select("*").eq("organization_id", id).maybeSingle(),
      supabaseAdmin.from("social_profiles").select("*").eq("organization_id", id).maybeSingle(),
      supabaseAdmin.from("services").select("*").eq("organization_id", id).order("sort_order"),
      supabaseAdmin.from("media").select("id, url").eq("organization_id", id),
      supabaseAdmin
        .from("website_pages")
        .select("id, slug, title, kind, is_visible")
        .eq("organization_id", id)
        .order("sort_order"),
      supabaseAdmin.from("website_sections").select("id, page_id").eq("organization_id", id),
      supabaseAdmin
        .from("website_versions")
        .select("id, version, label, published_at, created_at")
        .eq("organization_id", id)
        .order("version", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("quote_requests")
        .select("id, created_at")
        .eq("organization_id", id)
        .limit(5000),
      supabaseAdmin.from("quote_forms").select("id, is_active").eq("organization_id", id),
      supabaseAdmin.from("leads").select("id, status, created_at").eq("organization_id", id),
      supabaseAdmin.from("appointments").select("id, status, starts_at").eq("organization_id", id),
      fetchAllRows<{ id: string; event_type: string; created_at: string }>((from, to) =>
        supabaseAdmin
          .from("analytics_events")
          .select("id, event_type, created_at")
          .eq("organization_id", id)
          .gte("created_at", since)
          .range(from, to),
      ),
      supabaseAdmin.from("memberships").select("id, role, user_id").eq("organization_id", id),

      // A workspace can legitimately have both a live and a sandbox row.
      supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("organization_id", id)
        .eq("payment_provider", "stripe")
        .eq("environment", "live")
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("support_sessions")
        .select("*")
        .eq("organization_id", id)
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    if (!org.data) throw new Error("That client no longer exists.");

    return {
      org: org.data,
      profile: profile.data,
      settings: settings.data,
      social: social.data,
      services: services.data ?? [],
      mediaCount: (media.data ?? []).length,
      quoteFormCount: (forms.data ?? []).filter((f) => f.is_active).length,
      leads: leads.data ?? [],
      appointments: appts.data ?? [],
      analyticsCount: events.rows.length,
      usage: (() => {
        const eventRows = events.rows;
        const leadRows = leads.data ?? [];
        const apptRows = appts.data ?? [];
        const days = Array.from({ length: 30 }, (_, i) =>
          new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
        );
        const visitsByDay = new Map<string, number>();
        for (const row of eventRows) {
          if (row.event_type !== "page_view") continue;
          const key = dayKey(row.created_at);
          visitsByDay.set(key, (visitsByDay.get(key) ?? 0) + 1);
        }
        const leadsByDay = new Map<string, number>();
        for (const row of leadRows) {
          const key = dayKey(row.created_at);
          leadsByDay.set(key, (leadsByDay.get(key) ?? 0) + 1);
        }
        const now = Date.now();
        return {
          pages: (pages.data ?? []).map((page) => ({
            ...page,
            sections: (sectionRows.data ?? []).filter((s) => s.page_id === page.id).length,
          })),
          versions: versions.data ?? [],
          quoteRequests30d: (quoteRequests.data ?? []).filter(
            (row) => new Date(row.created_at).getTime() >= now - 30 * 86_400_000,
          ).length,
          quoteRequestsTotal: (quoteRequests.data ?? []).length,
          leads30d: leadRows.filter(
            (row) => new Date(row.created_at).getTime() >= now - 30 * 86_400_000,
          ).length,
          bookingsUpcoming: apptRows.filter(
            (row) => new Date(row.starts_at).getTime() >= now && row.status !== "cancelled",
          ).length,
          bookingsTotal: apptRows.length,
          visitSeries: days.map((day) => visitsByDay.get(day) ?? 0),
          leadSeries: days.map((day) => leadsByDay.get(day) ?? 0),
        };
      })(),
      views30d: events.rows.filter((e) => e.event_type === "page_view").length,
      team: team.data ?? [],
      subscription: sub.data?.[0] ?? null,
      supportSessions: support.data ?? [],
      domainTarget: DOMAIN_TARGET,
    };
  });

/** Provisions a brand new isolated client tenant. */
export const createClientOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: NewClientInput) => {
    const name = String(input?.business_name ?? "").trim();
    const email = String(input?.owner_email ?? "").trim();
    if (name.length < 2) throw new Error("Enter the business name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid owner email.");
    if (!String(input?.owner_name ?? "").trim()) throw new Error("Enter the owner's name.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, provisionClient } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const result = await provisionClient(supabaseAdmin, data);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: result.organizationId,
      actor_id: context.userId,
      action: "client.created",
      entity: "organization",
      entity_id: result.organizationId,
      metadata: { business_name: data.business_name, owner_email: result.email },
    });

    return result;
  });

/** Suspend, reactivate, rename or re-plan a client. */
export const updateClientOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      name?: string;
      is_suspended?: boolean;
      plan_id?: string | null;
      subscription_status?: string;
      industry?: string | null;
    }) => {
      if (!input?.organizationId) throw new Error("Missing client.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Database["public"]["Tables"]["organizations"]["Update"] = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.is_suspended !== undefined) patch.is_suspended = data.is_suspended;
    if (data.plan_id !== undefined) patch.plan_id = data.plan_id;
    if (data.subscription_status !== undefined) {
      patch.subscription_status = data.subscription_status as SubscriptionStatus;
    }
    if (data.industry !== undefined) patch.industry = data.industry;

    const { error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);

    if (data.plan_id !== undefined || data.subscription_status !== undefined) {
      const subPatch: Database["public"]["Tables"]["subscriptions"]["Update"] = {};
      if (data.plan_id !== undefined) subPatch.plan_id = data.plan_id;
      if (data.subscription_status !== undefined) {
        subPatch.status = data.subscription_status as SubscriptionStatus;
      }
      // Admin edits only ever touch the canonical LIVE billing row.
      const { error: subError } = await supabaseAdmin
        .from("subscriptions")
        .update(subPatch)
        .eq("organization_id", data.organizationId)
        .eq("payment_provider", "stripe")
        .eq("environment", "live");
      if (subError) throw new Error(subError.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: data.is_suspended === true ? "client.suspended" : "client.updated",
      entity: "organization",
      entity_id: data.organizationId,
      metadata: patch as Record<string, never> as never,
    });

    return { ok: true };
  });

/** Saves a custom domain and immediately reports its verified state. */
export const setClientDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; domain: string }) => {
    if (!input?.organizationId) throw new Error("Missing client.");
    return { organizationId: String(input.organizationId), domain: String(input.domain ?? "") };
  })
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, checkDomain, isValidDomain, normalizeDomain, DOMAIN_TARGET } =
      await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const domain = normalizeDomain(data.domain);
    if (domain && !isValidDomain(domain))
      throw new Error("That doesn't look like a valid domain name.");

    const check = domain
      ? await checkDomain(domain)
      : {
          status: "not_connected" as const,
          detail: "No custom domain added.",
          dnsOk: false,
          sslOk: false,
          records: null,
        };

    const { error } = await supabaseAdmin
      .from("website_settings")
      .update({
        custom_domain: domain || null,
        domain_status: check.status,
        domain_error:
          check.status === "error" || check.status === "dns_pending" ? check.detail : null,
        domain_checked_at: new Date().toISOString(),
        domain_target: DOMAIN_TARGET,
        domain_verified: check.dnsOk,
        dns_ok: check.dnsOk,
        ssl_ok: check.sslOk,
        domain_records: check.records,
        ssl_active: check.sslOk,
      })
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    return { ...check, domain, target: DOMAIN_TARGET, live: check.dnsOk && check.sslOk };
  });

/** Re-checks DNS for the saved domain. Never optimistic. */
export const verifyClientDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input.organizationId),
  }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, checkDomain, DOMAIN_TARGET } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("website_settings")
      .select("custom_domain")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const domain = settings?.custom_domain ?? "";
    const check = await checkDomain(domain);

    await supabaseAdmin
      .from("website_settings")
      .update({
        domain_status: check.status,
        domain_error:
          check.status === "error" || check.status === "dns_pending" ? check.detail : null,
        domain_checked_at: new Date().toISOString(),
        domain_verified: check.dnsOk,
        dns_ok: check.dnsOk,
        ssl_ok: check.sslOk,
        domain_records: check.records,
        ssl_active: check.sslOk,
      })
      .eq("organization_id", data.organizationId);

    return { ...check, domain, target: DOMAIN_TARGET, live: check.dnsOk && check.sslOk };
  });

/** Starts an explicit, audited support session in a client's workspace. */
export const startSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; reason: string }) => {
    const reason = String(input?.reason ?? "").trim();
    if (!input?.organizationId) throw new Error("Missing client.");
    if (reason.length < 4) throw new Error("Describe why you need support access.");
    return { organizationId: String(input.organizationId), reason: reason.slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = (context.claims as { email?: string } | null)?.email ?? null;

    const { data: session, error } = await supabaseAdmin
      .from("support_sessions")
      .insert({
        organization_id: data.organizationId,
        admin_id: context.userId,
        admin_email: email,
        reason: data.reason,
      })
      .select("id, started_at, organization_id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: context.userId,
      action: "support.session_started",
      entity: "support_session",
      entity_id: session.id,
      metadata: { reason: data.reason, admin_email: email },
    });

    await supabaseAdmin.from("notifications").insert({
      organization_id: data.organizationId,
      title: "Support access started",
      body: `A platform support specialist entered your workspace: ${data.reason}`,
      kind: "system",
    });

    return session;
  });

/** Ends a support session and closes the audit record. */
export const endSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sessionId: string }) => ({ sessionId: String(input.sessionId) }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const endedAt = new Date().toISOString();
    const { data: session, error } = await supabaseAdmin
      .from("support_sessions")
      .update({ ended_at: endedAt })
      .eq("id", data.sessionId)
      .eq("admin_id", context.userId)
      .select("id, organization_id, started_at, ended_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) return { ok: true };

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: session.organization_id,
      actor_id: context.userId,
      action: "support.session_ended",
      entity: "support_session",
      entity_id: session.id,
      metadata: { started_at: session.started_at, ended_at: endedAt },
    });

    return { ok: true, ...session };
  });

/** Publishing lifecycle, callable by the platform admin for any client. */
export const setClientPublishState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; state: string }) => {
    const allowed = ["draft", "preview", "published", "unpublished"];
    if (!allowed.includes(String(input?.state))) throw new Error("Unknown publishing state.");
    return { organizationId: String(input.organizationId), state: String(input.state) };
  })
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("website_settings")
      .update({
        publish_state: data.state as PublishState,
        published: data.state === "published",
        ...(data.state === "published" ? { last_published_at: new Date().toISOString() } : {}),
      })
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Per-workspace monthly business report: revenue actually collected, leads,
 * bookings and website traffic for every client workspace.
 *
 * Super-admin only. Reads through supabaseAdmin because this is deliberately a
 * cross-tenant view — the only place in Revora where that is correct.
 */
export const getMonthlyBusinessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { months?: number } | undefined) => ({
    months: Math.max(1, Math.min(24, Math.trunc(Number(input?.months ?? 6)) || 6)),
  }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMonthlyReport, recentMonths, windowStart } = await import("@/lib/monthly-report");

    const months = recentMonths(data.months);
    const since = windowStart(months);

    const [payments, leads, bookings, traffic, orgs, sites] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("organization_id, amount, status, refunded_amount, completed_at, created_at")
        .gte("created_at", since),
      supabaseAdmin.from("leads").select("organization_id, created_at").gte("created_at", since),
      supabaseAdmin
        .from("appointments")
        .select("organization_id, created_at")
        .gte("created_at", since),
      supabaseAdmin
        .from("analytics_events")
        .select("organization_id, created_at, session_id, event_type")
        .eq("event_type", "page_view")
        .gte("created_at", since),
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug, industry, subscription_status, is_suspended, is_demo, created_at"),
      supabaseAdmin
        .from("website_settings")
        .select("organization_id, publish_state, custom_domain"),
    ]);

    const report = buildMonthlyReport({
      months,
      payments: payments.data ?? [],
      leads: leads.data ?? [],
      bookings: bookings.data ?? [],
      traffic: traffic.data ?? [],
    });

    const orgRows = orgs.data ?? [];
    const siteRows = sites.data ?? [];
    const workspaces = Object.fromEntries(
      orgRows.map((org) => {
        const site = siteRows.find((s) => s.organization_id === org.id);
        return [
          org.id,
          {
            name: org.name,
            slug: org.slug,
            industry: org.industry,
            status: org.subscription_status,
            suspended: org.is_suspended,
            demo: org.is_demo,
            createdAt: org.created_at,
            publishState: site?.publish_state ?? null,
            domain: site?.custom_domain ?? null,
          },
        ];
      }),
    );

    return { ...report, workspaces, generatedAt: new Date().toISOString() };
  });

/**
 * Read-only report of the canonical Revora offer plus what the payment provider
 * currently has on file. Revora's commercial offer is immutable ($350 setup +
 * $100/month with the first month free) and cannot be changed from the admin
 * dashboard — this function never writes.
 */
export const getOfferConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { GROWTH_SYSTEM } = await import("@/lib/offer");

    const environments: Array<{
      environment: "live" | "sandbox";
      setupAmount: number | null;
      monthlyAmount: number | null;
      reachable: boolean;
      matchesOffer: boolean;
    }> = [];

    for (const environment of ["live", "sandbox"] as const) {
      try {
        const { createStripeClient } = await import("@/lib/stripe.server");
        const stripe = createStripeClient(environment);
        const found = await stripe.prices.list({
          lookup_keys: [GROWTH_SYSTEM.setupPriceKey, GROWTH_SYSTEM.monthlyPriceKey],
          active: true,
          limit: 10,
        });
        const pick = (key: string) => {
          const price = found.data.find((p) => p.lookup_key === key);
          return typeof price?.unit_amount === "number" ? price.unit_amount / 100 : null;
        };
        const setupAmount = pick(GROWTH_SYSTEM.setupPriceKey);
        const monthlyAmount = pick(GROWTH_SYSTEM.monthlyPriceKey);
        environments.push({
          environment,
          setupAmount,
          monthlyAmount,
          reachable: true,
          matchesOffer:
            setupAmount === GROWTH_SYSTEM.setupPrice &&
            monthlyAmount === GROWTH_SYSTEM.monthlyPrice,
        });
      } catch {
        environments.push({
          environment,
          setupAmount: null,
          monthlyAmount: null,
          reachable: false,
          matchesOffer: false,
        });
      }
    }

    return {
      setupPrice: GROWTH_SYSTEM.setupPrice,
      monthlyPrice: GROWTH_SYSTEM.monthlyPrice,
      trialDays: GROWTH_SYSTEM.trialDays,
      fullAccessDays: GROWTH_SYSTEM.fullAccessTrialDays,
      locked: true as const,
      environments,
    };
  });

/**
 * Live platform activity: what actually happened across every client business
 * in the last few days. Every row comes from a stored record — nothing here is
 * estimated, and Revora's own internal pages never appear.
 */
export const getPlatformActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { limit?: number } | undefined) => ({
    limit: Math.min(60, Math.max(5, Number(input?.limit ?? 30) || 30)),
  }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const cap = data.limit;

    const [orgs, leads, appts, payments, versions] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, name, created_at, is_demo")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(cap),
      supabaseAdmin
        .from("leads")
        .select("id, organization_id, name, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(cap),
      supabaseAdmin
        .from("appointments")
        .select("id, organization_id, name, starts_at, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(cap),
      supabaseAdmin
        .from("payments")
        .select("id, organization_id, amount, status, environment, created_at")
        .eq("status", "completed")
        .eq("environment", "live")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(cap),
      supabaseAdmin
        .from("website_versions")
        .select("id, organization_id, label, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(cap),
    ]);

    const orgRows = orgs.data ?? [];
    const demoIds = new Set(orgRows.filter((o) => o.is_demo).map((o) => o.id));
    const names = new Map(orgRows.map((o) => [o.id, o.name]));

    type Item = {
      id: string;
      kind: "signup" | "lead" | "booking" | "payment" | "website";
      at: string;
      title: string;
      business: string | null;
    };

    const items: Item[] = [
      ...orgRows
        .filter((o) => !o.is_demo)
        .map<Item>((o) => ({
          id: `org-${o.id}`,
          kind: "signup",
          at: o.created_at,
          title: "New business joined",
          business: o.name,
        })),
      ...(leads.data ?? [])
        .filter((l) => !demoIds.has(l.organization_id))
        .map<Item>((l) => ({
          id: `lead-${l.id}`,
          kind: "lead",
          at: l.created_at,
          title: l.name ? `New enquiry from ${l.name}` : "New enquiry",
          business: names.get(l.organization_id) ?? null,
        })),
      ...(appts.data ?? [])
        .filter((a) => !demoIds.has(a.organization_id))
        .map<Item>((a) => ({
          id: `appt-${a.id}`,
          kind: "booking",
          at: a.created_at,
          title: a.name ? `${a.name} booked a time` : "New booking",
          business: names.get(a.organization_id) ?? null,
        })),
      ...(payments.data ?? [])
        .filter((p) => !demoIds.has(p.organization_id))
        .map<Item>((p) => ({
          id: `pay-${p.id}`,
          kind: "payment",
          at: p.created_at,
          title: `Payment received: $${Number(p.amount ?? 0).toFixed(2)}`,
          business: names.get(p.organization_id) ?? null,
        })),
      ...(versions.data ?? [])
        .filter((v) => !demoIds.has(v.organization_id))
        .map<Item>((v) => ({
          id: `ver-${v.id}`,
          kind: "website",
          at: v.created_at,
          title: v.label ? `Website updated: ${v.label}` : "Website updated",
          business: names.get(v.organization_id) ?? null,
        })),
    ]
      .filter((item) => Boolean(item.at))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, cap);

    return {
      items,
      windowDays: 14,
      counts: {
        signups: items.filter((i) => i.kind === "signup").length,
        leads: items.filter((i) => i.kind === "lead").length,
        bookings: items.filter((i) => i.kind === "booking").length,
        payments: items.filter((i) => i.kind === "payment").length,
        websiteChanges: items.filter((i) => i.kind === "website").length,
      },
    };
  });
